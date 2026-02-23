<script lang="ts">
	import { onMount } from 'svelte';
	import { CircleAlert, Maximize2, Minimize2, Info } from '@lucide/svelte';
	import type { ChannelEntry } from '$lib/components/ChannelsPanel.svelte';
	import { shaderState } from '$lib/shaderState.svelte';
	import ShaderInfoModal from '$lib/components/ShaderInfoModal.svelte';
	import { auth } from '$lib/auth.svelte';

	// 'image' and 'common' are reserved. All other IDs are user buffers (buf1, buf2, …).
	export type BufferId = string;

	export interface ShaderBuffer {
		id: BufferId;
		label: string;
		code: string;
	}

	interface Props {
		buffers: ShaderBuffer[];
		channels?: ChannelEntry[];
		error?: string;
		uniformValues?: Record<string, string>;
		thumbnails?: Record<string, string>;
		readonly?: boolean;
		viewOnly?: boolean;
		isSavingLocally?: boolean;
		authorId?: string;
		authorName?: string;
	}

	let {
		buffers,
		channels = [],
		error = $bindable(''),
		uniformValues = $bindable({}),
		thumbnails = $bindable({}),
		readonly = false,
		viewOnly = false,
		isSavingLocally = false,
		authorId = undefined,
		authorName = undefined,
	}: Props = $props();

	// Canvas / GL
	let canvas = $state<HTMLCanvasElement | null>(null);
	let wrapper = $state<HTMLDivElement | null>(null);
	let gl: WebGLRenderingContext | null = null;

	// Fullscreen
	let isFullscreen = $state(false);
	let isHovered = $state(false);
	let infosOpen = $state(false);

	async function toggleFullscreen() {
		if (!wrapper) return;
		if (!document.fullscreenElement) {
			await wrapper.requestFullscreen();
		} else {
			await document.exitFullscreen();
		}
	}

	// Shared vertex shader
	const vertexCode = `attribute vec4 aPosition;
void main() {
  gl_Position = aPosition;
}`;

	// Cached uniform/attrib locations for a compiled program.
	// Built once at program creation time - never queried during the render loop.
	interface ProgramLocs {
		aPosition: number;
		uTime: WebGLUniformLocation | null;
		uResolution: WebGLUniformLocation | null;
		uMouse: WebGLUniformLocation | null;
		uDate: WebGLUniformLocation | null;
		uFrameRate: WebGLUniformLocation | null;
		uDeltaTime: WebGLUniformLocation | null;
		uFrameCount: WebGLUniformLocation | null;
		uAspect: WebGLUniformLocation | null;
		buffers: (WebGLUniformLocation | null)[];
		channels: (WebGLUniformLocation | null)[];
	}

	// Per-buffer internal state
	// fbo/texture are ping-pong pairs: index 0 and 1 alternate each frame.
	// prevIdx points to the FBO that holds the PREVIOUS frame's result (safe to sample).
	// The current frame is always written into fbo[1 - prevIdx].
	interface InternalBufState {
		program: WebGLProgram | null;
		fbo: [WebGLFramebuffer | null, WebGLFramebuffer | null];
		texture: [WebGLTexture | null, WebGLTexture | null];
		prevIdx: number;
		locs: ProgramLocs | null;
	}
	const bufferStates = new Map<BufferId, InternalBufState>();

	// Channel texture state
	interface ChannelTexState {
		texture: WebGLTexture;
		videoEl: HTMLVideoElement | null;
		stream: MediaStream | null;
		url: string;
	}
	const channelTexStates = new Map<number, ChannelTexState>();
	const CHANNEL_UNIFORM_NAMES = ['uChannel0', 'uChannel1', 'uChannel2', 'uChannel3'];
	let quadBuffer: WebGLBuffer | null = null;
	let fboWidth = 0;
	let fboHeight = 0;
	// FLOAT if OES_texture_float is available (preserves sub-unit values for diffusion/feedback),
	// falls back to UNSIGNED_BYTE on devices that don't support it.
	let fboTexType: number = 0x1401; // UNSIGNED_BYTE

	// Animation state
	let animationId = 0;
	let startTime = Date.now();
	let lastFrameTime = 0;
	let frameCount = 0;
	let fps = 0;
	let buildTime = $state(0);
	let mouseX = $state(0);
	let mouseY = $state(0);
	let isMouseDown = $state(false);

	// Thumbnail timing
	let lastThumbTime = 0;
	const THUMB_W = 128;
	const THUMB_H = 72;

	// Compile helpers
	function compileShaderSrc(ctx: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
		const shader = ctx.createShader(type);
		if (!shader) return null;
		ctx.shaderSource(shader, source);
		ctx.compileShader(shader);
		if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
			ctx.deleteShader(shader);
			return null;
		}
		return shader;
	}

	function buildSingleProgram(
		ctx: WebGLRenderingContext,
		fragCode: string,
		label: string,
	): { program: WebGLProgram | null; err: string } {
		const vert = compileShaderSrc(ctx, ctx.VERTEX_SHADER, vertexCode);
		if (!vert) return { program: null, err: `[${label}] vertex compile error` };

		const frag = compileShaderSrc(ctx, ctx.FRAGMENT_SHADER, fragCode);
		if (!frag) {
			// Re-compile to get the log
			const tmp = ctx.createShader(ctx.FRAGMENT_SHADER)!;
			ctx.shaderSource(tmp, fragCode);
			ctx.compileShader(tmp);
			const msg = ctx.getShaderInfoLog(tmp) ?? 'Unknown error';
			ctx.deleteShader(tmp);
			return { program: null, err: `[${label}] ${msg}` };
		}

		const prog = ctx.createProgram();
		if (!prog) return { program: null, err: `[${label}] createProgram failed` };
		ctx.attachShader(prog, vert);
		ctx.attachShader(prog, frag);
		ctx.linkProgram(prog);
		if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) {
			return { program: null, err: `[${label}] ${ctx.getProgramInfoLog(prog) ?? 'link error'}` };
		}
		return { program: prog, err: '' };
	}

	// FBO helpers
	function createFbo(
		ctx: WebGLRenderingContext,
		w: number,
		h: number,
	): { fbo: WebGLFramebuffer; texture: WebGLTexture } | null {
		const texture = ctx.createTexture();
		if (!texture) return null;
		ctx.bindTexture(ctx.TEXTURE_2D, texture);
		ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, fboTexType, null);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
		ctx.bindTexture(ctx.TEXTURE_2D, null);

		const fbo = ctx.createFramebuffer();
		if (!fbo) { ctx.deleteTexture(texture); return null; }
		ctx.bindFramebuffer(ctx.FRAMEBUFFER, fbo);
		ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, texture, 0);
		ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
		return { fbo, texture };
	}

	function ensureFboSize(w: number, h: number) {
		if (!gl || (fboWidth === w && fboHeight === h)) return;
		fboWidth = w;
		fboHeight = h;
		for (const [id, state] of bufferStates.entries()) {
			if (id === 'image') continue;
			for (let i = 0; i < 2; i++) {
				if (!state.texture[i]) continue;
				gl.bindTexture(gl.TEXTURE_2D, state.texture[i]);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, fboTexType, null);
				gl.bindTexture(gl.TEXTURE_2D, null);
			}
		}
	}

	// Returns the ordered list of user buffer IDs (excludes 'image' and 'common')
	function userBufferOrder(): string[] {
		return buffers.filter((b) => b.id !== 'image' && b.id !== 'common').map((b) => b.id);
	}

	// Build and cache all uniform/attrib locations for a program.
	function buildLocs(prog: WebGLProgram): ProgramLocs {
		const g = gl!;
		return {
			aPosition: g.getAttribLocation(prog, 'aPosition'),
			uTime: g.getUniformLocation(prog, 'uTime'),
			uResolution: g.getUniformLocation(prog, 'uResolution'),
			uMouse: g.getUniformLocation(prog, 'uMouse'),
			uDate: g.getUniformLocation(prog, 'uDate'),
			uFrameRate: g.getUniformLocation(prog, 'uFrameRate'),
			uDeltaTime: g.getUniformLocation(prog, 'uDeltaTime'),
			uFrameCount: g.getUniformLocation(prog, 'uFrameCount'),
			uAspect: g.getUniformLocation(prog, 'uAspect'),
			buffers: BUFFER_UNIFORM_NAMES.map((n) => g.getUniformLocation(prog, n)),
			channels: CHANNEL_UNIFORM_NAMES.map((n) => g.getUniformLocation(prog, n)),
		};
	}

	export function run(resetTime = true) {
		if (!gl) return;
		cancelAnimationFrame(animationId);
		if (resetTime) startTime = Date.now();
		lastFrameTime = 0;
		frameCount = 0;
		fps = 0;
		error = '';
		// Reset tracked FBO size so ensureFboSize re-initialises storage on the next frame.
		fboWidth = 0;
		fboHeight = 0;

		const t0 = performance.now();
		const errors: string[] = [];

		// Prepend common code (if any) to every shader
		const commonCode = buffers.find((b) => b.id === 'common')?.code ?? '';
		const withCommon = (code: string) => (commonCode ? commonCode + '\n' + code : code);

		// Dynamic render order: user buffers first (in declaration order), then image
		const renderOrder = [...userBufferOrder(), 'image'];

		// Fully destroy all stale and existing GL state - always recreate FBOs fresh
		// so there is no risk of a detached or incomplete framebuffer from a previous run.
		for (const id of bufferStates.keys()) {
			const s = bufferStates.get(id)!;
			if (s.program) gl.deleteProgram(s.program);
			for (let i = 0; i < 2; i++) {
				if (s.fbo[i]) gl.deleteFramebuffer(s.fbo[i]!);
				if (s.texture[i]) gl.deleteTexture(s.texture[i]!);
			}
			bufferStates.delete(id);
		}

		for (const id of renderOrder) {
			const buf = buffers.find((b) => b.id === id);
			if (!buf) continue;

			const { program, err } = buildSingleProgram(gl, withCommon(buf.code), buf.label);
			if (err) errors.push(err);

			let fbo: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
			let texture: [WebGLTexture | null, WebGLTexture | null] = [null, null];

			if (id !== 'image') {
				const w = canvas?.width ?? 800;
				const h = canvas?.height ?? 600;
				const dims0 = createFbo(gl, w, h);
				const dims1 = createFbo(gl, w, h);
				if (dims0) { fbo[0] = dims0.fbo; texture[0] = dims0.texture; }
				if (dims1) { fbo[1] = dims1.fbo; texture[1] = dims1.texture; }
			}

			const locs = program ? buildLocs(program) : null;
			bufferStates.set(id, { program, fbo, texture, prevIdx: 0, locs });
		}

		buildTime = performance.now() - t0;
		error = errors.join('\n');

		if (!quadBuffer) {
			quadBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
			gl.bufferData(
				gl.ARRAY_BUFFER,
				new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
				gl.STATIC_DRAW,
			);
		}

		animationId = requestAnimationFrame(renderFrame);
	}

	// Set all standard uniforms using pre-cached locations (zero getUniformLocation calls).
	function setStandardUniforms(locs: ProgramLocs, elapsed: number, deltaTime: number, now: Date) {
		if (!gl || !canvas) return;
		const tofDay = now.getHours() * 3600.0 + now.getMinutes() * 60.0 + now.getSeconds();
		const w = canvas.width, h = canvas.height;
		if (locs.uTime) gl.uniform1f(locs.uTime, elapsed);
		if (locs.uResolution) gl.uniform2f(locs.uResolution, w, h);
		if (locs.uMouse) gl.uniform3f(locs.uMouse, mouseX, mouseY, isMouseDown ? 1.0 : 0.0);
		if (locs.uDate) gl.uniform4f(locs.uDate, now.getFullYear(), now.getMonth() + 1, now.getDate(), tofDay);
		if (locs.uFrameRate) gl.uniform1f(locs.uFrameRate, fps);
		if (locs.uDeltaTime) gl.uniform1f(locs.uDeltaTime, deltaTime);
		if (locs.uFrameCount) gl.uniform1i(locs.uFrameCount, frameCount);
		if (locs.uAspect) gl.uniform1f(locs.uAspect, w / h);
	}

	// Buffer texture bindings
	// User buffers are exposed as uBufferA, uBufferB, … (by declaration position, not ID)
	const BUFFER_UNIFORM_NAMES = ['uBufferA','uBufferB','uBufferC','uBufferD','uBufferE','uBufferF','uBufferG','uBufferH'];

	// currentTarget: the buffer currently being rendered - never bind its own texture as input
	function bindBufferTextures(locs: ProgramLocs, currentTarget: string, order: string[]) {
		if (!gl) return;
		for (let i = 0; i < order.length && i < BUFFER_UNIFORM_NAMES.length; i++) {
			if (order[i] === currentTarget) {
				// Explicitly unbind to clear any stale binding from the previous frame
				gl.activeTexture(gl.TEXTURE0 + i);
				gl.bindTexture(gl.TEXTURE_2D, null);
				continue;
			}
			const state = bufferStates.get(order[i]);
			// Expose the texture written this frame (1 - prevIdx = current write target)
			const tex = state?.texture[1 - (state?.prevIdx ?? 0)] ?? null;
			if (!tex) continue;
			const loc = locs.buffers[i];
			if (loc) {
				gl.activeTexture(gl.TEXTURE0 + i);
				gl.bindTexture(gl.TEXTURE_2D, tex);
				gl.uniform1i(loc, i);
			}
		}
	}

	// Channel textures: uChannel0-3 use texture units 8-11
	function updateChannelTextures() {
		if (!gl) return;
		for (const ch of channels) {
			// Buffer channels are bound directly from bufferStates at render time
			if (ch.type === 'buffer') {
				const existing = channelTexStates.get(ch.id);
				if (existing) {
					gl.deleteTexture(existing.texture);
					if (existing.videoEl) { existing.videoEl.pause(); existing.videoEl.src = ''; }
					if (existing.stream) { existing.stream.getTracks().forEach(t => t.stop()); }
					channelTexStates.delete(ch.id);
				}
				continue;
			}
			const existing = channelTexStates.get(ch.id);
			if (existing && existing.url === (ch.url ?? '')) continue;
			if (existing) {
				gl.deleteTexture(existing.texture);
				if (existing.videoEl) { existing.videoEl.pause(); existing.videoEl.src = ''; }
				if (existing.stream) { existing.stream.getTracks().forEach(t => t.stop()); }
				channelTexStates.delete(ch.id);
			}
			if (!ch.url || !ch.type) continue;
			const tex = gl.createTexture();
			if (!tex) continue;

			const filter = ch.filter ?? 'linear';
			const wrap = ch.wrap ?? 'clamp';
			const minFilter = filter === 'nearest' ? gl.NEAREST : filter === 'linear-mipmap' ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
			const magFilter = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
			const wrapMode = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;

			if (ch.type === 'video') {
				const video = document.createElement('video');
				video.src = ch.url;
				video.loop = true;
				video.muted = true;
				video.autoplay = true;
				video.playsInline = true;
				video.play().catch(() => {});
				gl.bindTexture(gl.TEXTURE_2D, tex);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
				gl.bindTexture(gl.TEXTURE_2D, null);
				channelTexStates.set(ch.id, { texture: tex, videoEl: video, stream: null, url: ch.url });
			} else if (ch.type === 'webcam') {
				const video = document.createElement('video');
				video.autoplay = true;
				video.playsInline = true;
				video.muted = true;
				navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
					.then(stream => {
						video.srcObject = stream;
						video.play().catch(() => {});
					})
					.catch(err => console.error('Webcam error:', err));
				gl.bindTexture(gl.TEXTURE_2D, tex);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
				gl.bindTexture(gl.TEXTURE_2D, null);
				channelTexStates.set(ch.id, { texture: tex, videoEl: video, stream: null, url: ch.url });
			} else {
				const img = new window.Image();
				img.onload = () => {
					if (!gl) return;
					gl.bindTexture(gl.TEXTURE_2D, tex);
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
					if (filter === 'linear-mipmap') {
						gl.generateMipmap(gl.TEXTURE_2D);
					}
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
					gl.bindTexture(gl.TEXTURE_2D, null);
				};
				img.onerror = () => {
					console.error('Failed to load image:', ch.url);
				};
				img.src = ch.url;
				gl.bindTexture(gl.TEXTURE_2D, tex);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
				gl.bindTexture(gl.TEXTURE_2D, null);
				channelTexStates.set(ch.id, { texture: tex, videoEl: null, stream: null, url: ch.url });
			}
		}
		// Clean up removed channels
		for (const [id, state] of channelTexStates.entries()) {
			const still = channels.find((c) => c.id === id && c.url && c.type !== 'buffer');
			if (!still) {
				gl.deleteTexture(state.texture);
				if (state.videoEl) { state.videoEl.pause(); state.videoEl.src = ''; state.videoEl.srcObject = null; }
				if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); }
				channelTexStates.delete(id);
			}
		}
	}

	function bindChannelTextures(locs: ProgramLocs, currentTarget: string) {
		if (!gl) return;
		// Image/video channels
		for (const [id, state] of channelTexStates.entries()) {
			if (id >= CHANNEL_UNIFORM_NAMES.length) continue;
			const loc = locs.channels[id];
			if (loc) {
				const unit = 8 + id;
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_2D, state.texture);
				gl.uniform1i(loc, unit);
			}
		}
		// Buffer channels: always bind the PREVIOUS frame's texture (prevIdx).
		// This safely handles self-referencing buffers (ping-pong diffusion/feedback).
		for (const ch of channels) {
			if (ch.type !== 'buffer' || !ch.bufferId) continue;
			if (ch.id >= CHANNEL_UNIFORM_NAMES.length) continue;
			const unit = 8 + ch.id;
			const bufState = bufferStates.get(ch.bufferId);
			const prevTex = bufState?.texture[bufState.prevIdx] ?? null;
			const loc = locs.channels[ch.id];
			gl.activeTexture(gl.TEXTURE0 + unit);
			if (loc && prevTex) {
				gl.bindTexture(gl.TEXTURE_2D, prevTex);
				gl.uniform1i(loc, unit);
			} else {
				gl.bindTexture(gl.TEXTURE_2D, null);
			}
		}
	}

	$effect(() => {
		const _channels = channels;
		if (gl) updateChannelTextures();
	});

	function drawQuad(locs: ProgramLocs) {
		if (!gl || !quadBuffer) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
		gl.enableVertexAttribArray(locs.aPosition);
		gl.vertexAttribPointer(locs.aPosition, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	// Thumbnail capture (every 500ms)
	function captureThumbnails() {
		if (!gl || !canvas) return;
		const newThumbs: Record<string, string> = {};
		const w = canvas.width;
		const h = canvas.height;

		for (const id of userBufferOrder()) {
			const state = bufferStates.get(id);
			// After the ping-pong flip, prevIdx now points to the most recently written FBO
			const readFbo = state?.fbo[state.prevIdx] ?? null;
			if (!readFbo) continue;

			const pixels = new Uint8Array(w * h * 4);
			gl.bindFramebuffer(gl.FRAMEBUFFER, readFbo);
			gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);

			// Flip Y (WebGL is Y-up) and downscale
			const full = document.createElement('canvas');
			full.width = w; full.height = h;
			const fCtx = full.getContext('2d')!;
			const imgData = fCtx.createImageData(w, h);
			for (let row = 0; row < h; row++) {
				const src = (h - 1 - row) * w * 4;
				imgData.data.set(pixels.subarray(src, src + w * 4), row * w * 4);
			}
			fCtx.putImageData(imgData, 0, 0);

			const tmp = document.createElement('canvas');
			tmp.width = THUMB_W; tmp.height = THUMB_H;
			tmp.getContext('2d')!.drawImage(full, 0, 0, THUMB_W, THUMB_H);
			newThumbs[id] = tmp.toDataURL('image/jpeg', 0.8);
		}

		// Image thumbnail from main canvas
		newThumbs['image'] = canvas.toDataURL('image/jpeg', 0.8);
		thumbnails = { ...thumbnails, ...newThumbs };
	}

	function renderFrame() {
		if (!gl || !canvas) return;
		const w = canvas.width;
		const h = canvas.height;
		ensureFboSize(w, h);

		const currentTime = Date.now();
		const elapsed = (currentTime - startTime) / 1000;
		const deltaTime = lastFrameTime > 0 ? (currentTime - lastFrameTime) / 1000 : 0;
		lastFrameTime = currentTime;
		frameCount++;
		if (deltaTime > 0) fps = fps * 0.9 + (1 / deltaTime) * 0.1;

		// Compute now once - shared between uniform upload and display values.
		const now = new Date();
		uniformValues = {
			uTime: elapsed.toFixed(2) + 's',
			uResolution: `${w} × ${h}`,
			uMouse: `${mouseX.toFixed(0)}, ${mouseY.toFixed(0)}`,
			uFrameRate: fps.toFixed(1) + ' fps',
			uDeltaTime: (deltaTime * 1000).toFixed(2) + 'ms',
			uFrameCount: frameCount.toString(),
			uDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
			uAspect: (w / h).toFixed(2),
		};

		// Upload current video frames to their textures
		for (const [, state] of channelTexStates.entries()) {
			if (state.videoEl && state.videoEl.readyState >= 2) {
				gl.bindTexture(gl.TEXTURE_2D, state.texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.videoEl);
				gl.bindTexture(gl.TEXTURE_2D, null);
			}
		}

		// Compute order once per frame - reused by the render loop and ping-pong flip.
		const userOrder = userBufferOrder();
		for (const id of [...userOrder, 'image']) {
			const state = bufferStates.get(id);
			if (!state?.program || !state.locs) continue;

			// Write into fbo[1 - prevIdx]; fbo[prevIdx] holds the previous frame (readable by channels)
			const writeFbo = id === 'image' ? null : (state.fbo[1 - state.prevIdx] ?? null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
			gl.viewport(0, 0, w, h);
			gl.useProgram(state.program);
			bindBufferTextures(state.locs, id, userOrder);
			bindChannelTextures(state.locs, id);
			setStandardUniforms(state.locs, elapsed, deltaTime, now);
			drawQuad(state.locs);
		}

		// Flip ping-pong index: what was just written becomes the new "previous" frame for channels
		for (const id of userOrder) {
			const s = bufferStates.get(id);
			if (s) s.prevIdx = 1 - s.prevIdx;
		}

		if (currentTime - lastThumbTime > 500) {
			lastThumbTime = currentTime;
			captureThumbnails();
		}

		animationId = requestAnimationFrame(renderFrame);
	}

	// Mount
	onMount(() => {
		if (!canvas || !wrapper) return;
		gl = canvas.getContext('webgl', {
			powerPreference: 'high-performance',
			antialias: false,
			alpha: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: false,
		});
		if (gl) {
			const floatExt = gl.getExtension('OES_texture_float');
			if (floatExt) {
				gl.getExtension('OES_texture_float_linear');
				fboTexType = 0x1406; // FLOAT
			}
		}

		const handleMouseMove = (e: MouseEvent) => {
			const rect = canvas!.getBoundingClientRect();
			mouseX = e.clientX - rect.left;
			mouseY = rect.height - (e.clientY - rect.top);
		};
		const handleMouseDown = () => { isMouseDown = true; };
		const handleMouseUp = () => { isMouseDown = false; };
		const handleMouseLeave = () => { isMouseDown = false; };
		canvas.addEventListener('mousemove', handleMouseMove);
		canvas.addEventListener('mousedown', handleMouseDown);
		canvas.addEventListener('mouseup', handleMouseUp);
		canvas.addEventListener('mouseleave', handleMouseLeave);

		const handleFullscreenChange = () => { isFullscreen = !!document.fullscreenElement; };
		document.addEventListener('fullscreenchange', handleFullscreenChange);

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'f' || e.key === 'F') {
				const elem = document.activeElement as HTMLElement;
				const isEditingField =
					elem?.tagName === 'INPUT' ||
					elem?.tagName === 'TEXTAREA' ||
					elem?.getAttribute('contenteditable') === 'true' ||
					elem?.classList.contains('monaco-editor') ||
					elem?.closest('.monaco-editor') !== null;
				if (isEditingField) return;
				e.preventDefault();
				toggleFullscreen();
			}
		};
		document.addEventListener('keydown', handleKeyDown);

		const handleEnter = () => { isHovered = true; };
		const handleLeaveWrapper = () => { isHovered = false; };
		wrapper.addEventListener('mouseenter', handleEnter);
		wrapper.addEventListener('mouseleave', handleLeaveWrapper);

		const resizeObserver = new ResizeObserver(() => {
			if (!canvas) return;
			const w = canvas.offsetWidth;
			const h = canvas.offsetHeight;
			if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
				canvas.width = w;
				canvas.height = h;
			}
		});
		resizeObserver.observe(canvas);

		run();

		return () => {
			cancelAnimationFrame(animationId);
			canvas?.removeEventListener('mousemove', handleMouseMove);
			canvas?.removeEventListener('mousedown', handleMouseDown);
			canvas?.removeEventListener('mouseup', handleMouseUp);
			canvas?.removeEventListener('mouseleave', handleMouseLeave);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			document.removeEventListener('keydown', handleKeyDown);
			wrapper?.removeEventListener('mouseenter', handleEnter);
			wrapper?.removeEventListener('mouseleave', handleLeaveWrapper);
			resizeObserver.disconnect();
		};
	});
</script>

<!-- Wrapper -->
<div
	bind:this={wrapper}
	role="application"
	class="flex flex-col bg-black relative min-w-0 flex-1 outline-none"
>
	{#if !isFullscreen}
		<div class="flex items-center gap-3 px-3 py-2 bg-panel border-b border-border text-xs text-muted shrink-0">
			<span class="size-3 bg-green-400 rounded-full shrink-0"></span>
			<span class="font-medium tracking-wider shrink-0">Preview</span>
			<span class="text-muted-foreground shrink-0">•</span>
			<span class="shrink-0">Build: {buildTime.toFixed(2)}ms</span>
			{#if isSavingLocally}
				<span class="ml-auto text-xs px-2 py-1 rounded border border-yellow-600/60 bg-yellow-950/40 text-yellow-400">
					Saved locally
				</span>
			{:else if viewOnly}
				<div class="flex items-center gap-2 ml-auto min-w-0">
					<div class="flex items-center gap-1 text-xs text-muted shrink-0">
						{#if authorId && authorName}
							<a
								href="/users/{authorId}"
								class="hover:text-foreground transition-colors"
							>
								{authorName}
							</a>
							<span>/</span>
						{/if}
						<span class="text-xs font-semibold text-foreground truncate max-w-40">{shaderState.name || 'Untitled Shader'}</span>
					</div>
					<button
						onclick={() => (infosOpen = true)}
						class="flex items-center gap-1 px-2 py-0.5 rounded text-cyan-400/80 border border-cyan-400/40 bg-cyan-400/5 hover:text-cyan-400 hover:bg-cyan-400/15 transition-colors cursor-pointer shrink-0"
						title="Shader info"
					>
						<Info size={11} />
						<span>Informations</span>
					</button>
				</div>
			{:else if !readonly && auth.isLoggedIn}
				<div class="flex items-center gap-2 ml-auto min-w-0">
					<div class="flex items-center gap-1">
						{#if authorId && authorName && authorId !== auth.user?.id}
							<a
								href="/users/{authorId}"
								class="text-xs text-muted hover:text-foreground transition-colors"
							>
								{authorName}
							</a>
							<span class="text-xs text-muted">/</span>
						{/if}
						<input
							type="text"
							bind:value={shaderState.name}
							placeholder="Untitled Shader"
							class="bg-transparent border-none outline-none text-xs font-semibold text-foreground text-right w-40 placeholder:text-subtle hover:bg-surface focus:bg-surface rounded px-2 py-0.5 transition-colors min-w-0"
						/>
					</div>
					<button
						onclick={() => (infosOpen = true)}
						class="flex items-center gap-1 px-2 py-0.5 rounded text-cyan-400/80 border border-cyan-400/40 bg-cyan-400/5 hover:text-cyan-400 hover:bg-cyan-400/15 transition-colors cursor-pointer shrink-0"
						title="Shader info"
					>
						<Info size={11} />
						<span>Informations</span>
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<div class="flex-1 relative overflow-hidden">
		<canvas bind:this={canvas} class="w-full h-full block" width={800} height={600}></canvas>

		<button
			onclick={toggleFullscreen}
			class="absolute bottom-3 right-3 p-1.5 rounded text-white cursor-pointer transition-opacity duration-200"
			style="filter: drop-shadow(0 1px 4px rgba(0,0,0,0.95)); opacity: {isHovered ? 0.5 : 0.1};"
			title={isFullscreen ? 'Quit fullscreen (F)' : 'Fullscreen (F)'}
		>
			{#if isFullscreen}
				<Minimize2 size={18} />
			{:else}
				<Maximize2 size={18} />
			{/if}
		</button>
	</div>

	{#if error}
		<div class="absolute bottom-0 left-0 right-0 flex items-start gap-2 px-4 py-1.5 bg-opacity-15 bg-red-950 border-t border-red-500">
			<CircleAlert size={11} class="text-red-400 shrink-0 mt-1" />
			<pre class="text-red-400 font-mono text-xs leading-normal m-0 whitespace-pre-wrap">{error}</pre>
		</div>
	{/if}
</div>

<ShaderInfoModal bind:open={infosOpen} readonly={viewOnly} />
