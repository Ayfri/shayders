<script lang="ts">
	import EditorPanel from '$lib/EditorPanel.svelte';
	import ShaderCanvas, { type ShaderBuffer } from '$lib/ShaderCanvas.svelte';
	import { type UniformEntry } from '$lib/BuiltinsPanel.svelte';

	// Default shaders
	const defaultImageShader = `precision mediump float;
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

	const defaultBufferShader = `precision mediump float;
uniform float uTime;
uniform vec2 uResolution;
// Buffers above this one in the tab order are available as uBufferA, uBufferB, etc. (sampler2D)
// Sample with: texture2D(uBufferA, gl_FragCoord.xy / uResolution)

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(uTime), 1.0);
}`;

	const defaultCommonCode = `// Common -- code prepended to every shader
// precision mediump float;
// #define PI 3.14159265359
`;

	// State
	let buffers = $state<ShaderBuffer[]>([
		{ id: 'image', label: 'Image', code: defaultImageShader },
	]);
	let activeBufferId = $state<string>('image');
	let editorValue = $state(defaultImageShader);

	let error = $state('');
	let uniformValues = $state<Record<string, string>>({});
	let thumbnails = $state<Record<string, string>>({});
	let panelOpen = $state(false);
	let shaderCanvas = $state<ReturnType<typeof ShaderCanvas> | null>(null);

	// Helpers
	function buffersWithLatestCode(): ShaderBuffer[] {
		return buffers.map((b) => (b.id === activeBufferId ? { ...b, code: editorValue } : b));
	}

	function run() {
		buffers = buffersWithLatestCode();
		shaderCanvas?.run();
	}

	function switchTab(id: string) {
		buffers = buffersWithLatestCode();
		activeBufferId = id;
		editorValue = buffers.find((b) => b.id === id)?.code ?? '';
	}

	function addBuffer() {
		// Pick the next sequential numeric ID not yet in use
		let n = 1;
		while (buffers.some((b) => b.id === `buf${n}`)) n++;
		const newId = `buf${n}`;
		const label = `Buffer ${n}`;
		const newBuf: ShaderBuffer = { id: newId, label, code: defaultBufferShader };
		buffers = [...buffersWithLatestCode(), newBuf];
		activeBufferId = newId;
		editorValue = defaultBufferShader;
		setTimeout(() => shaderCanvas?.run(), 0);
	}

	function addCommon() {
		if (buffers.some((b) => b.id === 'common')) return;
		const commonBuf: ShaderBuffer = { id: 'common', label: 'Common', code: defaultCommonCode };
		// Insert common before image
		const saved = buffersWithLatestCode();
		const imageIdx = saved.findIndex((b) => b.id === 'image');
		saved.splice(imageIdx, 0, commonBuf);
		buffers = saved;
		activeBufferId = 'common';
		editorValue = defaultCommonCode;
		setTimeout(() => shaderCanvas?.run(), 0);
	}

	function renameBuffer(id: string, label: string) {
		buffers = buffers.map((b) => (b.id === id ? { ...b, label } : b));
	}

	function removeBuffer(id: string) {
		if (id === 'image') return;
		if (activeBufferId === id) {
			activeBufferId = 'image';
			editorValue = buffers.find((b) => b.id === 'image')?.code ?? '';
		}
		buffers = buffers.filter((b) => b.id !== id);
		setTimeout(() => shaderCanvas?.run(), 0);
	}

	function duplicateBuffer(id: string) {
		const src = buffersWithLatestCode().find((b) => b.id === id);
		if (!src || id === 'image') return;
		let n = 1;
		while (buffers.some((b) => b.id === `buf${n}`)) n++;
		const newId = `buf${n}`;
		const newBuf: ShaderBuffer = { id: newId, label: `${src.label} copy`, code: src.code };
		const saved = buffersWithLatestCode();
		const srcIdx = saved.findIndex((b) => b.id === id);
		saved.splice(srcIdx + 1, 0, newBuf);
		buffers = saved;
		activeBufferId = newId;
		editorValue = newBuf.code;
		setTimeout(() => shaderCanvas?.run(), 0);
	}

	// Uniforms panel
	const BASE_UNIFORM_DESCS: Record<string, string> = {
		uAspect: 'Canvas aspect ratio (width / height).',
		uDate: 'Date and time as (year, month, day, hours * 3600.0 + minutes * 60.0 + seconds)',
		uDeltaTime: 'Time elapsed since last frame in seconds.',
		uFrameCount: 'Total number of frames rendered since start.',
		uFrameRate: 'Frames per second (calculated from delta time).',
		uMouse: 'Mouse position (x, y) in pixels. Z is 1.0 if mouse is pressed, 0.0 otherwise.',
		uResolution: 'Canvas dimensions in pixels (width x height).',
		uTime: 'Elapsed time in seconds since shader start.',
	};
	const BUFFER_UNIFORM_NAMES = ['uBufferA','uBufferB','uBufferC','uBufferD','uBufferE','uBufferF','uBufferG','uBufferH'];

	const uniformDescriptions = $derived((): Record<string, string> => {
		const descs: Record<string, string> = { ...BASE_UNIFORM_DESCS };
		const userBufs = buffers.filter((b) => b.id !== 'image' && b.id !== 'common');
		userBufs.forEach((buf, i) => {
			if (i < BUFFER_UNIFORM_NAMES.length) {
				descs[BUFFER_UNIFORM_NAMES[i]] = `Offscreen "${buf.label}" texture (sampler2D).`;
			}
		});
		return descs;
	});

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
		parseUniforms(editorValue).map(({ type, name }) => ({
			type,
			name,
			description: uniformDescriptions()[name],
			value: uniformValues[name],
		})),
	);

	// Auto-compile (debounced)
	let _compileTimer = 0;
	$effect(() => {
		const _code = editorValue;
		clearTimeout(_compileTimer);
		_compileTimer = setTimeout(run, 800) as unknown as number;
	});
</script>

<div class="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans">
	<ShaderCanvas
		bind:this={shaderCanvas}
		{buffers}
		bind:error
		bind:uniformValues
		bind:thumbnails
	/>

	<EditorPanel
		bind:value={editorValue}
		errors={error}
		onRun={run}
		uniforms={activeUniforms}
		bind:panelOpen
		{buffers}
		{activeBufferId}
		{thumbnails}
		onTabChange={switchTab}
		onAddBuffer={addBuffer}
		onAddCommon={addCommon}
		onRemoveBuffer={removeBuffer}
		onRenameBuffer={renameBuffer}
		onDuplicateBuffer={duplicateBuffer}
	/>
</div>
