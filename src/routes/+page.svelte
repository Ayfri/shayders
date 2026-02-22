<script lang="ts">
	import { onMount } from 'svelte';
	import { Play, Code, CircleAlert } from '@lucide/svelte';
	import GlslEditor from '$lib/GlslEditor.svelte';
	import BuiltinsPanel, { type UniformEntry } from '$lib/BuiltinsPanel.svelte';

	let canvas = $state<HTMLCanvasElement | null>(null);
	let gl: WebGLRenderingContext | null = null;
	let animationId = 0;
	let error = $state('');

	const defaultVertexShader = `attribute vec4 aPosition;
void main() {
  gl_Position = aPosition;
}`;

	const defaultFragmentShader = `precision mediump float;
uniform float uAspect;
uniform float uDeltaTime;
uniform float uFrameRate;
uniform float uTime;
uniform int uFrameCount;
uniform vec2 uResolution;
uniform vec3 uMouse;
uniform vec4 uDate;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 mouse = uMouse.xy / uResolution;
  float dist = length(uv - mouse);
  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0, 2, 4));
  col += 0.3 * (1.0 - dist * 3.0);
  gl_FragColor = vec4(col, 1.0);
}`;

	let vertexCode = defaultVertexShader;
	let fragmentCode = $state(defaultFragmentShader);

	let program: WebGLProgram | null = null;
	const startTime = Date.now();
	let lastFrameTime = 0;
	let frameCount = 0;
	let fps = 0;

	// Tracking uniforms
	let mouseX = $state(0);
	let mouseY = $state(0);
	let isMouseDown = $state(false);

	// Built-ins panel
	let panelOpen = $state(false);
	let uniformValues = $state<Record<string, string>>({});

	const uniformDescriptions: Record<string, string> = {
		uAspect: 'Canvas aspect ratio (width / height).',
		uDate: 'Date and time as (year, month, day, hours * 3600.0 + minutes * 60.0 + seconds)',
		uDeltaTime: 'Time elapsed since last frame in seconds.',
		uFrameCount: 'Total number of frames rendered since start.',
		uFrameRate: 'Frames per second (calculated from delta time).',
		uMouse: 'Mouse position (x, y) in pixels. Z is 1.0 if mouse is pressed, 0.0 otherwise.',
		uResolution: 'Canvas dimensions in pixels (width × height).',
		uTime: 'Elapsed time in seconds since shader start.',
	};

	function parseUniforms(code: string): { name: string; type: string }[] {
		const regex = /^\s*uniform\s+(\w+)\s+(\w+)\s*;/gm;
		const results: { name: string; type: string }[] = [];
		let match: RegExpExecArray | null;
		while ((match = regex.exec(code)) !== null) {
			results.push({ type: match[1], name: match[2] });
		}
		return results;
	}

	let activeUniforms = $derived<UniformEntry[]>(
		parseUniforms(fragmentCode).map(({ type, name }) => ({
			type,
			name,
			description: uniformDescriptions[name],
			value: uniformValues[name],
		}))
	);


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

		// Time calculations
		const currentTime = Date.now();
		const elapsed = (currentTime - startTime) / 1000;
		const deltaTime = lastFrameTime > 0 ? (currentTime - lastFrameTime) / 1000 : 0;
		lastFrameTime = currentTime;
		frameCount++;

		// Calculate FPS (smoothed)
		if (deltaTime > 0) {
			fps = fps * 0.9 + (1 / deltaTime) * 0.1;
		}

		// Date/Time
		const now = new Date();
		const hours = now.getHours();
		const minutes = now.getMinutes();
		const seconds = now.getSeconds();
		const timeOfDay = hours * 3600.0 + minutes * 60.0 + seconds;

		// Set uniforms
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

		// Update panel values
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

	onMount(() => {
		if (!canvas) return;
		gl = canvas.getContext('webgl');
		buildProgram();

		// Mouse tracking
		const handleMouseMove = (e: MouseEvent) => {
			const rect = canvas!.getBoundingClientRect();
			mouseX = e.clientX - rect.left;
			mouseY = rect.height - (e.clientY - rect.top); // Flip Y to match OpenGL coordinates
		};

		const handleMouseDown = () => {
			isMouseDown = true;
		};

		const handleMouseUp = () => {
			isMouseDown = false;
		};

		const handleMouseLeave = () => {
			isMouseDown = false;
		};

		canvas.addEventListener('mousemove', handleMouseMove);
		canvas.addEventListener('mousedown', handleMouseDown);
		canvas.addEventListener('mouseup', handleMouseUp);
		canvas.addEventListener('mouseleave', handleMouseLeave);

		animationId = requestAnimationFrame(render);
		return () => {
			cancelAnimationFrame(animationId);
			canvas?.removeEventListener('mousemove', handleMouseMove);
			canvas?.removeEventListener('mousedown', handleMouseDown);
			canvas?.removeEventListener('mouseup', handleMouseUp);
			canvas?.removeEventListener('mouseleave', handleMouseLeave);
		};
	});

	function run() {
		cancelAnimationFrame(animationId);
		buildProgram();
		animationId = requestAnimationFrame(render);
	}

	// ── Auto-compile on code changes (debounced) ──────────────────────────
	let _compileTimer = 0;
	$effect(() => {
		const _code = fragmentCode; // track reactive dependency
		clearTimeout(_compileTimer);
		_compileTimer = setTimeout(run, 800) as unknown as number;
	});
</script>

<div class="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans">
	<!-- Preview panel -->
	<div class="flex flex-3 flex-col bg-black relative min-w-0">
		<div class="flex items-center gap-3 px-6 py-2 bg-panel border-b border-border text-xs text-muted shrink-0">
			<span class="size-3 bg-green-400 rounded-full"></span>
			<span class="font-medium tracking-wider">Preview</span>
		</div>
		<div class="flex-1 relative">
			<canvas bind:this={canvas} class="w-full h-full block" width={800} height={600}></canvas>
		</div>
		{#if error}
			<div class="absolute bottom-0 left-0 right-0 flex items-start gap-2 px-4 py-1.5 bg-opacity-15 bg-red-950 border-t border-red-500">
				<CircleAlert size={11} class="text-red-400 shrink-0 mt-1" />
				<pre class="text-red-400 font-mono text-xs leading-normal m-0 whitespace-pre-wrap">{error}</pre>
			</div>
		{/if}
	</div>

	<!-- Divider -->
	<div class="w-px bg-border shrink-0"></div>

	<!-- Editor panel -->
	<div class="flex flex-2 flex-col min-w-0 bg-surface">
		<div class="flex items-center gap-4 px-6 py-2 bg-panel border-b border-border text-xs text-muted shrink-0">
			<Code size={14} class="text-cyan-400 shrink-0" />
			<span class="font-medium tracking-wider">fragment.glsl</span>
			<span class="text-xs text-subtle font-mono ml-auto">Ctrl+Enter</span>
			<button
				onclick={run}
				class="flex items-center gap-2 px-4 py-1.5 bg-opacity-12 text-cyan-400 border border-cyan-400 rounded font-mono text-xs font-semibold tracking-wider cursor-pointer"
			>
				<Play size={13} />
				Run
			</button>
		</div>

		<GlslEditor bind:value={fragmentCode} errors={error} onRun={run} />
		<BuiltinsPanel uniforms={activeUniforms} bind:open={panelOpen} />
	</div>
</div>
