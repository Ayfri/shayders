<script lang="ts">
	import EditorPanel from '$lib/components/EditorPanel.svelte';
	import ShaderCanvas, { type ShaderBuffer } from '$lib/components/ShaderCanvas.svelte';
	import { type UniformEntry } from '$lib/components/BuiltinsPanel.svelte';
	import { type ChannelEntry } from '$lib/components/ChannelsPanel.svelte';
	import { UNIFORM_DOCS } from '$lib/glsl/builtins';
	import { auth } from '$lib/auth.svelte';
	import { pb } from '$lib/pocketbase';
	import { shaderState } from '$lib/shaderState.svelte';
	import { replaceState } from '$app/navigation';
	import { defaultImageShader, defaultBufferShader, defaultCommonCode } from '$lib/defaultShaders';
	import type { ShadersVisiblityOptions } from '$lib/pocketbase-types';

	interface Props {
		initialId?: string;
		initialName?: string;
		initialDescription?: string;
		initialVisiblity?: keyof typeof ShadersVisiblityOptions;
		initialBuffers?: ShaderBuffer[];
	}

	let { initialId, initialName, initialDescription, initialVisiblity, initialBuffers }: Props = $props();

	// State - initialized with defaults, overridden from props in $effect.pre below
	let buffers = $state<ShaderBuffer[]>([{ id: 'image', label: 'Image', code: defaultImageShader }]);
	let activeBufferId = $state<string>('image');
	let editorValue = $state<string>(defaultImageShader);

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

	// Initialize all prop-driven state before first paint
	$effect.pre(() => {
		const bufs = initialBuffers ?? [{ id: 'image', label: 'Image', code: defaultImageShader }];
		buffers = bufs;
		const startBuf = bufs.find((b) => b.id === 'image') ?? bufs[0];
		editorValue = startBuf?.code ?? defaultImageShader;
		activeBufferId = startBuf?.id ?? 'image';
		shaderState.currentShaderId = initialId ?? null;
		shaderState.name = initialName ?? 'Untitled Shader';
		shaderState.description = initialDescription ?? '';
		shaderState.visiblity = (initialVisiblity ?? 'public') as keyof typeof ShadersVisiblityOptions;
	});

	const BUFFER_UNIFORM_NAMES = ['uBufferA','uBufferB','uBufferC','uBufferD','uBufferE','uBufferF','uBufferG','uBufferH'];

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

	// Uniform line helpers
	function addUniformLine(code: string, name: string, type: string): string {
		if (new RegExp(`\\buniform\\s+\\S+\\s+${name}\\s*;`).test(code)) return code;
		const line = `uniform ${type} ${name};`;
		const lines = code.split('\n');
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
		return lines.join('\n');
	}

	function removeUniformLine(code: string, name: string): string {
		return code.replace(
			new RegExp(`[ \\t]*uniform\\s+\\S+\\s+${name}\\s*;[ \\t]*\\n?`, 'm'),
			''
		);
	}

	function handleChannelChange(ch: ChannelEntry) {
		const oldCh = channels.find((c) => c.id === ch.id);
		const wasActive = oldCh?.type != null;
		const isActive = ch.type != null;
		const uniformName = `uChannel${ch.id}`;
		channels = channels.map((c) => (c.id === ch.id ? ch : c));
		if (!wasActive && isActive) {
			const saved = buffersWithLatestCode();
			const updated = saved.map((b) =>
				b.id === 'common' ? b : { ...b, code: addUniformLine(b.code, uniformName, 'sampler2D') }
			);
			buffers = updated;
			editorValue = updated.find((b) => b.id === activeBufferId)?.code ?? editorValue;
			setTimeout(() => shaderCanvas?.run(), 0);
		} else if (wasActive && !isActive) {
			const saved = buffersWithLatestCode();
			const updated = saved.map((b) =>
				b.id === 'common' ? b : { ...b, code: removeUniformLine(b.code, uniformName) }
			);
			buffers = updated;
			editorValue = updated.find((b) => b.id === activeBufferId)?.code ?? editorValue;
			setTimeout(() => shaderCanvas?.run(), 0);
		}
	}

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
		let n = 1;
		while (buffers.some((b) => b.id === `buf${n}`)) n++;
		const newId = `buf${n}`;
		const label = `Buffer ${n}`;
		const userBufs = buffers.filter((b) => b.id !== 'image' && b.id !== 'common');
		const newUniformName = BUFFER_UNIFORM_NAMES[userBufs.length];
		const saved = buffersWithLatestCode();
		const updatedExisting = saved.map((b) =>
			b.id === 'common' ? b : { ...b, code: addUniformLine(b.code, newUniformName, 'sampler2D') }
		);
		const newBuf: ShaderBuffer = { id: newId, label, code: defaultBufferShader };
		buffers = [...updatedExisting, newBuf];
		activeBufferId = newId;
		editorValue = defaultBufferShader;
		setTimeout(() => shaderCanvas?.run(), 0);
	}

	function addCommon() {
		if (buffers.some((b) => b.id === 'common')) return;
		const commonBuf: ShaderBuffer = { id: 'common', label: 'Common', code: defaultCommonCode };
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
		const saved = buffersWithLatestCode();
		const userBufs = saved.filter((b) => b.id !== 'image' && b.id !== 'common');
		const removedIdx = userBufs.findIndex((b) => b.id === id);
		const removedUniform = removedIdx >= 0 ? BUFFER_UNIFORM_NAMES[removedIdx] : null;
		const newActiveId = activeBufferId === id ? 'image' : activeBufferId;
		const updatedBufs = saved
			.filter((b) => b.id !== id)
			.map((b) => {
				if (b.id === 'common') return b;
				let code = b.code;
				if (removedUniform) code = removeUniformLine(code, removedUniform);
				return { ...b, code };
			});
		buffers = updatedBufs;
		activeBufferId = newActiveId;
		editorValue = updatedBufs.find((b) => b.id === newActiveId)?.code ?? '';
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
			description: description ?? UNIFORM_DOCS[name]?.description,
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
		if (presentNames.has(name)) {
			editorValue = removeUniformLine(editorValue, name);
		} else {
			editorValue = addUniformLine(editorValue, name, type);
		}
		run();
	}

	let _compileTimer = 0;
	$effect(() => {
		const _code = editorValue;
		clearTimeout(_compileTimer);
		_compileTimer = setTimeout(() => run(), 800);
	});

	async function saveProject() {
		if (shaderState.isSaving || !auth.isLoggedIn || !auth.user?.id) return;
		shaderState.isSaving = true;
		try {
			const res = await fetch('/api/shaders', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({
					shaderId: shaderState.currentShaderId,
					name: shaderState.name,
					description: shaderState.description,				visiblity: shaderState.visiblity,					userId: auth.user.id,
					buffers: buffersWithLatestCode(),
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			if (data.record) {
				const isNew = !shaderState.currentShaderId;
				shaderState.currentShaderId = data.record.id;
				if (isNew) {
					replaceState(`/shader/${data.record.id}`, {});
				}
			}
		} catch (e) {
			console.error('Crash pendant la save', e);
		} finally {
			shaderState.isSaving = false;
		}
	}

	$effect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 's') {
				e.preventDefault();
				saveProject();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});
</script>

<div class="flex h-full w-full bg-background text-foreground overflow-hidden font-sans">
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
		onRun={() => run()}
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
		onSave={saveProject}
		isSaving={shaderState.isSaving}
	/>
</div>
