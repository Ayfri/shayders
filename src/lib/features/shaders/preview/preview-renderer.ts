import { ChannelTextureManager } from '#features/shaders/canvas/channel-textures.js';
import {
	buildBufferStates,
	createQuadBuffer,
	destroyBufferStates,
	enableShaderExtensions,
	FLOAT_TEXTURE_TYPE,
	type InternalBufState,
	listUserBufferIds,
	renderPasses,
	resizeBufferTextures,
	UNSIGNED_BYTE_TEXTURE_TYPE,
} from '#features/shaders/canvas/gl-utils.js';
import type { ChannelEntry, ShaderBuffer } from '#features/shaders/model/shader-content.js';

const IDLE_FRAME_DELAY_MS = 200;
const MULTIPASS_SETTLE_FRAMES = 30;
const SNAPSHOT_CONCURRENCY = 4;
const SNAPSHOT_TIMEOUT_MS = 5000;

interface PendingCapture {
	deadline: number;
	reject: (reason: unknown) => void;
	resolve: (bitmap: ImageBitmap | PromiseLike<ImageBitmap>) => void;
	settleFrames: number;
}

/**
 * Renders a gallery thumbnail on demand: live while hovered, frozen otherwise.
 * Single-pass shaders draw one frame and stop, multipass shaders keep a slow idle loop so feedback buffers settle.
 */
export class ShaderPreviewRenderer {
	private readonly bufferStates = new Map<string, InternalBufState>();
	private readonly channelTextures: ChannelTextureManager;
	private readonly gl: WebGLRenderingContext | null;
	private readonly quadBuffer: WebGLBuffer | null = null;
	private readonly resizeObserver: ResizeObserver | null = null;
	private readonly startTime: number;
	private readonly userOrder: string[];
	private animationFrame = 0;
	private capture: PendingCapture | null = null;
	private destroyed = false;
	private fboTextureType = UNSIGNED_BYTE_TEXTURE_TYPE;
	private fps = 0;
	private frameCount = 0;
	private freezeTime: number;
	private hovered = false;
	private idleTimer = 0;
	private lastFrameTime = 0;
	private mouseX = 0;
	private mouseY = 0;

	/** @param time shader time in seconds to start from, keeps hover sessions continuous across renderer instances. */
	public constructor(
		private readonly canvas: HTMLCanvasElement | OffscreenCanvas,
		buffers: ShaderBuffer[],
		channels: ChannelEntry[],
		width: number,
		height: number,
		time = 0,
	) {
		this.startTime = performance.now() - time * 1000;
		this.freezeTime = time;
		this.userOrder = listUserBufferIds(buffers);
		/** Previews never open the webcam, a gallery page asking for camera access would be unexpected. */
		const previewChannels = channels.filter((channel) => channel.type !== 'webcam');
		this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
		this.channelTextures = new ChannelTextureManager(() => previewChannels, () => this.gl, {
			autoplayVideos: false,
			onTextureLoad: () => this.requestFrame(),
		});
		if (!this.gl || !buffers.some((buffer) => buffer.id === 'image')) return;

		enableShaderExtensions(this.gl);
		if (this.gl.getExtension('OES_texture_float')) {
			this.gl.getExtension('OES_texture_float_linear');
			this.fboTextureType = FLOAT_TEXTURE_TYPE;
		}

		canvas.width = Math.max(1, Math.floor(width));
		canvas.height = Math.max(1, Math.floor(height));
		const { errors, states } = buildBufferStates({
			buffers,
			commonCode: buffers.find((buffer) => buffer.id === 'common')?.code ?? '',
			fboTextureType: this.fboTextureType,
			gl: this.gl,
			height: canvas.height,
			renderOrder: [...this.userOrder, 'image'],
			width: canvas.width,
		});
		for (const error of errors) console.error('Shader preview error:', error);
		for (const [id, state] of states) this.bufferStates.set(id, state);

		this.quadBuffer = createQuadBuffer(this.gl);
		this.channelTextures.sync();
		if (canvas instanceof HTMLCanvasElement) {
			this.resizeObserver = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
			this.resizeObserver.observe(canvas);
		}
		/** Drawn synchronously so a freshly inserted canvas never flashes an empty frame. */
		this.frame();
	}

	public get time(): number {
		return this.hovered ? this.elapsedSeconds() : this.freezeTime;
	}

	/**
	 * Resolves with the next frame once textures are loaded and feedback buffers had `settleFrames` frames to converge.
	 * @example const still = await renderer.captureFrame(0);
	 */
	public captureFrame(settleFrames = this.userOrder.length > 0 ? MULTIPASS_SETTLE_FRAMES : 1): Promise<ImageBitmap> {
		const { promise, reject, resolve } = Promise.withResolvers<ImageBitmap>();
		if (this.destroyed || !this.gl) {
			reject(new DOMException('Preview renderer has no WebGL context', 'InvalidStateError'));
			return promise;
		}
		this.capture?.reject(new DOMException('Superseded by a newer capture', 'AbortError'));
		this.capture = { deadline: performance.now() + SNAPSHOT_TIMEOUT_MS, reject, resolve, settleFrames: this.frameCount + settleFrames };
		this.requestFrame();
		return promise;
	}

	public destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		cancelAnimationFrame(this.animationFrame);
		window.clearTimeout(this.idleTimer);
		this.capture?.reject(new DOMException('Preview renderer destroyed', 'AbortError'));
		this.capture = null;
		this.resizeObserver?.disconnect();
		this.channelTextures.destroy();
		if (!this.gl) return;
		destroyBufferStates(this.gl, this.bufferStates);
		if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
		this.gl.getExtension('WEBGL_lose_context')?.loseContext();
	}

	public setHovered(hovered: boolean): void {
		this.freezeTime = this.time;
		this.hovered = hovered;
		if (hovered) this.channelTextures.playVideos();
		else this.channelTextures.pauseVideos();
		this.requestFrame();
	}

	public setMouse(x: number, y: number): void {
		this.mouseX = x;
		this.mouseY = y;
	}

	private elapsedSeconds(): number {
		return (performance.now() - this.startTime) / 1000;
	}

	/**
	 * Copies the frame to a CPU-backed bitmap, GPU-backed ones (`transferToImageBitmap`, `createImageBitmap(canvas)`) go blank once
	 * the context is lost. Must run right after the draw, WebGL clears the drawing buffer when the task ends.
	 */
	private readFrame(gl: WebGLRenderingContext): Promise<ImageBitmap> {
		const { height, width } = this.canvas;
		const pixels = new Uint8Array(width * height * 4);
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
		return createImageBitmap(new ImageData(new Uint8ClampedArray(pixels.buffer), width, height), { imageOrientation: 'flipY' });
	}

	private requestFrame(): void {
		if (this.destroyed) return;
		window.clearTimeout(this.idleTimer);
		this.idleTimer = 0;
		if (!this.animationFrame) this.animationFrame = requestAnimationFrame(() => this.frame());
	}

	private resize(width: number, height: number): void {
		const nextWidth = Math.floor(width);
		const nextHeight = Math.floor(height);
		if (!this.gl || nextWidth <= 0 || nextHeight <= 0 || (nextWidth === this.canvas.width && nextHeight === this.canvas.height)) return;
		this.canvas.width = nextWidth;
		this.canvas.height = nextHeight;
		resizeBufferTextures(this.gl, this.bufferStates, nextWidth, nextHeight, this.fboTextureType);
		this.requestFrame();
	}

	private frame(): void {
		this.animationFrame = 0;
		if (!this.gl || this.destroyed) return;

		const now = performance.now();
		const deltaTime = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 0;
		this.lastFrameTime = now;
		if (deltaTime > 0) this.fps = this.fps * 0.9 + (1 / deltaTime) * 0.1;
		if (this.hovered || this.capture) this.channelTextures.uploadVideoFrames();

		renderPasses(this.gl, this.bufferStates, this.userOrder, this.channelTextures, this.quadBuffer, {
			deltaTime,
			elapsed: this.time,
			fps: this.fps,
			frameCount: this.frameCount,
			height: this.canvas.height,
			isMouseDown: this.hovered,
			mouseX: this.hovered ? this.mouseX : -1,
			mouseY: this.hovered ? this.mouseY : -1,
			now: new Date(),
			width: this.canvas.width,
		});
		this.frameCount += 1;

		const capture = this.capture;
		if (capture && (now >= capture.deadline || (this.frameCount >= capture.settleFrames && !this.channelTextures.loading))) {
			this.capture = null;
			capture.resolve(this.readFrame(this.gl));
		}

		if (this.hovered || this.capture) this.requestFrame();
		else if (this.userOrder.length > 0) this.idleTimer = window.setTimeout(() => this.requestFrame(), IDLE_FRAME_DELAY_MS);
	}
}

/** Hands out a fixed number of slots, a released slot goes straight to the oldest waiter so the limit always holds. */
class SlotPool {
	private active = 0;
	private readonly waiting: (() => void)[] = [];

	public constructor(private readonly size: number) {}

	public async acquire(): Promise<void> {
		if (this.active < this.size) {
			this.active += 1;
			return;
		}
		const { promise, resolve } = Promise.withResolvers<void>();
		this.waiting.push(resolve);
		await promise;
	}

	public release(): void {
		const next = this.waiting.shift();
		if (next) next();
		else this.active -= 1;
	}
}

/** Browsers cap live WebGL contexts (~16 in Chromium, the oldest is silently lost), so stills go through a few short-lived ones. */
const snapshotPool = new SlotPool(SNAPSHOT_CONCURRENCY);

/** Renders a still frame of a shader on an offscreen context that is freed right after. */
export async function renderPreviewSnapshot(
	buffers: ShaderBuffer[],
	channels: ChannelEntry[],
	width: number,
	height: number,
	signal: AbortSignal,
): Promise<ImageBitmap> {
	await snapshotPool.acquire();
	try {
		signal.throwIfAborted();
		const renderer = new ShaderPreviewRenderer(new OffscreenCanvas(width, height), buffers, channels, width, height);
		const abort = () => renderer.destroy();
		signal.addEventListener('abort', abort, { once: true });
		try {
			return await renderer.captureFrame();
		} finally {
			signal.removeEventListener('abort', abort);
			renderer.destroy();
		}
	} finally {
		snapshotPool.release();
	}
}
