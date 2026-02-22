<script lang="ts">
	import EditorPanel from '$lib/EditorPanel.svelte';
	import ShaderCanvas, { type ShaderBuffer } from '$lib/ShaderCanvas.svelte';
	import { type UniformEntry } from '$lib/BuiltinsPanel.svelte';
	import { type ChannelEntry } from '$lib/ChannelsPanel.svelte';

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
	let channels = $state<ChannelEntry[]>([
		{ id: 0, type: null, url: null, name: null },
		{ id: 1, type: null, url: null, name: null },
		{ id: 2, type: null, url: null, name: null },
		{ id: 3, type: null, url: null, name: null },
	]);

	function handleChannelChange(ch: ChannelEntry) {
		channels = channels.map((c) => (c.id === ch.id ? ch : c));
	}

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
	const UNIFORM_CATALOG_BASE: { name: string; type: string }[] = [
		{ name: 'uAspect', type: 'float' },
		{ name: 'uDate', type: 'vec4' },
		{ name: 'uDeltaTime', type: 'float' },
		{ name: 'uFrameCount', type: 'int' },
		{ name: 'uFrameRate', type: 'float' },
		{ name: 'uMouse', type: 'vec3' },
		{ name: 'uResolution', type: 'vec2' },
		{ name: 'uTime', type: 'float' },
		{ name: 'uChannel0', type: 'sampler2D' },
		{ name: 'uChannel1', type: 'sampler2D' },
		{ name: 'uChannel2', type: 'sampler2D' },
		{ name: 'uChannel3', type: 'sampler2D' },
	];

	const BASE_UNIFORM_DESCS: Record<string, string> = {
		uAspect: 'Canvas aspect ratio (width / height).',
		uDate: 'Date and time as (year, month, day, hours * 3600.0 + minutes * 60.0 + seconds)',
		uDeltaTime: 'Time elapsed since last frame in seconds.',
		uFrameCount: 'Total number of frames rendered since start.',
		uFrameRate: 'Frames per second (calculated from delta time).',
		uMouse: 'Mouse position (x, y) in pixels. Z is 1.0 if mouse is pressed, 0.0 otherwise.',
		uResolution: 'Canvas dimensions in pixels (width x height).',
		uTime: 'Elapsed time in seconds since shader start.',
		uChannel0: 'Channel 0 texture input (sampler2D — image or video).',
		uChannel1: 'Channel 1 texture input (sampler2D — image or video).',
		uChannel2: 'Channel 2 texture input (sampler2D — image or video).',
		uChannel3: 'Channel 3 texture input (sampler2D — image or video).',
	};
	const BUFFER_UNIFORM_NAMES = ['uBufferA','uBufferB','uBufferC','uBufferD','uBufferE','uBufferF','uBufferG','uBufferH'];

	const allUniforms = $derived<UniformEntry[]>((() => {
		const userBufs = buffers.filter((b) => b.id !== 'image' && b.id !== 'common');
		const catalog: { name: string; type: string; description?: string }[] = [...UNIFORM_CATALOG_BASE];
		userBufs.forEach((buf, i) => {
			if (i < BUFFER_UNIFORM_NAMES.length) {
				catalog.push({
					name: BUFFER_UNIFORM_NAMES[i],
					type: 'sampler2D',
					description: `Offscreen "${buf.label}" texture (sampler2D).`,
				});
			}
		});
		// Append any user-declared uniforms not in the catalog
		const parsed = parseUniforms(editorValue);
		const catalogNames = new Set(catalog.map((c) => c.name));
		for (const pu of parsed) {
			if (!catalogNames.has(pu.name)) {
				catalog.push({ name: pu.name, type: pu.type, description: undefined });
			}
		}
		return catalog.map(({ name, type, description }) => ({
			name,
			type,
			description: description ?? BASE_UNIFORM_DESCS[name],
			value: uniformValues[name],
		}));
	})());

	function parseUniforms(code: string): { name: string; type: string }[] {
		const regex = /^\s*uniform\s+(\w+)\s+(\w+)\s*;/gm;
		const results: { name: string; type: string }[] = [];
		let match: RegExpExecArray | null;
		while ((match = regex.exec(code)) !== null) {
			results.push({ type: match[1], name: match[2] });
		}
		return results;
	}

	const presentNames = $derived<Set<string>>(
		new Set(parseUniforms(editorValue).map((u) => u.name))
	);

	function toggleUniform(name: string, type: string) {
		const line = `uniform ${type} ${name};`;
		if (presentNames.has(name)) {
			// Remove the line (any whitespace variant)
			editorValue = editorValue.replace(
				new RegExp(`[ \\t]*uniform\\s+\\S+\\s+${name}\\s*;[ \\t]*\\n?`, 'm'),
				''
			);
		} else {
			// Insert after last existing uniform, or after precision, or at top
			const lines = editorValue.split('\n');
			let insertAt = 0;
			let lastUniform = -1;
			let lastPrecision = -1;
			for (let i = 0; i < lines.length; i++) {
				if (/^\s*uniform\s/.test(lines[i])) lastUniform = i;
				if (/^\s*precision\s/.test(lines[i])) lastPrecision = i;
			}
			if (lastUniform >= 0) insertAt = lastUniform + 1;
			else if (lastPrecision >= 0) insertAt = lastPrecision + 1;
			lines.splice(insertAt, 0, line);
			editorValue = lines.join('\n');
		}
		run();
	}

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
		{channels}
		bind:error
		bind:uniformValues
		bind:thumbnails
	/>

	<EditorPanel
		bind:value={editorValue}
		errors={error}
		onRun={run}
		uniforms={allUniforms}
		{presentNames}
		onToggleUniform={toggleUniform}
		bind:panelOpen
		{buffers}
		{activeBufferId}
		{thumbnails}
		{channels}
		onChannelChange={handleChannelChange}
		onTabChange={switchTab}
		onAddBuffer={addBuffer}
		onAddCommon={addCommon}
		onRemoveBuffer={removeBuffer}
		onRenameBuffer={renameBuffer}
		onDuplicateBuffer={duplicateBuffer}
	/>
</div>
