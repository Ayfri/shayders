<script lang="ts">
	import { beforeNavigate, goto, replaceState } from '$app/navigation';
	import { auth, SessionExpiredError, throwIfAuthenticatedApiError } from '$lib/auth.svelte';
	import { type UniformEntry } from '$lib/components/BuiltinsPanel.svelte';
	import EditorPanel from '$lib/components/EditorPanel.svelte';
	import ShaderCanvas from '$lib/components/ShaderCanvas.svelte';
	import { defaultBufferShader, defaultCommonCode, defaultImageShader } from '$lib/defaultShaders';
	import { UNIFORM_DOCS } from '$lib/glsl/builtins';
	import { pb } from '$lib/pocketbase';
	import type { ShadersVisiblityOptions } from '$lib/pocketbase-types';
	import {
		createEmptyChannels,
		listUnpersistedBinaryChannels,
		type ChannelEntry,
		type ShaderBuffer,
	} from '$lib/shader-content';
	import { shaderState } from '$lib/shaderState.svelte';

	interface Props {
		authorId?: string;
		authorName?: string;
		initialBuffers?: ShaderBuffer[];
		initialChannels?: ChannelEntry[];
		initialDescription?: string;
		initialId?: string;
		initialName?: string;
		initialVisiblity?: keyof typeof ShadersVisiblityOptions;
		viewOnly?: boolean;
	}

	let { authorId, authorName, initialBuffers, initialChannels, initialDescription, initialId, initialName, initialVisiblity, viewOnly = false }: Props = $props();

	let activeBufferId = $state<string>('image');
	let assetCleanupKeys = $state<string[]>([]);
	let buffers = $state<ShaderBuffer[]>([{ id: 'image', label: 'Image', code: defaultImageShader }]);
	let channels = $state<ChannelEntry[]>(createEmptyChannels());
	let editorValue = $state<string>(defaultImageShader);
	let error = $state('');
	let isDirty = $state(false);
	let panelOpen = $state(false);
	let shaderCanvas = $state<ReturnType<typeof ShaderCanvas> | null>(null);
	let thumbnails = $state<Record<string, string>>({});
	let uniformValues = $state<Record<string, string>>({});

	let _firstCompile = true;

	$effect.pre(() => {
		const bufs = initialBuffers && initialBuffers.length > 0
			? initialBuffers
			: [{ id: 'image', label: 'Image', code: defaultImageShader }];
		const nextChannels = initialChannels && initialChannels.length > 0
			? initialChannels.map((channel) => ({ ...channel }))
			: createEmptyChannels();
		buffers = bufs;
		channels = nextChannels;
		assetCleanupKeys = [];
		const startBuf = bufs.find((b) => b.id === 'image') ?? bufs[0];
		editorValue = startBuf?.code ?? defaultImageShader;
		activeBufferId = startBuf?.id ?? 'image';
		shaderState.currentShaderId = initialId ?? null;
		shaderState.name = initialName ?? 'Untitled Shader';
		shaderState.description = initialDescription ?? '';
		shaderState.visiblity = (initialVisiblity ?? 'public') as keyof typeof ShadersVisiblityOptions;
		isDirty = false;
		_firstCompile = true;
	});

	const BUFFER_UNIFORM_NAMES = ['uBufferA', 'uBufferB', 'uBufferC', 'uBufferD', 'uBufferE', 'uBufferF', 'uBufferG', 'uBufferH'];

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
		if (oldCh?.storageKey && oldCh.storageKey !== ch.storageKey) {
			assetCleanupKeys = [...new Set([...assetCleanupKeys, oldCh.storageKey])];
		}
		const wasActive = oldCh?.type != null;
		const isActive = ch.type != null;
		const uniformName = `uChannel${ch.id}`;
		channels = channels.map((c) => (c.id === ch.id ? ch : c));
		isDirty = true;
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
		isDirty = true;
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
		isDirty = true;
		setTimeout(() => shaderCanvas?.run(), 0);
	}

	function renameBuffer(id: string, label: string) {
		buffers = buffers.map((b) => (b.id === id ? { ...b, label } : b));
		isDirty = true;
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
		isDirty = true;
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
		isDirty = true;
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
		if (_firstCompile) { _firstCompile = false; return; }
		isDirty = true;
	});

	function saveDraftLocally(): boolean {
		try {
			const localData = {
				buffers: buffersWithLatestCode(),
				description: shaderState.description,
				name: shaderState.name,
				savedAt: new Date().toISOString(),
				visiblity: shaderState.visiblity,
			};
			localStorage.setItem('shayders_draft', JSON.stringify(localData));
			isDirty = false;
			return true;
		} catch (e) {
			console.error('Error during local save', e);
			return false;
		}
	}

	async function saveProject() {
		if (shaderState.isSaving) return;

		if (!auth.isLoggedIn || !auth.user?.id) {
			shaderState.isSaving = true;
			try {
				saveDraftLocally();
			} finally {
				shaderState.isSaving = false;
			}
			return;
		}

		const pendingChannelIds = listUnpersistedBinaryChannels(channels);
		if (pendingChannelIds.length > 0) {
			window.alert(`Upload channel assets before saving: ${pendingChannelIds.map((id) => `CH${id}`).join(', ')}.`);
			return;
		}

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
					description: shaderState.description,
					visiblity: shaderState.visiblity,
					buffers: buffersWithLatestCode(),
					channels,
					cleanupKeys: assetCleanupKeys,
				}),
			});
			await throwIfAuthenticatedApiError(res, `Failed to save shader (HTTP ${res.status}).`);
			const data = await res.json() as { record?: { id: string } };
			if (data.record) {
				const isNew = !shaderState.currentShaderId;
				shaderState.currentShaderId = data.record.id;
				assetCleanupKeys = [];
				isDirty = false;
				if (isNew) {
					replaceState(`/shader/${data.record.id}`, {});
				}
			}
		} catch (e) {
			if (e instanceof SessionExpiredError) {
				const savedLocally = saveDraftLocally();
				window.alert(
					savedLocally
						? 'Session expired. You have been logged out. A local draft was saved so you can sign in again and retry.'
						: e.message
				);
				return;
			}

			console.error('Crash during save', e);
			window.alert(e instanceof Error ? e.message : 'Failed to save shader.');
		} finally {
			shaderState.isSaving = false;
		}
	}

	async function forkProject() {
		if (shaderState.isSaving) return;
		if (!auth.isLoggedIn || !auth.user?.id) return;

		shaderState.isSaving = true;
		try {
			const res = await fetch('/api/shaders', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({
					name: `Fork of ${shaderState.name}`,
					description: shaderState.description,
					visiblity: shaderState.visiblity,
					buffers: buffersWithLatestCode(),
					channels,
				}),
			});
			await throwIfAuthenticatedApiError(res, `Failed to fork shader (HTTP ${res.status}).`);
			const data = await res.json() as { record?: { id: string } };
			if (data.record) {
				goto(`/shader/${data.record.id}`);
			}
		} catch (e) {
			if (e instanceof SessionExpiredError) {
				window.alert(e.message);
				return;
			}
			console.error('Crash during fork', e);
			window.alert(e instanceof Error ? e.message : 'Failed to fork shader.');
		} finally {
			shaderState.isSaving = false;
		}
	}

	$effect(() => {
		if (viewOnly) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 's') {
				e.preventDefault();
				saveProject();
			}
		};
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (isDirty) e.preventDefault();
		};
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	beforeNavigate(({ cancel }) => {
		if (!viewOnly && isDirty && !confirm('You have unsaved changes. Leave anyway?')) {
			cancel();
		}
	});
</script>

<div class="flex flex-col lg:flex-row h-full w-full min-h-0 bg-background text-foreground overflow-auto lg:overflow-hidden font-sans">
	<div class="flex-1 min-w-0 min-h-0">
		<ShaderCanvas
			bind:this={shaderCanvas}
			{buffers}
			{channels}
			bind:error
			bind:uniformValues
			bind:thumbnails
			isSavingLocally={!viewOnly && !auth.isLoggedIn}
			{viewOnly}
			{authorId}
			{authorName}
			onFork={forkProject}
		/>
	</div>

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
		{viewOnly}
	/>
</div>
