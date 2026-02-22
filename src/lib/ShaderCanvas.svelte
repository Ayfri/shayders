<script lang="ts">
	import { onMount } from 'svelte';
	import { CircleAlert, Maximize2, Minimize2 } from '@lucide/svelte';

	// 'image' and 'common' are reserved. All other IDs are user buffers (buf1, buf2, …).
	export type BufferId = string;

	export interface ShaderBuffer {
		id: BufferId;
		label: string;
		code: string;
	}

	interface Props {
		buffers: ShaderBuffer[];
		error?: string;
		uniformValues?: Record<string, string>;
		thumbnails?: Record<string, string>;
	}

	let {
		buffers,
		error = $bindable(''),
		uniformValues = $bindable({}),
		thumbnails = $bindable({}),
	}: Props = $props();

	// Canvas / GL
	let canvas = $state<HTMLCanvasElement | null>(null);
	let wrapper = $state<HTMLDivElement | null>(null);
	let gl: WebGLRenderingContext | null = null;

	// Fullscreen
	let isFullscreen = $state(false);
	let isHovered = $state(false);

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

	// Per-buffer internal state
	interface InternalBufState {
		program: WebGLProgram | null;
		fbo: WebGLFramebuffer | null;
		texture: WebGLTexture | null;
	}
	const bufferStates = new Map<BufferId, InternalBufState>();
	let quadBuffer: WebGLBuffer | null = null;
	let fboWidth = 0;
	let fboHeight = 0;

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
		ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, null);
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
			if (id === 'image' || id === 'common' || !state.texture) continue;
			gl.bindTexture(gl.TEXTURE_2D, state.texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.bindTexture(gl.TEXTURE_2D, null);
		}
	}

	// Build all programs
	// Returns the ordered list of user buffer IDs (excludes 'image' and 'common')
	function userBufferOrder(): string[] {
		return buffers.filter((b) => b.id !== 'image' && b.id !== 'common').map((b) => b.id);
	}

	export function run() {
		if (!gl) return;
		cancelAnimationFrame(animationId);
		startTime = Date.now();
		lastFrameTime = 0;
		frameCount = 0;
		fps = 0;
		error = '';

		const t0 = performance.now();
		const errors: string[] = [];

		// Prepend common code (if any) to every shader
		const commonCode = buffers.find((b) => b.id === 'common')?.code ?? '';
		const withCommon = (code: string) => (commonCode ? commonCode + '\n' + code : code);

		// Dynamic render order: user buffers first (in declaration order), then image
		const renderOrder = [...userBufferOrder(), 'image'];

		// Clean up stale GL state for buffers that no longer exist
		for (const id of bufferStates.keys()) {
			if (!renderOrder.includes(id)) {
				const s = bufferStates.get(id)!;
				if (s.program) gl.deleteProgram(s.program);
				if (s.fbo) gl.deleteFramebuffer(s.fbo);
				if (s.texture) gl.deleteTexture(s.texture);
				bufferStates.delete(id);
			}
		}

		for (const id of renderOrder) {
			const buf = buffers.find((b) => b.id === id);
			if (!buf) continue;

			const existing = bufferStates.get(id);
			if (existing?.program) gl.deleteProgram(existing.program);

			const { program, err } = buildSingleProgram(gl, withCommon(buf.code), buf.label);
			if (err) errors.push(err);

			let fbo = existing?.fbo ?? null;
			let texture = existing?.texture ?? null;

			if (id !== 'image' && (!fbo || !texture)) {
				const dims = createFbo(gl, canvas?.width ?? 800, canvas?.height ?? 600);
				if (dims) { fbo = dims.fbo; texture = dims.texture; }
			}

			bufferStates.set(id, { program, fbo, texture });
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

	// Uniform helpers
	function setStandardUniforms(prog: WebGLProgram, elapsed: number, deltaTime: number) {
		if (!gl || !canvas) return;
		const now = new Date();
		const tofDay = now.getHours() * 3600.0 + now.getMinutes() * 60.0 + now.getSeconds();
		const w = canvas.width, h = canvas.height;

		const u1f = (n: string, v: number) => { const l = gl!.getUniformLocation(prog, n); if (l) gl!.uniform1f(l, v); };
		const u2f = (n: string, a: number, b: number) => { const l = gl!.getUniformLocation(prog, n); if (l) gl!.uniform2f(l, a, b); };
		const u3f = (n: string, a: number, b: number, c: number) => { const l = gl!.getUniformLocation(prog, n); if (l) gl!.uniform3f(l, a, b, c); };
		const u4f = (n: string, a: number, b: number, c: number, d: number) => { const l = gl!.getUniformLocation(prog, n); if (l) gl!.uniform4f(l, a, b, c, d); };
		const u1i = (n: string, v: number) => { const l = gl!.getUniformLocation(prog, n); if (l) gl!.uniform1i(l, v); };

		u1f('uTime', elapsed);
		u2f('uResolution', w, h);
		u3f('uMouse', mouseX, mouseY, isMouseDown ? 1.0 : 0.0);
		u4f('uDate', now.getFullYear(), now.getMonth() + 1, now.getDate(), tofDay);
		u1f('uFrameRate', fps);
		u1f('uDeltaTime', deltaTime);
		u1i('uFrameCount', frameCount);
		u1f('uAspect', w / h);
	}

	// Buffer texture bindings
	// User buffers are exposed as uBufferA, uBufferB, … (by declaration position, not ID)
	// User buffers are exposed as uBufferA, uBufferB, … (by declaration position, not ID)
	const BUFFER_UNIFORM_NAMES = ['uBufferA','uBufferB','uBufferC','uBufferD','uBufferE','uBufferF','uBufferG','uBufferH'];

	function bindBufferTextures(prog: WebGLProgram) {
		if (!gl) return;
		const order = userBufferOrder();
		for (let i = 0; i < order.length && i < BUFFER_UNIFORM_NAMES.length; i++) {
			const state = bufferStates.get(order[i]);
			if (!state?.texture) continue;
			const loc = gl.getUniformLocation(prog, BUFFER_UNIFORM_NAMES[i]);
			if (loc) {
				gl.activeTexture(gl.TEXTURE0 + i);
				gl.bindTexture(gl.TEXTURE_2D, state.texture);
				gl.uniform1i(loc, i);
			}
		}
	}

	function drawQuad(prog: WebGLProgram) {
		if (!gl || !quadBuffer) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
		const aPos = gl.getAttribLocation(prog, 'aPosition');
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
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
			if (!state?.fbo) continue;

			const pixels = new Uint8Array(w * h * 4);
			gl.bindFramebuffer(gl.FRAMEBUFFER, state.fbo);
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

	// Main render loop
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

		for (const id of [...userBufferOrder(), 'image']) {
			const state = bufferStates.get(id);
			if (!state?.program) continue;

			gl.bindFramebuffer(gl.FRAMEBUFFER, id === 'image' ? null : (state.fbo ?? null));
			gl.viewport(0, 0, w, h);
			gl.useProgram(state.program);
			bindBufferTextures(state.program);
			setStandardUniforms(state.program, elapsed, deltaTime);
			drawQuad(state.program);
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
		gl = canvas.getContext('webgl');

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
			if (canvas && wrapper) {
				canvas.width = wrapper.clientWidth;
				canvas.height = wrapper.clientHeight;
			}
		});
		resizeObserver.observe(wrapper);

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
		<div class="flex items-center gap-3 px-6 py-2 bg-panel border-b border-border text-xs text-muted shrink-0">
			<span class="size-3 bg-green-400 rounded-full"></span>
			<span class="font-medium tracking-wider">Preview</span>
			<span class="text-muted-foreground">•</span>
			<span>Build: {buildTime.toFixed(2)}ms</span>
		</div>
	{/if}

	<div class="flex-1 relative overflow-hidden">
		<canvas bind:this={canvas} class="w-full h-full block" width={800} height={600}></canvas>

		<button
			onclick={toggleFullscreen}
			class="absolute bottom-3 right-3 p-1.5 rounded text-white cursor-pointer transition-opacity duration-200"
			style="filter: drop-shadow(0 1px 4px rgba(0,0,0,0.95)); opacity: {isHovered ? 0.5 : 0.1};"
			title={isFullscreen ? 'Quitter le plein écran (F)' : 'Plein écran (F)'}
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
