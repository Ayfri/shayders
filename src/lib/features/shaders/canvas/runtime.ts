import { THUMB_SIZE } from '#features/shaders/model/shader-domain.js';
import type { ChannelEntry, ShaderBuffer } from '#features/shaders/model/shader-content.js';
import { ChannelTextureManager } from './channel-textures.js';
import {
	attachPingPong,
	buildLocs,
	buildProgram,
	createFbo,
	createQuadBuffer,
	enableShaderExtensions,
	FLOAT_TEXTURE_TYPE,
	type InternalBufState,
	listUserBufferIds,
	type ProgramLocs,
	renderPasses,
	resizeBufferTextures,
	UNSIGNED_BYTE_TEXTURE_TYPE,
} from './gl-utils.js';
import { analyzeLiterals, LITERAL_UNIFORM, type LiteralLayout } from './literal-layout.js';
import { ProgramCompiler } from './program-compiler.js';

interface RuntimeOptions {
	getBuffers: () => ShaderBuffer[];
	getCanvas: () => HTMLCanvasElement | null;
	getChannels: () => ChannelEntry[];
	getBufferPreviewsEnabled: () => boolean;
	updateBuildTime: (value: number) => void;
	updateError: (value: string) => void;
	updateThumbnails: (value: Record<string, string>) => void;
	updateUniformValues: (value: Record<string, string>) => void;
}

const THUMBNAIL_CAPTURE_INTERVAL_MS = 400;
/** The uniform readout is for humans, refreshing it every frame only re-renders the panel 60 times a second. */
const UNIFORM_READOUT_INTERVAL_MS = 100;
/** Fragment uniform vectors kept free for user uniforms, channels and buffers when sizing the literal array. */
const RESERVED_UNIFORM_VECTORS = 64;

interface RealProgram {
	layout: LiteralLayout;
	locs: ProgramLocs;
	program: WebGLProgram;
}

interface LiteralProgram {
	key: string;
	locs: ProgramLocs;
	program: WebGLProgram;
	values: WebGLUniformLocation | null;
}

/**
 * A buffer pass drawing either its constant-folded `real` program or the `literal` variant fed new values through uniforms.
 * Every shown or failed compile takes a sequence number so a slow compile never replaces a newer result.
 */
interface Pass extends InternalBufState {
	/** Only one real compile runs per pass, newer sources wait in `queuedSource` so drags and typing never pile up compiles. */
	compiling: boolean;
	error: { message: string; seq: number; source: string } | null;
	latestSource: string;
	literal: LiteralProgram | null;
	literalPendingKey: string;
	queuedSource: string;
	real: RealProgram | null;
	requestedSource: string;
	shownSeq: number;
	shownSource: string;
}

export class ShaderCanvasRuntime {
	private animationId = 0;
	private readonly passes = new Map<string, Pass>();
	private readonly channelTextures: ChannelTextureManager;
	private compiler: ProgramCompiler | null = null;
	private compileSeq = 0;
	private literalBudget = 0;
	private thumbFbo: WebGLFramebuffer | null = null;
	private thumbLocPosition = -1;
	private thumbLocTex: WebGLUniformLocation | null = null;
	private thumbProgram: WebGLProgram | null = null;
	private thumbTexture: WebGLTexture | null = null;
	private fboHeight = 0;
	private fboTexType = UNSIGNED_BYTE_TEXTURE_TYPE;
	private fboWidth = 0;
	private gl: WebGLRenderingContext | null = null;
	private lastFrameTime = 0;
	private lastThumbTime = 0;
	private lastUniformReadoutTime = 0;
	private frameCount = 0;
	private fps = 0;
	private readonly thumbnailCache: Record<string, string> = {};
	private thumbnailCursor = 0;
	private thumbnailGenerationPending = false;
	private thumbnailOutputCanvas: HTMLCanvasElement | null = null;
	private thumbnailOutputContext: CanvasRenderingContext2D | null = null;
	private quadBuffer: WebGLBuffer | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private startTime = Date.now();
	private isMouseDown = false;
	private mouseX = 0;
	private mouseY = 0;

	public constructor(private readonly options: RuntimeOptions) {
		this.channelTextures = new ChannelTextureManager(
			() => this.options.getChannels(),
			() => this.gl,
		);
	}

	public destroy(): void {
		cancelAnimationFrame(this.animationId);
		if (this.gl) {
			if (this.thumbProgram) this.gl.deleteProgram(this.thumbProgram);
			if (this.thumbFbo) this.gl.deleteFramebuffer(this.thumbFbo);
			if (this.thumbTexture) this.gl.deleteTexture(this.thumbTexture);
		}
		this.thumbProgram = null;
		this.thumbFbo = null;
		this.thumbTexture = null;
		this.thumbLocPosition = -1;
		this.thumbLocTex = null;
		this.revokeThumbnailUrls();
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.channelTextures.destroy();
		for (const [id, pass] of this.passes) this.destroyPass(id, pass);
		this.compiler?.destroy();
		this.compiler = null;
		if (!this.gl) return;
		if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
		this.quadBuffer = null;
	}

	public mount(canvas: HTMLCanvasElement): void {
		this.gl = canvas.getContext('webgl', {
			alpha: false,
			antialias: false,
			depth: false,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: false,
			stencil: false,
		});
		if (!this.gl) return;

		enableShaderExtensions(this.gl);
		if (this.gl.getExtension('OES_texture_float')) {
			this.gl.getExtension('OES_texture_float_linear');
			this.fboTexType = FLOAT_TEXTURE_TYPE;
		}
		this.compiler = new ProgramCompiler(this.gl);
		this.literalBudget = this.gl.getParameter(this.gl.MAX_FRAGMENT_UNIFORM_VECTORS) - RESERVED_UNIFORM_VECTORS;

		this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
		this.resizeObserver.observe(canvas);
		this.syncCanvasSize();
		this.channelTextures.sync();
		this.run();
	}

	/**
	 * Compiles every buffer whose source changed, the last working program stays on screen until its replacement links.
	 * `resetTime` also restarts the clock and clears the feedback buffers.
	 */
	public run(resetTime = true, buffers = this.options.getBuffers()): void {
		if (!this.gl || !this.compiler) return;

		cancelAnimationFrame(this.animationId);
		if (resetTime) {
			this.startTime = Date.now();
			this.frameCount = 0;
			this.fps = 0;
			this.lastFrameTime = 0;
			this.fboHeight = 0;
			this.fboWidth = 0;
		}

		const renderOrder = [...listUserBufferIds(buffers), 'image'];
		for (const [id, pass] of this.passes) {
			if (!renderOrder.includes(id)) this.destroyPass(id, pass);
		}
		for (const id of renderOrder) {
			const buffer = buffers.find((candidate) => candidate.id === id);
			if (!buffer) continue;
			const source = sourceOf(buffers, buffer);
			const pass = this.passes.get(id) ?? this.createPass(id);
			pass.latestSource = source;
			if (pass.compiling) pass.queuedSource = source;
			else if (pass.requestedSource !== source) void this.compileReal(id, pass, source, buffer.label);
		}

		this.publishErrors();
		if (!this.quadBuffer) this.quadBuffer = createQuadBuffer(this.gl);
		this.animationId = requestAnimationFrame(() => this.renderFrame());
	}

	/**
	 * Applies edits touching only function-body float literals, comments or whitespace without compiling anything.
	 * @returns false when some buffer needs a real compile.
	 */
	public hotUpdate(buffers: ShaderBuffer[]): boolean {
		const start = performance.now();
		let hot = true;
		let swapped = false;
		for (const [id, pass] of this.passes) {
			const buffer = buffers.find((candidate) => candidate.id === id);
			if (!buffer) {
				hot = false;
				continue;
			}
			const source = sourceOf(buffers, buffer);
			const previous = pass.latestSource;
			pass.latestSource = source;
			if (source === pass.shownSource) {
				if (previous !== source) pass.shownSeq = ++this.compileSeq;
			} else if (source !== previous && this.applyHot(pass, source)) {
				swapped = true;
			} else {
				hot = false;
			}
		}

		if (swapped) this.options.updateBuildTime(performance.now() - start);
		this.publishErrors();
		return hot;
	}

	public setMouse(position: { x: number; y: number }): void {
		this.mouseX = position.x;
		this.mouseY = position.y;
	}

	public setMouseDown(value: boolean): void {
		this.isMouseDown = value;
	}

	public syncChannels(): void {
		if (this.gl) this.channelTextures.sync();
	}

	private applyHot(pass: Pass, source: string): boolean {
		if (!this.gl) return false;
		const layout = analyzeLiterals(source);
		const { literal, real } = pass;
		if (real && layout.key === real.layout.key && layout.values.every((value, index) => value === real.layout.values[index])) {
			this.show(pass, real, source, ++this.compileSeq);
			return true;
		}
		if (!literal || layout.key !== literal.key) return false;

		this.gl.useProgram(literal.program);
		if (literal.values) this.gl.uniform4fv(literal.values, layout.values);
		this.show(pass, literal, source, ++this.compileSeq);
		return true;
	}

	private async compileReal(id: string, pass: Pass, source: string, label: string): Promise<void> {
		if (!this.gl || !this.compiler) return;
		const { gl } = this;
		pass.compiling = true;
		pass.queuedSource = '';
		pass.requestedSource = source;
		const seq = ++this.compileSeq;
		const start = performance.now();
		const { error, program } = await this.compiler.compile(source);
		pass.compiling = false;
		const queued = pass.queuedSource;
		if (queued && queued !== source && this.passes.get(id) === pass) void this.compileReal(id, pass, queued, label);
		if (this.passes.get(id) !== pass || (source !== pass.latestSource && seq < pass.shownSeq)) {
			if (program) gl.deleteProgram(program);
			return;
		}
		if (!program) {
			pass.error = { message: `[${label}] ${error}`, seq, source };
			this.publishErrors();
			return;
		}

		this.options.updateBuildTime(performance.now() - start);
		if (pass.real) gl.deleteProgram(pass.real.program);
		pass.real = { layout: analyzeLiterals(source), locs: buildLocs(gl, program), program };
		this.show(pass, pass.real, source, seq);
		this.publishErrors();

		const { layout } = pass.real;
		if (layout.vectorCount === 0 || layout.vectorCount > this.literalBudget) return;
		if (layout.key !== pass.literal?.key && layout.key !== pass.literalPendingKey) void this.compileLiteral(id, pass, layout);
	}

	/** A failed literal variant only disables hot swaps for that structure, the real program already compiled fine. */
	private async compileLiteral(id: string, pass: Pass, layout: LiteralLayout): Promise<void> {
		if (!this.gl || !this.compiler) return;
		const { gl } = this;
		pass.literalPendingKey = layout.key;
		const { program } = await this.compiler.compile(layout.patched);
		if (pass.literalPendingKey === layout.key) pass.literalPendingKey = '';
		if (!program) return;
		/** The drawn literal program still matches the structure being edited. */
		if (this.passes.get(id) !== pass || (pass.literal && pass.program === pass.literal.program)) {
			gl.deleteProgram(program);
			return;
		}

		const values = gl.getUniformLocation(program, LITERAL_UNIFORM);
		gl.useProgram(program);
		if (values) gl.uniform4fv(values, layout.values);
		if (pass.literal) gl.deleteProgram(pass.literal.program);
		pass.literal = { key: layout.key, locs: buildLocs(gl, program), program, values };
		if (pass.latestSource !== pass.shownSource && this.applyHot(pass, pass.latestSource)) this.publishErrors();
	}

	private createPass(id: string): Pass {
		const pass: Pass = {
			compiling: false,
			error: null,
			fbo: [null, null],
			latestSource: '',
			literal: null,
			literalPendingKey: '',
			locs: null,
			prevIdx: 0,
			program: null,
			queuedSource: '',
			real: null,
			requestedSource: '',
			shownSeq: 0,
			shownSource: '',
			texture: [null, null],
		};
		const canvas = this.options.getCanvas();
		if (this.gl && id !== 'image') {
			attachPingPong(this.gl, pass, this.fboWidth || (canvas?.width ?? 800), this.fboHeight || (canvas?.height ?? 600), this.fboTexType);
		}
		this.passes.set(id, pass);
		return pass;
	}

	private destroyPass(id: string, pass: Pass): void {
		this.passes.delete(id);
		const thumbnail = this.thumbnailCache[id];
		if (thumbnail) URL.revokeObjectURL(thumbnail);
		delete this.thumbnailCache[id];
		if (!this.gl) return;
		if (pass.real) this.gl.deleteProgram(pass.real.program);
		if (pass.literal) this.gl.deleteProgram(pass.literal.program);
		for (const index of [0, 1] as const) {
			if (pass.fbo[index]) this.gl.deleteFramebuffer(pass.fbo[index]);
			if (pass.texture[index]) this.gl.deleteTexture(pass.texture[index]);
		}
	}

	private publishErrors(): void {
		const messages: string[] = [];
		for (const { error, latestSource, shownSeq } of this.passes.values()) {
			if (error && (error.source === latestSource || error.seq > shownSeq)) messages.push(error.message);
		}
		this.options.updateError(messages.join('\n'));
	}

	private show(pass: Pass, compiled: { locs: ProgramLocs; program: WebGLProgram }, source: string, seq: number): void {
		pass.program = compiled.program;
		pass.locs = compiled.locs;
		pass.shownSource = source;
		pass.shownSeq = Math.max(pass.shownSeq, seq);
	}

	private captureThumbnails(userOrder: string[]): void {
		const canvas = this.options.getCanvas();
		if (!this.gl || !canvas || userOrder.length === 0 || this.thumbnailGenerationPending || !this.options.getBufferPreviewsEnabled()) return;
		this.thumbnailGenerationPending = true;

		const id = userOrder[this.thumbnailCursor % userOrder.length];
		this.thumbnailCursor = (this.thumbnailCursor + 1) % userOrder.length;
		const state = this.passes.get(id);
		const sourceTexture = state?.texture[state?.prevIdx ?? 0] ?? null;
		if (!sourceTexture) {
			this.thumbnailGenerationPending = false;
			return;
		}

		this.setupThumbPass();
		if (!this.thumbFbo || !this.thumbProgram || !this.thumbTexture || this.thumbLocPosition < 0 || !this.thumbLocTex) {
			this.thumbnailGenerationPending = false;
			return;
		}

		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.thumbFbo);
		this.gl.viewport(0, 0, THUMB_SIZE.width, THUMB_SIZE.height);
		this.gl.useProgram(this.thumbProgram);
		this.gl.activeTexture(this.gl.TEXTURE0);
		this.gl.bindTexture(this.gl.TEXTURE_2D, sourceTexture);
		this.gl.uniform1i(this.thumbLocTex, 0);

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
		this.gl.enableVertexAttribArray(this.thumbLocPosition);
		this.gl.vertexAttribPointer(this.thumbLocPosition, 2, this.gl.FLOAT, false, 0, 0);
		this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

		const pixels = new Uint8Array(THUMB_SIZE.width * THUMB_SIZE.height * 4);
		this.gl.readPixels(0, 0, THUMB_SIZE.width, THUMB_SIZE.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

		this.ensureThumbnailCanvases();
		if (!this.thumbnailOutputContext || !this.thumbnailOutputCanvas) {
			this.thumbnailGenerationPending = false;
			return;
		}

		this.thumbnailOutputContext.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), THUMB_SIZE.width, THUMB_SIZE.height), 0, 0);

		void Promise.all([
			this.canvasToObjectUrl(this.thumbnailOutputCanvas),
			this.canvasToObjectUrl(canvas),
		]).then(([bufferThumb, imageThumb]) => {
			if (bufferThumb) this.setThumbnailUrl(id, bufferThumb);
			if (imageThumb) this.setThumbnailUrl('image', imageThumb);
			this.options.updateThumbnails({ ...this.thumbnailCache });
		}).finally(() => {
			this.thumbnailGenerationPending = false;
		});
	}

	private setupThumbPass(): void {
		if (!this.gl || this.thumbFbo) return;

		const fbo = createFbo(this.gl, THUMB_SIZE.width, THUMB_SIZE.height, UNSIGNED_BYTE_TEXTURE_TYPE);
		if (!fbo) return;
		this.thumbFbo = fbo.fbo;
		this.thumbTexture = fbo.texture;

		const { program } = buildProgram(
			this.gl,
			`precision mediump float;
uniform sampler2D uTex;
void main() {
	vec2 vUv = gl_FragCoord.xy / vec2(${THUMB_SIZE.width}.0, ${THUMB_SIZE.height}.0);
	vUv.y = 1.0 - vUv.y;
	gl_FragColor = texture2D(uTex, vUv);
}`,
			'thumb',
		);

		if (!program) return;
		this.thumbProgram = program;
		this.thumbLocPosition = this.gl.getAttribLocation(program, 'aPosition');
		this.thumbLocTex = this.gl.getUniformLocation(program, 'uTex');
	}

	private canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string | null> {
		return new Promise((resolve) => {
			canvas.toBlob((blob) => {
				if (!blob) {
					resolve(null);
					return;
				}

				resolve(URL.createObjectURL(blob));
			}, 'image/jpeg', 0.8);
		});
	}

	private setThumbnailUrl(id: string, url: string): void {
		const previousUrl = this.thumbnailCache[id];
		this.thumbnailCache[id] = url;
		if (previousUrl && previousUrl !== url) {
			URL.revokeObjectURL(previousUrl);
		}
	}

	private revokeThumbnailUrls(): void {
		for (const url of Object.values(this.thumbnailCache)) {
			URL.revokeObjectURL(url);
		}
	}

	private ensureThumbnailCanvases(): void {
		if (!this.thumbnailOutputCanvas) {
			this.thumbnailOutputCanvas = document.createElement('canvas');
			this.thumbnailOutputContext = this.thumbnailOutputCanvas.getContext('2d');
		}

		if (this.thumbnailOutputCanvas) {
			this.thumbnailOutputCanvas.width = THUMB_SIZE.width;
			this.thumbnailOutputCanvas.height = THUMB_SIZE.height;
		}
	}

	private ensureFboSize(width: number, height: number): void {
		if (!this.gl || (this.fboWidth === width && this.fboHeight === height)) return;
		this.fboHeight = height;
		this.fboWidth = width;
		resizeBufferTextures(this.gl, this.passes, width, height, this.fboTexType);
	}

	private renderFrame(): void {
		const canvas = this.options.getCanvas();
		if (!this.gl || !canvas) return;
		this.compiler?.poll();

		const width = canvas.width;
		const height = canvas.height;
		this.ensureFboSize(width, height);

		const currentTime = Date.now();
		const elapsed = (currentTime - this.startTime) / 1000;
		const deltaTime = this.lastFrameTime > 0 ? (currentTime - this.lastFrameTime) / 1000 : 0;
		this.lastFrameTime = currentTime;
		this.frameCount += 1;
		if (deltaTime > 0) this.fps = this.fps * 0.9 + (1 / deltaTime) * 0.1;

		const now = new Date();
		const userOrder = listUserBufferIds(this.options.getBuffers());
		if (currentTime - this.lastUniformReadoutTime >= UNIFORM_READOUT_INTERVAL_MS) {
			this.lastUniformReadoutTime = currentTime;
			this.options.updateUniformValues({
				uAspect: (width / height).toFixed(2),
				uDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
				uDeltaTime: `${(deltaTime * 1000).toFixed(2)}ms`,
				uFrameCount: this.frameCount.toString(),
				uFrameRate: `${this.fps.toFixed(1)} fps`,
				uMouse: `${this.mouseX.toFixed(0)}, ${this.mouseY.toFixed(0)}, ${this.isMouseDown ? 1 : 0}`,
				uResolution: `${width} × ${height}`,
				uTime: `${elapsed.toFixed(2)}s`,
			});
		}

		this.channelTextures.uploadVideoFrames();
		renderPasses(this.gl, this.passes, userOrder, this.channelTextures, this.quadBuffer, {
			deltaTime,
			elapsed,
			fps: this.fps,
			frameCount: this.frameCount,
			height,
			isMouseDown: this.isMouseDown,
			mouseX: this.mouseX,
			mouseY: this.mouseY,
			now,
			width,
		});

		if (currentTime - this.lastThumbTime > THUMBNAIL_CAPTURE_INTERVAL_MS) {
			this.lastThumbTime = currentTime;
			this.captureThumbnails(userOrder);
		}

		this.animationId = requestAnimationFrame(() => this.renderFrame());
	}

	private syncCanvasSize(): void {
		const canvas = this.options.getCanvas();
		if (!canvas) return;
		const width = canvas.offsetWidth;
		const height = canvas.offsetHeight;
		if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
			canvas.height = height;
			canvas.width = width;
		}
	}
}

function sourceOf(buffers: ShaderBuffer[], buffer: ShaderBuffer): string {
	const commonCode = buffers.find((candidate) => candidate.id === 'common')?.code ?? '';
	return commonCode ? `${commonCode}\n${buffer.code}` : buffer.code;
}
