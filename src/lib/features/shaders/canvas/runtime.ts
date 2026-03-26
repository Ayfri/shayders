import { CHANNEL_UNIFORM_NAMES, THUMB_SIZE } from '$features/shaders/model/shader-domain';
import type { ChannelEntry, ShaderBuffer } from '$features/shaders/model/shader-content';
import { ChannelTextureManager } from './channel-textures';
import {
	applyStandardUniforms,
	bindBufferTextures,
	buildBufferStates,
	buildProgram,
	createFbo,
	createQuadBuffer,
	destroyBufferStates,
	drawQuad,
	type InternalBufState,
	type ProgramLocs,
	resizeBufferTextures,
} from './gl-utils';

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

const FLOAT_TEXTURE_TYPE = 0x1406;
const UNSIGNED_BYTE_TEXTURE_TYPE = 0x1401;
const THUMBNAIL_CAPTURE_INTERVAL_MS = 400;

export class ShaderCanvasRuntime {
	private animationId = 0;
	private readonly bufferStates = new Map<string, InternalBufState>();
	private readonly channelTextures: ChannelTextureManager;
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
		this.destroyBuffers();
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

		if (this.gl.getExtension('OES_texture_float')) {
			this.gl.getExtension('OES_texture_float_linear');
			this.fboTexType = FLOAT_TEXTURE_TYPE;
		}

		this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
		this.resizeObserver.observe(canvas);
		this.syncCanvasSize();
		this.channelTextures.sync();
		this.run();
	}

	public run(resetTime = true): void {
		if (!this.gl) return;

		cancelAnimationFrame(this.animationId);
		if (resetTime) this.startTime = Date.now();
		this.frameCount = 0;
		this.fps = 0;
		this.lastFrameTime = 0;
		this.fboHeight = 0;
		this.fboWidth = 0;
		this.thumbnailGenerationPending = false;
		this.revokeThumbnailUrls();
		for (const key of Object.keys(this.thumbnailCache)) delete this.thumbnailCache[key];
		this.thumbnailCursor = 0;
		this.options.updateError('');

		const buffers = this.options.getBuffers();
		const buildStart = performance.now();
		const commonCode = buffers.find((buffer) => buffer.id === 'common')?.code ?? '';
		const renderOrder = [...this.userBufferOrder(buffers), 'image'];
		const errors: string[] = [];

		this.destroyBuffers();
		const canvas = this.options.getCanvas();
		const width = canvas?.width ?? 800;
		const height = canvas?.height ?? 600;
		const buildResult = buildBufferStates({
			buffers,
			commonCode,
			fboTextureType: this.fboTexType,
			gl: this.gl,
			height,
			renderOrder,
			width,
		});
		errors.push(...buildResult.errors);
		for (const [id, state] of buildResult.states.entries()) {
			this.bufferStates.set(id, state);
		}

		this.options.updateBuildTime(performance.now() - buildStart);
		this.options.updateError(errors.join('\n'));
		if (!this.quadBuffer) this.quadBuffer = createQuadBuffer(this.gl);
		this.animationId = requestAnimationFrame(() => this.renderFrame());
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

	private captureThumbnails(userOrder: string[]): void {
		const canvas = this.options.getCanvas();
		if (!this.gl || !canvas || userOrder.length === 0 || this.thumbnailGenerationPending || !this.options.getBufferPreviewsEnabled()) return;
		this.thumbnailGenerationPending = true;

		const id = userOrder[this.thumbnailCursor % userOrder.length];
		this.thumbnailCursor = (this.thumbnailCursor + 1) % userOrder.length;
		const state = this.bufferStates.get(id);
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

	private destroyBuffers(): void {
		if (!this.gl) return;
		destroyBufferStates(this.gl, this.bufferStates);
	}

	private drawQuad(locs: ProgramLocs): void {
		if (!this.gl) return;
		drawQuad(this.gl, this.quadBuffer, locs.aPosition);
	}

	private ensureFboSize(width: number, height: number): void {
		if (!this.gl || (this.fboWidth === width && this.fboHeight === height)) return;
		this.fboHeight = height;
		this.fboWidth = width;
		resizeBufferTextures(this.gl, this.bufferStates, width, height, this.fboTexType);
	}

	private renderFrame(): void {
		const canvas = this.options.getCanvas();
		if (!this.gl || !canvas) return;

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
		const userOrder = this.userBufferOrder(this.options.getBuffers());
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

		this.channelTextures.uploadVideoFrames();
		for (const id of [...userOrder, 'image']) {
			const state = this.bufferStates.get(id);
			if (!state?.locs || !state.program) continue;

			this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, id === 'image' ? null : (state.fbo[1 - state.prevIdx] ?? null));
			this.gl.useProgram(state.program);
			this.gl.viewport(0, 0, width, height);
			bindBufferTextures(this.gl, state.locs, id, userOrder, (bufferId) => {
				const bufferState = this.bufferStates.get(bufferId);
				return bufferState?.texture[bufferState.prevIdx] ?? null;
			});
			this.channelTextures.bind(
				state.locs,
				(channel) => {
					if (!channel.bufferId) return null;
					const bufferState = this.bufferStates.get(channel.bufferId);
					return bufferState?.texture[bufferState.prevIdx] ?? null;
				},
				CHANNEL_UNIFORM_NAMES.length,
			);
			applyStandardUniforms(this.gl, state.locs, {
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
			this.drawQuad(state.locs);
		}

		for (const id of userOrder) {
			const state = this.bufferStates.get(id);
			if (state) state.prevIdx = 1 - state.prevIdx;
		}

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

	private userBufferOrder(buffers: ShaderBuffer[]): string[] {
		return buffers.filter((buffer) => buffer.id !== 'common' && buffer.id !== 'image').map((buffer) => buffer.id);
	}
}
