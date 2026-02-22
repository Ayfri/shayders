<script lang="ts">
	import { onMount } from 'svelte';
	import { CircleAlert, Maximize2, Minimize2 } from '@lucide/svelte';

	interface Props {
		fragmentCode: string;
		error?: string;
		uniformValues?: Record<string, string>;
	}

	let {
		fragmentCode,
		error = $bindable(''),
		uniformValues = $bindable({}),
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let wrapper = $state<HTMLDivElement | null>(null);
	let gl: WebGLRenderingContext | null = null;
	let animationId = 0;

	// Fullscreen
	let isFullscreen = $state(false);
	let isHovered = $state(false);
	let fsNotif = $state('');
	let fsNotifVisible = $state(false);
	let fsNotifTimer = 0;

	function showFsNotif(text: string) {
		fsNotif = text;
		fsNotifVisible = true;
		clearTimeout(fsNotifTimer);
		fsNotifTimer = setTimeout(() => { fsNotifVisible = false; }, 2500) as unknown as number;
	}

	async function toggleFullscreen() {
		if (!wrapper) return;
		if (!document.fullscreenElement) {
			await wrapper.requestFullscreen();
		} else {
			await document.exitFullscreen();
		}
	}

	// Vertices shader
	const vertexCode = `attribute vec4 aPosition;
void main() {
  gl_Position = aPosition;
}`;

	let program: WebGLProgram | null = null;
	const startTime = Date.now();
	let lastFrameTime = 0;
	let frameCount = 0;
	let fps = 0;

	let mouseX = $state(0);
	let mouseY = $state(0);
	let isMouseDown = $state(false);

	function compileShader(ctx: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
		const shader = ctx.createShader(type);
		if (!shader) return null;
		ctx.shaderSource(shader, source);
		ctx.compileShader(shader);
		if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
			error = ctx.getShaderInfoLog(shader) ?? 'Unknown shader error';
			ctx.deleteShader(shader);
			return null;
		}
		return shader;
	}

	function buildProgram() {
		if (!gl) return;
		error = '';
		const vert = compileShader(gl, gl.VERTEX_SHADER, vertexCode);
		const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragmentCode);
		if (!vert || !frag) return;

		const newProgram = gl.createProgram();
		if (!newProgram) return;
		gl.attachShader(newProgram, vert);
		gl.attachShader(newProgram, frag);
		gl.linkProgram(newProgram);
		if (!gl.getProgramParameter(newProgram, gl.LINK_STATUS)) {
			error = gl.getProgramInfoLog(newProgram) ?? 'Failed to link program';
			return;
		}
		if (program) gl.deleteProgram(program);
		program = newProgram;
	}

	function render() {
		if (!gl || !program || !canvas) return;
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.useProgram(program);

		const currentTime = Date.now();
		const elapsed = (currentTime - startTime) / 1000;
		const deltaTime = lastFrameTime > 0 ? (currentTime - lastFrameTime) / 1000 : 0;
		lastFrameTime = currentTime;
		frameCount++;

		if (deltaTime > 0) {
			fps = fps * 0.9 + (1 / deltaTime) * 0.1;
		}

		const now = new Date();
		const timeOfDay = now.getHours() * 3600.0 + now.getMinutes() * 60.0 + now.getSeconds();

		const uTime = gl.getUniformLocation(program, 'uTime');
		const uRes = gl.getUniformLocation(program, 'uResolution');
		const uMouse = gl.getUniformLocation(program, 'uMouse');
		const uDate = gl.getUniformLocation(program, 'uDate');
		const uFrameRate = gl.getUniformLocation(program, 'uFrameRate');
		const uDeltaTime = gl.getUniformLocation(program, 'uDeltaTime');
		const uFrameCount = gl.getUniformLocation(program, 'uFrameCount');
		const uAspect = gl.getUniformLocation(program, 'uAspect');

		if (uTime) gl.uniform1f(uTime, elapsed);
		if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
		if (uMouse) gl.uniform3f(uMouse, mouseX, mouseY, isMouseDown ? 1.0 : 0.0);
		if (uDate) gl.uniform4f(uDate, now.getFullYear(), now.getMonth() + 1, now.getDate(), timeOfDay);
		if (uFrameRate) gl.uniform1f(uFrameRate, fps);
		if (uDeltaTime) gl.uniform1f(uDeltaTime, deltaTime);
		if (uFrameCount) gl.uniform1i(uFrameCount, frameCount);
		if (uAspect) gl.uniform1f(uAspect, canvas.width / canvas.height);

		uniformValues.uTime = elapsed.toFixed(2) + 's';
		uniformValues.uResolution = `${canvas.width} × ${canvas.height}`;
		uniformValues.uMouse = `${mouseX.toFixed(0)}, ${mouseY.toFixed(0)}`;
		uniformValues.uFrameRate = fps.toFixed(1) + ' fps';
		uniformValues.uDeltaTime = (deltaTime * 1000).toFixed(2) + 'ms';
		uniformValues.uFrameCount = frameCount.toString();
		uniformValues.uDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		uniformValues.uAspect = (canvas.width / canvas.height).toFixed(2);

		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

		const aPos = gl.getAttribLocation(program, 'aPosition');
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		animationId = requestAnimationFrame(render);
	}

	export function run() {
		cancelAnimationFrame(animationId);
		buildProgram();
		animationId = requestAnimationFrame(render);
	}

	onMount(() => {
		if (!canvas || !wrapper) return;
		gl = canvas.getContext('webgl');
		buildProgram();

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

		// Fullscreen change - browser handles Échap natively
		const handleFullscreenChange = () => {
			isFullscreen = !!document.fullscreenElement;
		};
		document.addEventListener('fullscreenchange', handleFullscreenChange);

		// F key to toggle fullscreen (works both when focused and when in fullscreen)
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'f' || e.key === 'F') {
				// Don't intercept when typing in an input
				if (document.activeElement && ['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement).tagName)) return;
				e.preventDefault();
				toggleFullscreen();
			}
		};
		wrapper.addEventListener('keydown', handleKeyDown);
		// Also listen globally so F works while in fullscreen (wrapper is the fullscreen root)
		document.addEventListener('keydown', handleKeyDown);

		// Hover tracking via JS (reliable across fullscreen)
		const handleEnter = () => { isHovered = true; };
		const handleLeaveWrapper = () => { isHovered = false; };
		wrapper.addEventListener('mouseenter', handleEnter);
		wrapper.addEventListener('mouseleave', handleLeaveWrapper);

		// Sync canvas resolution with container
		const resizeObserver = new ResizeObserver(() => {
			if (canvas && wrapper) {
				canvas.width = wrapper.clientWidth;
				canvas.height = wrapper.clientHeight;
			}
		});
		resizeObserver.observe(wrapper);

		animationId = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(animationId);
			canvas?.removeEventListener('mousemove', handleMouseMove);
			canvas?.removeEventListener('mousedown', handleMouseDown);
			canvas?.removeEventListener('mouseup', handleMouseUp);
			canvas?.removeEventListener('mouseleave', handleMouseLeave);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			wrapper?.removeEventListener('keydown', handleKeyDown);
			document.removeEventListener('keydown', handleKeyDown);
			wrapper?.removeEventListener('mouseenter', handleEnter);
			wrapper?.removeEventListener('mouseleave', handleLeaveWrapper);
			resizeObserver.disconnect();
		};
	});
</script>

<!-- Wrapper: tabindex makes it focusable for keyboard events -->
<div
	bind:this={wrapper}
	role="application"
	class="flex flex-col bg-black relative min-w-0 flex-1 outline-none"
>
	{#if !isFullscreen}
		<div class="flex items-center gap-3 px-6 py-2 bg-panel border-b border-border text-xs text-muted shrink-0">
			<span class="size-3 bg-green-400 rounded-full"></span>
			<span class="font-medium tracking-wider">Preview</span>
		</div>
	{/if}

	<div class="flex-1 relative overflow-hidden">
		<canvas bind:this={canvas} class="w-full h-full block" width={800} height={600}></canvas>

		<!-- Fullscreen button -->
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

		<!-- YouTube-style toast -->
		{#if fsNotifVisible}
			<div
				class="absolute bottom-14 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded whitespace-nowrap pointer-events-none"
			>
				{fsNotif}
			</div>
		{/if}
	</div>

	{#if error}
		<div class="absolute bottom-0 left-0 right-0 flex items-start gap-2 px-4 py-1.5 bg-opacity-15 bg-red-950 border-t border-red-500">
			<CircleAlert size={11} class="text-red-400 shrink-0 mt-1" />
			<pre class="text-red-400 font-mono text-xs leading-normal m-0 whitespace-pre-wrap">{error}</pre>
		</div>
	{/if}
</div>
