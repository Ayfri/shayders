<script lang="ts">
	import EditorPanel from '$lib/EditorPanel.svelte';
	import ShaderCanvas from '$lib/ShaderCanvas.svelte';
	import { type UniformEntry } from '$lib/BuiltinsPanel.svelte';

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

	let fragmentCode = $state(defaultFragmentShader);
	let error = $state('');
	let uniformValues = $state<Record<string, string>>({});
	let panelOpen = $state(false);
	let shaderCanvas = $state<ReturnType<typeof ShaderCanvas> | null>(null);

	const uniformDescriptions: Record<string, string> = {
		uAspect: 'Canvas aspect ratio (width / height).',
		uDate: 'Date and time as (year, month, day, hours * 3600.0 + minutes * 60.0 + seconds)',
		uDeltaTime: 'Time elapsed since last frame in seconds.',
		uFrameCount: 'Total number of frames rendered since start.',
		uFrameRate: 'Frames per second (calculated from delta time).',
		uMouse: 'Mouse position (x, y) in pixels. Z is 1.0 if mouse is pressed, 0.0 otherwise.',
		uResolution: 'Canvas dimensions in pixels (width x height).',
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
		})),
	);

	function run() {
		shaderCanvas?.run();
	}

	// Auto-compile on code changes (debounced)
	let _compileTimer = 0;
	$effect(() => {
		const _code = fragmentCode;
		clearTimeout(_compileTimer);
		_compileTimer = setTimeout(run, 800) as unknown as number;
	});
</script>

<div class="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans">
	<ShaderCanvas bind:this={shaderCanvas} {fragmentCode} bind:error bind:uniformValues />

	<EditorPanel bind:value={fragmentCode} errors={error} onRun={run} uniforms={activeUniforms} bind:panelOpen />
</div>
