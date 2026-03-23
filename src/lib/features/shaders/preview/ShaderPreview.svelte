<script lang="ts">
	import { onMount } from 'svelte';
	import { CHANNEL_UNIFORM_NAMES } from '$features/shaders/model/shader-domain';
	import type { ChannelEntry, ShaderBuffer } from '$features/shaders/model/shader-content';

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
	let program: WebGLProgram | null = null;
	let animationFrame = 0;
	let frameCount = 0;
	let freezeTime = 0;
	let startTime = Date.now();

	interface ChannelTexState {
		texture: WebGLTexture;
		videoEl: HTMLVideoElement | null;
	}

	const channelTexStates = new Map<number, ChannelTexState>();
	let channelsLoaded = false;

	function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader | null {
		const shader = gl.createShader(type);
		if (!shader) return null;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error('Shader error:', gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}

	function createProgram(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram | null {
		const vertexSrc = `
			precision highp float;
			attribute vec2 position;
			void main() { gl_Position = vec4(position, 0.0, 1.0); }
		`;
		const vs = compileShader(gl, vertexSrc, gl.VERTEX_SHADER);
		const fs = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);

		if (!vs || !fs) return null;

		const prog = gl.createProgram();
		if (!prog) return null;

		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);

		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error('Program error:', gl.getProgramInfoLog(prog));
			return null;
		}

		gl.deleteShader(vs);
		gl.deleteShader(fs);
		return prog;
	}

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

	function bindChannelTextures() {
		if (!gl || !program) {
			return;
		}

		for (const [id, state] of channelTexStates.entries()) {
			if (id >= CHANNEL_UNIFORM_NAMES.length) {
				continue;
			}

			const location = gl.getUniformLocation(program, CHANNEL_UNIFORM_NAMES[id]);
			if (!location) {
				continue;
			}

			const unit = 8 + id;
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, state.texture);
			gl.uniform1i(location, unit);
		}
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
				videoEl: null,
			});
		}
	}

	onMount(() => {
		if (!canvas) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		canvas.width = w;
		canvas.height = h;

		gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
		if (!gl) return;

		const imageBuffer = buffers.find((b) => b.id === 'image');
		if (!imageBuffer) return;

		program = createProgram(gl, imageBuffer.code);
		if (!program) return;

		const posLoc = gl.getAttribLocation(program, 'position');
		const vao = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vao);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(posLoc);

		const animate = () => {
			if (!gl || !program) {
				animationFrame = requestAnimationFrame(animate);
				return;
			}

			const now = Date.now();
			const elapsed = (now - startTime) / 1000;
			const time = isHovered ? elapsed : freezeTime;

			if (!isHovered && frameCount === 0) {
				freezeTime = elapsed;
			}

			if (isHovered) {
				loadChannelTextures();
			}

			for (const state of channelTexStates.values()) {
				if (!state.videoEl || state.videoEl.readyState < 2) {
					continue;
				}

				gl.bindTexture(gl.TEXTURE_2D, state.texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.videoEl);
				gl.bindTexture(gl.TEXTURE_2D, null);
			}

			gl.useProgram(program);
			bindChannelTextures();
			gl.uniform1f(gl.getUniformLocation(program, 'uTime'), time);
			gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), w, h);
			gl.uniform3f(
				gl.getUniformLocation(program, 'uMouse'),
				isHovered ? mouseX : -1,
				isHovered ? mouseY : -1,
				isHovered ? 1 : 0
			);
			gl.uniform1i(gl.getUniformLocation(program, 'uFrameCount'), frameCount);
			gl.uniform1f(gl.getUniformLocation(program, 'uAspect'), w / h);

			gl.viewport(0, 0, w, h);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

			frameCount++;
			animationFrame = requestAnimationFrame(animate);
		};

		animate();

		return () => {
			cancelAnimationFrame(animationFrame);
			disposeChannelTextures();
			if (program) {
				gl?.deleteProgram(program);
			}
		};
	});

	$effect(() => {
		const channelSignature = channels
			.map((channel) => `${channel.id}:${channel.type}:${channel.url ?? ''}`)
			.join('|');

		if (!gl) {
			return;
		}

		disposeChannelTextures();
		if (isHovered && channelSignature.length > 0) {
			loadChannelTextures();
		}
	});

	function handleMouseEnter() {
		isHovered = true;
		loadChannelTextures();
	}

	function handleMouseLeave() {
		isHovered = false;
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

