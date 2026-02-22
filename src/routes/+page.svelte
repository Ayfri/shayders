<script lang="ts">
	import { onMount } from 'svelte';
	import { Play, Code, CircleAlert } from '@lucide/svelte';
    import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';
	import { language, conf } from '$lib/glsl';

	let canvas = $state<HTMLCanvasElement | null>(null);
	let gl: WebGLRenderingContext | null = null;
	let animationId = 0;
	let error = $state('');

	const defaultVertexShader = `attribute vec4 aPosition;
void main() {
  gl_Position = aPosition;
}`;

	const defaultFragmentShader = `precision mediump float;
uniform float uTime;
uniform vec2 uResolution;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0, 2, 4));
  gl_FragColor = vec4(col, 1.0);
}`;

	let vertexCode = defaultVertexShader;
	let fragmentCode = $state(defaultFragmentShader);

    let editorContainer = $state<HTMLElement | null>(null);
	let editor: Monaco.editor.IStandaloneCodeEditor | null = null;

	let program: WebGLProgram | null = null;
	const startTime = Date.now();

    $effect(() => {
		if (!editorContainer) return;
		let isDestroyed = false;

		import('monaco-editor').then(async (monaco) => {
			if (isDestroyed || !editorContainer) return;

            monaco.languages.register({ id: 'glsl' });
            monaco.languages.setMonarchTokensProvider('glsl', language);
            monaco.languages.setLanguageConfiguration('glsl', conf);

			const EditorWorker = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
			self.MonacoEnvironment = {
				getWorker: () => new EditorWorker.default(),
			};

			editor = monaco.editor.create(editorContainer, {
				automaticLayout: true,
				fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
				fontSize: 14,
				language: 'glsl',
				minimap: { enabled: false },
				padding: { top: 16 },
				theme: 'vs-dark',
				value: fragmentCode,
			});

			editor.onDidChangeModelContent(() => {
				fragmentCode = editor?.getValue() || '';
			});

			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
		});

		return () => {
			isDestroyed = true;
			editor?.dispose();
		};
	});


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

		const uTime = gl.getUniformLocation(program, 'uTime');
		const uRes = gl.getUniformLocation(program, 'uResolution');
		if (uTime) gl.uniform1f(uTime, (Date.now() - startTime) / 1000);
		if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);

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
		animationId = requestAnimationFrame(render);
		return () => cancelAnimationFrame(animationId);
	});

	function run() {
		cancelAnimationFrame(animationId);
		buildProgram();
		animationId = requestAnimationFrame(render);
	}
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

		<div bind:this={editorContainer} class="flex-1 w-full bg-surface"></div>
	</div>
</div>
