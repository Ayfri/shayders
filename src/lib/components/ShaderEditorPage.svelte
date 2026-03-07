<script lang="ts">
	import { beforeNavigate, goto, replaceState } from '$app/navigation';
	import { auth, SessionExpiredError, throwIfAuthenticatedApiError } from '$lib/auth.svelte';
	import EditorPanel from '$lib/components/EditorPanel.svelte';
	import ShaderCanvas from '$lib/components/ShaderCanvas.svelte';
	import { pb } from '$lib/pocketbase';
	import type { ShadersVisiblityOptions } from '$lib/pocketbase-types';
	import {
		addCommonBuffer,
		addUserBuffer,
		applyChannelUniform,
		duplicateBufferAfter,
		removeUserBuffer,
		resolveInitialBuffers,
		resolveInitialChannels,
		withLatestBufferCode,
	} from '$lib/shader-editor/buffers';
	import {
		forkShaderRecord,
		readShaderMutationId,
		saveShaderDraft,
		saveShaderRecord,
	} from '$lib/shader-editor/persistence';
	import {
		addUniformLine,
		buildUniformEntries,
		parseUniforms,
		removeUniformLine,
	} from '$lib/shader-editor/uniforms';
	import {
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
	const initialResolvedBuffers = resolveInitialBuffers();

	let activeBufferId = $state<string>('image');
	let assetCleanupKeys = $state.raw<string[]>([]);
	let buffers = $state.raw<ShaderBuffer[]>(initialResolvedBuffers);
	let channels = $state.raw<ChannelEntry[]>(resolveInitialChannels());
	let editorValue = $state<string>(initialResolvedBuffers[0]?.code ?? '');
	let error = $state('');
	let isDirty = $state(false);
	let panelOpen = $state(false);
	let shaderCanvas: ReturnType<typeof ShaderCanvas> | null = null;
	let thumbnails = $state.raw<Record<string, string>>({});
	let uniformValues = $state.raw<Record<string, string>>({});

	let _firstCompile = true;

	$effect.pre(() => {
		const bufs = resolveInitialBuffers(initialBuffers);
		const nextChannels = resolveInitialChannels(initialChannels);
		buffers = bufs;
		channels = nextChannels;
		assetCleanupKeys = [];
		const startBuf = bufs.find((b) => b.id === 'image') ?? bufs[0];
		editorValue = startBuf?.code ?? bufs[0]?.code ?? '';
		activeBufferId = startBuf?.id ?? 'image';
		shaderState.currentShaderId = initialId ?? null;
		shaderState.name = initialName ?? 'Untitled Shader';
		shaderState.description = initialDescription ?? '';
		shaderState.visiblity = (initialVisiblity ?? 'public') as keyof typeof ShadersVisiblityOptions;
		isDirty = false;
		_firstCompile = true;
	});

	function applyBuffers(nextBuffers: ShaderBuffer[], nextActiveId = activeBufferId) {
		activeBufferId = nextActiveId;
		buffers = nextBuffers;
		editorValue = nextBuffers.find((buffer) => buffer.id === nextActiveId)?.code ?? '';
	}

	function mutateBuffers(
		mutator: (saved: ShaderBuffer[]) => ShaderBuffer[],
		nextActiveId = activeBufferId,
	) {
		applyBuffers(mutator(buffersWithLatestCode()), nextActiveId);
	}

	function rerunShader() {
		window.setTimeout(() => shaderCanvas?.run(), 0);
	}

	function handleChannelChange(ch: ChannelEntry) {
		const oldCh = channels.find((c) => c.id === ch.id);
		if (oldCh?.storageKey && oldCh.storageKey !== ch.storageKey) {
			assetCleanupKeys = [...new Set([...assetCleanupKeys, oldCh.storageKey])];
		}
		const wasActive = oldCh?.type != null;
		const isActive = ch.type != null;
		channels = channels.map((c) => (c.id === ch.id ? ch : c));
		isDirty = true;
		if (!wasActive && isActive) {
			mutateBuffers((saved) => applyChannelUniform(saved, ch.id, true));
			rerunShader();
		} else if (wasActive && !isActive) {
			mutateBuffers((saved) => applyChannelUniform(saved, ch.id, false));
			rerunShader();
		}
	}

	function buffersWithLatestCode(): ShaderBuffer[] {
		return withLatestBufferCode(buffers, activeBufferId, editorValue);
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
		const nextState = addUserBuffer(buffersWithLatestCode());
		applyBuffers(nextState.buffers, nextState.activeBufferId);
		isDirty = true;
		rerunShader();
	}

	function addCommon() {
		if (buffers.some((b) => b.id === 'common')) return;
		mutateBuffers(addCommonBuffer, 'common');
		isDirty = true;
		rerunShader();
	}

	function renameBuffer(id: string, label: string) {
		buffers = buffers.map((b) => (b.id === id ? { ...b, label } : b));
		isDirty = true;
	}

	function removeBuffer(id: string) {
		if (id === 'image') return;
		const nextState = removeUserBuffer(buffersWithLatestCode(), activeBufferId, id);
		applyBuffers(nextState.buffers, nextState.activeBufferId);
		isDirty = true;
		rerunShader();
	}

	function duplicateBuffer(id: string) {
		if (id === 'image') return;
		const nextState = duplicateBufferAfter(buffersWithLatestCode(), id);
		applyBuffers(nextState.buffers, nextState.activeBufferId);
		isDirty = true;
		rerunShader();
	}

	const allUniforms = $derived.by(() => buildUniformEntries(buffers, editorValue, uniformValues));

	const presentNames = $derived.by(() => new Set(parseUniforms(editorValue).map((u) => u.name)));

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
		const saved = saveShaderDraft({
			buffers: buffersWithLatestCode(),
			description: shaderState.description ?? '',
			name: shaderState.name ?? 'Untitled Shader',
			visiblity: shaderState.visiblity,
		});
		if (saved) isDirty = false;
		return saved;
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
			const response = await saveShaderRecord({
				buffers: buffersWithLatestCode(),
				channels,
				cleanupKeys: assetCleanupKeys,
				description: shaderState.description ?? '',
				name: shaderState.name ?? 'Untitled Shader',
				shaderId: shaderState.currentShaderId,
				token: pb.authStore.token,
				visiblity: shaderState.visiblity,
			});
			await throwIfAuthenticatedApiError(response, `Failed to save shader (HTTP ${response.status}).`);
			const recordId = await readShaderMutationId(response);
			if (recordId) {
				const isNew = !shaderState.currentShaderId;
				shaderState.currentShaderId = recordId;
				assetCleanupKeys = [];
				isDirty = false;
				if (isNew) {
					replaceState(`/shader/${recordId}`, {});
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
			const response = await forkShaderRecord({
				buffers: buffersWithLatestCode(),
				channels,
				description: shaderState.description ?? '',
				name: shaderState.name ?? 'Untitled Shader',
				token: pb.authStore.token,
				visiblity: shaderState.visiblity,
			});
			await throwIfAuthenticatedApiError(response, `Failed to fork shader (HTTP ${response.status}).`);
			const recordId = await readShaderMutationId(response);
			if (recordId) goto(`/shader/${recordId}`);
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

	function handleWindowBeforeUnload(event: BeforeUnloadEvent) {
		if (!viewOnly && isDirty) event.preventDefault();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 's' && !viewOnly) {
			event.preventDefault();
			void saveProject();
		}
	}

	beforeNavigate(({ cancel }) => {
		if (!viewOnly && isDirty && !confirm('You have unsaved changes. Leave anyway?')) {
			cancel();
		}
	});
</script>

<svelte:window onbeforeunload={handleWindowBeforeUnload} onkeydown={handleWindowKeydown} />

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
