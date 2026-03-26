<script lang="ts">
	import { onMount } from 'svelte';
	import { BUFFER_UNIFORM_NAMES, CHANNEL_UNIFORM_NAMES } from '$features/shaders/model/shader-domain';
	import type { ChannelEntry, ShaderBuffer } from '$features/shaders/model/shader-content';
	import { buildLocs, buildProgram, createFbo, createQuadBuffer, type InternalBufState } from '../canvas/gl-utils';

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
	let frameCount = 0;
	let freezeTime = 0;
	let startTime = Date.now();
	let canvasWidth = 0;
	let canvasHeight = 0;
	let fboTextureType = 0x1401;
	let userOrder: string[] = [];
	const bufferStates = new Map<string, InternalBufState>();
	let resizeObserver: ResizeObserver | null = null;

	interface ChannelTexState {
		texture: WebGLTexture;
		lastVideoTime: number;
		videoEl: HTMLVideoElement | null;
	}

	const channelTexStates = new Map<number, ChannelTexState>();
	let channelsLoaded = false;

	function getTextureParams(channel: ChannelEntry) {
		if (!gl) {
			return null;
		}

		const filter = channel.filter ?? 'linear';
		const wrap = channel.wrap ?? 'clamp';
		const minFilter = filter === 'nearest'
			? gl.NEAREST
			: filter === 'linear-mipmap'
				? gl.LINEAR_MIPMAP_LINEAR
				: gl.LINEAR;
		const magFilter = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
		const wrapMode = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;

		return { magFilter, minFilter, wrapMode };
	}

	function initializeTexture(texture: WebGLTexture, channel: ChannelEntry) {
		if (!gl) {
			return;
		}

		const params = getTextureParams(channel);
		if (!params) {
			return;
		}

		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array([0, 0, 0, 255])
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, params.minFilter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, params.magFilter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, params.wrapMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, params.wrapMode);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	function bindBufferTextures(locs: InternalBufState['locs'], currentTarget: string) {
		if (!gl) {
			return;
		}

		for (let index = 0; index < userOrder.length && index < BUFFER_UNIFORM_NAMES.length; index += 1) {
			gl.activeTexture(gl.TEXTURE0 + index);
			if (userOrder[index] === currentTarget) {
				gl.bindTexture(gl.TEXTURE_2D, null);
				continue;
			}

			const location = locs?.buffers[index] ?? null;
			if (!location) {
				continue;
			}

			const state = bufferStates.get(userOrder[index]);
			const texture = state?.texture[state?.prevIdx ?? 0] ?? null;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			if (texture) {
				gl.uniform1i(location, index);
			}
		}
	}

	function bindChannelTextures(locs: InternalBufState['locs']) {
		if (!gl) {
			return;
		}

		for (const [id, state] of channelTexStates.entries()) {
			if (id >= CHANNEL_UNIFORM_NAMES.length) {
				continue;
			}

			const location = locs?.channels[id] ?? null;
			if (!location) {
				continue;
			}

			const unit = 8 + id;
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, state.texture);
			gl.uniform1i(location, unit);
		}
	}

	function setStandardUniforms(locs: InternalBufState['locs'], elapsed: number, width: number, height: number) {
		if (!gl) {
			return;
		}

		gl.uniform1f(locs?.uTime ?? null, elapsed);
		gl.uniform2f(locs?.uResolution ?? null, width, height);
		gl.uniform3f(
			locs?.uMouse ?? null,
			isHovered ? mouseX : -1,
			isHovered ? mouseY : -1,
			isHovered ? 1 : 0
		);
		gl.uniform1i(locs?.uFrameCount ?? null, frameCount);
		gl.uniform1f(locs?.uAspect ?? null, width / height);
	}

	function resizeBufferTargets(width: number, height: number) {
		if (!gl) {
			return;
		}

		for (const [id, state] of bufferStates.entries()) {
			if (id === 'image') {
				continue;
			}

			for (const texture of state.texture) {
				if (!texture) {
					continue;
				}

				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, fboTextureType, null);
				gl.bindTexture(gl.TEXTURE_2D, null);
			}
		}
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
		resizeBufferTargets(nextWidth, nextHeight);
		return true;
	}

	function updateCanvasSizeFromObserver(width: number, height: number) {
		canvasWidth = Math.max(1, Math.floor(width));
		canvasHeight = Math.max(1, Math.floor(height));
	}

	function drawQuad(positionLocation: number) {
		if (!gl || !quadBuffer || positionLocation < 0) {
			return;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
		gl.enableVertexAttribArray(positionLocation);
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	function destroyPrograms() {
		if (!gl) {
			bufferStates.clear();
			return;
		}

		for (const state of bufferStates.values()) {
			if (state.program) {
				gl.deleteProgram(state.program);
			}

			for (let index = 0; index < state.fbo.length; index += 1) {
				if (state.fbo[index]) {
					gl.deleteFramebuffer(state.fbo[index]);
				}

				if (state.texture[index]) {
					gl.deleteTexture(state.texture[index]);
				}
			}
		}

		bufferStates.clear();
	}

	function disposeChannelTextures() {
		if (!gl) {
			channelTexStates.clear();
			channelsLoaded = false;
			return;
		}

		for (const state of channelTexStates.values()) {
			gl.deleteTexture(state.texture);
			if (state.videoEl) {
				state.videoEl.pause();
				state.videoEl.removeAttribute('src');
				state.videoEl.load();
			}
		}

		channelTexStates.clear();
		channelsLoaded = false;
	}

	function loadChannelTextures() {
		if (!gl || channelsLoaded) {
			return;
		}

		channelsLoaded = true;

		for (const channel of channels) {
			if (!channel.url || (channel.type !== 'image' && channel.type !== 'video')) {
				continue;
			}

			const texture = gl.createTexture();
			if (!texture) {
				continue;
			}

			initializeTexture(texture, channel);

			if (channel.type === 'video') {
				const video = document.createElement('video');
				video.autoplay = true;
				video.crossOrigin = 'anonymous';
				video.loop = true;
				video.muted = true;
				video.playsInline = true;
				video.preload = 'auto';
				video.src = channel.url;
				video.play().catch(() => {});

				channelTexStates.set(channel.id, {
					texture,
					lastVideoTime: -1,
					videoEl: video,
				});
				continue;
			}

			const image = new window.Image();
			image.crossOrigin = 'anonymous';
			image.onload = () => {
				if (!gl) {
					return;
				}

				const params = getTextureParams(channel);
				if (!params) {
					return;
				}

				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
				if ((channel.filter ?? 'linear') === 'linear-mipmap') {
					gl.generateMipmap(gl.TEXTURE_2D);
				}
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, params.minFilter);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, params.magFilter);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, params.wrapMode);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, params.wrapMode);
				gl.bindTexture(gl.TEXTURE_2D, null);
			};
			image.onerror = () => {
				console.error('Preview channel image failed to load:', channel.url);
			};
			image.src = channel.url;

			channelTexStates.set(channel.id, {
				texture,
				lastVideoTime: -1,
				videoEl: null,
			});
		}
	}

	function pauseChannelVideos() {
		for (const state of channelTexStates.values()) {
			state.videoEl?.pause();
		}
	}

	function playChannelVideos() {
		for (const state of channelTexStates.values()) {
			if (!state.videoEl) {
				continue;
			}

			void state.videoEl.play().catch(() => {});
		}
	}

	function buildPrograms() {
		if (!gl || !canvas) {
			return;
		}

		cancelAnimationFrame(animationFrame);
		destroyPrograms();
		frameCount = 0;
		freezeTime = 0;
		startTime = Date.now();

		userOrder = buffers.filter((buffer) => buffer.id !== 'common' && buffer.id !== 'image').map((buffer) => buffer.id);
		const commonCode = buffers.find((buffer) => buffer.id === 'common')?.code ?? '';
		const renderOrder = [...userOrder, 'image'];

		const imageBuffer = buffers.find((buffer) => buffer.id === 'image');
		if (!imageBuffer) {
			return;
		}

		for (const id of renderOrder) {
			const buffer = buffers.find((candidate) => candidate.id === id);
			if (!buffer) {
				continue;
			}

			const source = commonCode ? `${commonCode}\n${buffer.code}` : buffer.code;
			const { err, program } = buildProgram(gl, source, buffer.label);
			if (err) {
				console.error('Shader preview error:', err);
			}

			const state: InternalBufState = {
				fbo: [null, null],
				locs: program ? buildLocs(gl, program) : null,
				prevIdx: 0,
				program,
				texture: [null, null],
			};

			if (id !== 'image') {
				const width = canvasWidth > 0 ? canvasWidth : canvas.clientWidth || 1;
				const height = canvasHeight > 0 ? canvasHeight : canvas.clientHeight || 1;
				const first = createFbo(gl, width, height, fboTextureType);
				const second = createFbo(gl, width, height, fboTextureType);

				if (first) {
					state.fbo[0] = first.fbo;
					state.texture[0] = first.texture;
				}

				if (second) {
					state.fbo[1] = second.fbo;
					state.texture[1] = second.texture;
				}
			}

			bufferStates.set(id, state);
		}

		if (!quadBuffer) {
			quadBuffer = createQuadBuffer(gl);
		}

		animationFrame = requestAnimationFrame(animate);
	}

	function animate() {
		if (!gl || !canvas) {
			animationFrame = requestAnimationFrame(animate);
			return;
		}

		if (!syncCanvasSize()) {
			animationFrame = requestAnimationFrame(animate);
			return;
		}

		const now = Date.now();
		const elapsed = (now - startTime) / 1000;
		const time = isHovered ? elapsed : freezeTime;
		const passOrder = [...userOrder, 'image'];

		if (isHovered) {
			loadChannelTextures();
		} else if (frameCount === 0) {
			freezeTime = elapsed;
		}

		for (const state of channelTexStates.values()) {
			if (!state.videoEl || state.videoEl.readyState < 2) {
				continue;
			}

				if (state.videoEl.currentTime === state.lastVideoTime) {
					continue;
				}

			gl.bindTexture(gl.TEXTURE_2D, state.texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.videoEl);
			gl.bindTexture(gl.TEXTURE_2D, null);
				state.lastVideoTime = state.videoEl.currentTime;
		}

		for (const id of passOrder) {
			const state = bufferStates.get(id);
			if (!state?.program || !state.locs) {
				continue;
			}

			gl.bindFramebuffer(gl.FRAMEBUFFER, id === 'image' ? null : state.fbo[1 - state.prevIdx]);
			gl.useProgram(state.program);
			gl.viewport(0, 0, canvasWidth, canvasHeight);
			bindBufferTextures(state.locs, id);
			bindChannelTextures(state.locs);
			setStandardUniforms(state.locs, time, canvasWidth, canvasHeight);
			drawQuad(state.locs.aPosition);
		}

		for (const id of userOrder) {
			const state = bufferStates.get(id);
			if (state) {
				state.prevIdx = 1 - state.prevIdx;
			}
		}

		frameCount += 1;
		animationFrame = requestAnimationFrame(animate);
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
			cancelAnimationFrame(animationFrame);
			resizeObserver?.disconnect();
			resizeObserver = null;
			destroyPrograms();
			disposeChannelTextures();
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

		disposeChannelTextures();
		loadChannelTextures();
		if (isHovered) {
			playChannelVideos();
		}
	});

	function handleMouseEnter() {
		isHovered = true;
		loadChannelTextures();
		playChannelVideos();
		if (freezeTime === 0) {
			freezeTime = (Date.now() - startTime) / 1000;
		}
	}

	function handleMouseLeave() {
		isHovered = false;
		pauseChannelVideos();
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
