<script lang="ts">
	import { onMount } from 'svelte';
	import { CHANNEL_UNIFORM_NAMES } from '$features/shaders/model/shader-domain';
	import type { ChannelEntry, ShaderBuffer } from '$features/shaders/model/shader-content';
	import { ChannelTextureManager } from '../canvas/channel-textures';
	import {
		applyStandardUniforms,
		bindBufferTextures,
		buildBufferStates,
		createQuadBuffer,
		destroyBufferStates,
		drawQuad,
		resizeBufferTextures,
		type InternalBufState,
	} from '../canvas/gl-utils';

	interface Props {
		buffers: ShaderBuffer[];
		channels?: ChannelEntry[];
		name: string;
	}

	let { buffers, channels = [], name }: Props = $props();

	let canvas: HTMLCanvasElement | null = null;
	let isHovered = false;
	let mouseX = 0;
	let mouseY = 0;

	let gl: WebGLRenderingContext | null = null;
	let quadBuffer: WebGLBuffer | null = null;
	let animationFrame = 0;
	let idleFrameTimer = 0;
	let frameCount = 0;
	let freezeTime = 0;
	let startTime = Date.now();
	let lastFrameTime = 0;
	let fps = 0;
	let canvasWidth = 0;
	let canvasHeight = 0;
	let fboTextureType = 0x1401;
	let userOrder: string[] = [];
	const bufferStates = new Map<string, InternalBufState>();
	let resizeObserver: ResizeObserver | null = null;

	const channelTextures = new ChannelTextureManager(
		() => channels,
		() => gl,
		{ autoplayVideos: false },
	);

	const IDLE_FRAME_DELAY_MS = 200;

	function scheduleNextFrame() {
		if (isHovered) {
			animationFrame = requestAnimationFrame(animate);
			return;
		}

		idleFrameTimer = window.setTimeout(() => {
			animationFrame = requestAnimationFrame(animate);
		}, IDLE_FRAME_DELAY_MS);
	}

	function stopScheduledFrames() {
		cancelAnimationFrame(animationFrame);
		animationFrame = 0;
		window.clearTimeout(idleFrameTimer);
		idleFrameTimer = 0;
	}

	function syncCanvasSize() {
		if (!canvas) {
			return false;
		}

		const nextWidth = canvas.clientWidth;
		const nextHeight = canvas.clientHeight;
		if (nextWidth <= 0 || nextHeight <= 0) {
			return false;
		}

		if (nextWidth === canvasWidth && nextHeight === canvasHeight) {
			return true;
		}

		canvasWidth = nextWidth;
		canvasHeight = nextHeight;
		canvas.width = nextWidth;
		canvas.height = nextHeight;
		if (gl) {
			resizeBufferTextures(gl, bufferStates, nextWidth, nextHeight, fboTextureType);
		}
		return true;
	}

	function updateCanvasSizeFromObserver(width: number, height: number) {
		canvasWidth = Math.max(1, Math.floor(width));
		canvasHeight = Math.max(1, Math.floor(height));
	}

	function destroyPrograms() {
		if (!gl) {
			bufferStates.clear();
			return;
		}

		destroyBufferStates(gl, bufferStates);
	}

	function buildPrograms() {
		if (!gl || !canvas) {
			return;
		}

		stopScheduledFrames();
		destroyPrograms();
		frameCount = 0;
		fps = 0;
		freezeTime = 0;
		lastFrameTime = 0;
		startTime = Date.now();

		userOrder = buffers.filter((buffer) => buffer.id !== 'common' && buffer.id !== 'image').map((buffer) => buffer.id);
		const commonCode = buffers.find((buffer) => buffer.id === 'common')?.code ?? '';
		const renderOrder = [...userOrder, 'image'];

		const imageBuffer = buffers.find((buffer) => buffer.id === 'image');
		if (!imageBuffer) {
			return;
		}

		const width = canvasWidth > 0 ? canvasWidth : canvas.clientWidth || 1;
		const height = canvasHeight > 0 ? canvasHeight : canvas.clientHeight || 1;
		const buildResult = buildBufferStates({
			buffers,
			commonCode,
			fboTextureType,
			gl,
			height,
			renderOrder,
			width,
		});

		for (const error of buildResult.errors) {
			console.error('Shader preview error:', error);
		}

		for (const [id, state] of buildResult.states.entries()) {
			bufferStates.set(id, state);
		}

		if (!quadBuffer) {
			quadBuffer = createQuadBuffer(gl);
		}

		scheduleNextFrame();
	}

	function animate() {
		animationFrame = 0;

		if (!gl || !canvas) {
			scheduleNextFrame();
			return;
		}

		if (!syncCanvasSize()) {
			scheduleNextFrame();
			return;
		}

		const now = Date.now();
		const elapsed = (now - startTime) / 1000;
		const deltaTime = lastFrameTime > 0 ? (now - lastFrameTime) / 1000 : 0;
		lastFrameTime = now;
		if (deltaTime > 0) {
			fps = fps * 0.9 + (1 / deltaTime) * 0.1;
		}
		const time = isHovered ? elapsed : freezeTime;
		const date = new Date(now);
		const passOrder = [...userOrder, 'image'];

		if (!isHovered && frameCount === 0) {
			freezeTime = elapsed;
		}

		if (isHovered) {
			channelTextures.uploadVideoFrames();
		}

		for (const id of passOrder) {
			const state = bufferStates.get(id);
			if (!state?.program || !state.locs) {
				continue;
			}

			gl.bindFramebuffer(gl.FRAMEBUFFER, id === 'image' ? null : state.fbo[1 - state.prevIdx]);
			gl.useProgram(state.program);
			gl.viewport(0, 0, canvasWidth, canvasHeight);
			bindBufferTextures(gl, state.locs, id, userOrder, (bufferId) => {
				const bufferState = bufferStates.get(bufferId);
				return bufferState?.texture[bufferState.prevIdx] ?? null;
			});
			channelTextures.bind(
				state.locs,
				(channel) => {
					if (!channel.bufferId) return null;
					const bufferState = bufferStates.get(channel.bufferId);
					return bufferState?.texture[bufferState.prevIdx] ?? null;
				},
				CHANNEL_UNIFORM_NAMES.length,
			);
			applyStandardUniforms(gl, state.locs, {
				deltaTime,
				elapsed: time,
				fps,
				frameCount,
				height: canvasHeight,
				isMouseDown: isHovered,
				mouseX: isHovered ? mouseX : -1,
				mouseY: isHovered ? mouseY : -1,
				now: date,
				width: canvasWidth,
			});
			drawQuad(gl, quadBuffer, state.locs.aPosition);
		}

		for (const id of userOrder) {
			const state = bufferStates.get(id);
			if (state) {
				state.prevIdx = 1 - state.prevIdx;
			}
		}

		frameCount += 1;
		scheduleNextFrame();
	}

	onMount(() => {
		if (!canvas) return;
		const w = canvas.clientWidth || 1;
		const h = canvas.clientHeight || 1;
		canvas.width = w;
		canvas.height = h;
		canvasWidth = w;
		canvasHeight = h;

		gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
		if (!gl) return;

		if (gl.getExtension('OES_texture_float')) {
			gl.getExtension('OES_texture_float_linear');
			fboTextureType = 0x1406;
		}

		resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) {
				return;
			}

			updateCanvasSizeFromObserver(entry.contentRect.width, entry.contentRect.height);
		});
		resizeObserver.observe(canvas);

		return () => {
			stopScheduledFrames();
			resizeObserver?.disconnect();
			resizeObserver = null;
			destroyPrograms();
			channelTextures.destroy();
			if (quadBuffer) {
				gl?.deleteBuffer(quadBuffer);
			}
		};
	});

	$effect(() => {
		if (!gl) return;

		buildPrograms();
	});

	$effect(() => {
		if (!gl) return;

		channelTextures.sync();
		if (isHovered) {
			channelTextures.playVideos();
		} else {
			channelTextures.pauseVideos();
		}
	});

	function handleMouseEnter() {
		isHovered = true;
		window.clearTimeout(idleFrameTimer);
		idleFrameTimer = 0;
		scheduleNextFrame();
		channelTextures.sync();
		channelTextures.playVideos();
		if (freezeTime === 0) {
			freezeTime = (Date.now() - startTime) / 1000;
		}
	}

	function handleMouseLeave() {
		isHovered = false;
		channelTextures.pauseVideos();
		freezeTime = (Date.now() - startTime) / 1000;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		mouseX = e.clientX - rect.left;
		mouseY = rect.height - (e.clientY - rect.top);
	}
</script>

<canvas
	bind:this={canvas}
	class="w-full h-full block bg-black rounded cursor-pointer"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	onmousemove={handleMouseMove}
	title={name}
></canvas>
