import { ChannelTextureManager } from '#features/shaders/canvas/channel-textures.js';
import {
	buildBufferStates,
	createQuadBuffer,
	destroyBufferStates,
	FLOAT_TEXTURE_TYPE,
	type InternalBufState,
	listUserBufferIds,
	renderPasses,
	resizeBufferTextures,
	UNSIGNED_BYTE_TEXTURE_TYPE,
} from '#features/shaders/canvas/gl-utils.js';
import type { ChannelEntry, ShaderBuffer } from '#features/shaders/model/shader-content.js';

const IDLE_FRAME_DELAY_MS = 200;

/**
 * Renders a gallery thumbnail on demand: live while hovered, frozen otherwise.
 * Single-pass shaders draw one frame and stop, multipass shaders keep a slow idle loop so feedback buffers settle.
 */
export class ShaderPreviewRenderer {
	private readonly bufferStates = new Map<string, InternalBufState>();
	private readonly channelTextures: ChannelTextureManager;
	private readonly gl: WebGLRenderingContext | null;
	private readonly quadBuffer: WebGLBuffer | null = null;
	private readonly resizeObserver: ResizeObserver;
	private readonly startTime = performance.now();
	private readonly userOrder: string[];
	private animationFrame = 0;
	private fboTextureType = UNSIGNED_BYTE_TEXTURE_TYPE;
	private fps = 0;
	private frameCount = 0;
	private freezeTime = 0;
	private hovered = false;
	private idleTimer = 0;
	private lastFrameTime = 0;
	private mouseX = 0;
	private mouseY = 0;

	public constructor(private readonly canvas: HTMLCanvasElement, buffers: ShaderBuffer[], channels: ChannelEntry[]) {
		this.userOrder = listUserBufferIds(buffers);
		/** Previews never open the webcam, a gallery page asking for camera access would be unexpected. */
		const previewChannels = channels.filter((channel) => channel.type !== 'webcam');
		this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
		this.channelTextures = new ChannelTextureManager(() => previewChannels, () => this.gl, {
			autoplayVideos: false,
			onTextureLoad: () => this.requestFrame(),
		});
		this.resizeObserver = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
		if (!this.gl || !buffers.some((buffer) => buffer.id === 'image')) return;

		if (this.gl.getExtension('OES_texture_float')) {
			this.gl.getExtension('OES_texture_float_linear');
			this.fboTextureType = FLOAT_TEXTURE_TYPE;
		}

		canvas.width = Math.max(1, canvas.clientWidth);
		canvas.height = Math.max(1, canvas.clientHeight);
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
		this.resizeObserver.observe(canvas);
		this.requestFrame();
	}

	public destroy(): void {
		cancelAnimationFrame(this.animationFrame);
		window.clearTimeout(this.idleTimer);
		this.resizeObserver.disconnect();
		this.channelTextures.destroy();
		if (!this.gl) return;
		destroyBufferStates(this.gl, this.bufferStates);
		if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
		this.gl.getExtension('WEBGL_lose_context')?.loseContext();
	}

	public setHovered(hovered: boolean): void {
		this.hovered = hovered;
		this.freezeTime = this.elapsedSeconds();
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

	private requestFrame(): void {
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
		if (!this.gl) return;

		const now = performance.now();
		const deltaTime = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 0;
		this.lastFrameTime = now;
		if (deltaTime > 0) this.fps = this.fps * 0.9 + (1 / deltaTime) * 0.1;
		if (this.hovered) this.channelTextures.uploadVideoFrames();

		renderPasses(this.gl, this.bufferStates, this.userOrder, this.channelTextures, this.quadBuffer, {
			deltaTime,
			elapsed: this.hovered ? this.elapsedSeconds() : this.freezeTime,
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

		if (this.hovered) this.requestFrame();
		else if (this.userOrder.length > 0) this.idleTimer = window.setTimeout(() => this.requestFrame(), IDLE_FRAME_DELAY_MS);
	}
}
