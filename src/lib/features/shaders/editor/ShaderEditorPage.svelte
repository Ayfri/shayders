<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { auth, SessionExpiredError, throwIfAuthenticatedApiError } from '#features/auth/auth-client.svelte.js';
	import EditorPanel from '#features/shaders/editor/EditorPanel.svelte';
	import ShaderCanvas from '#features/shaders/canvas/ShaderCanvas.svelte';
	import { pb } from '#lib/pocketbase.js';
	import { getShaderPath } from '#lib/site.js';
	import type { ShaderVisibility } from '#features/shaders/model/shader-visibility.js';
	import {
		addCommonBuffer,
		addUserBuffer,
		applyChannelUniform,
		canAddUserBuffer,
		duplicateBufferAfter,
		removeUserBuffer,
		resolveInitialBuffers,
		resolveInitialChannels,
		withLatestBufferCode,
	} from '#features/shaders/editor/buffers.js';
	import {
		forkShaderRecord,
		readShaderMutationId,
		saveShaderDraft,
		saveShaderRecord,
	} from '#features/shaders/editor/persistence.js';
	import {
		addUniformLine,
		buildUniformCatalog,
		parseUniforms,
		removeUniformLine,
	} from '#features/shaders/editor/uniforms.js';
	import {
		listUnpersistedBinaryChannels,
		type ChannelEntry,
		type ShaderBuffer,
	} from '#features/shaders/model/shader-content.js';
	import { shaderState } from '#features/shaders/model/shader-state.svelte.js';

	interface Props {
		authorId?: string;
		authorName?: string;
		initialBuffers?: ShaderBuffer[];
		initialChannels?: ChannelEntry[];
		initialDescription?: string;
		initialId?: string;
		initialName?: string;
		initialVisiblity?: ShaderVisibility;
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
	/** Code, buffer and channel edits, name, description and visibility are compared against `savedMeta` instead. */
	let isDirty = $state(false);
	let panelOpen = $state(false);
	let savedMeta = $state('');
	let shaderCanvas: ReturnType<typeof ShaderCanvas> | null = null;
	let thumbnails = $state.raw<Record<string, string>>({});
	let uniformValues = $state.raw<Record<string, string>>({});

	/** The first compile after loading a shader isn't a user edit. */
	let isFirstCompile = true;

	const metaKey = () => `${shaderState.name}\n${shaderState.description}\n${shaderState.visiblity}`;
	const hasUnsavedChanges = $derived(!viewOnly && (isDirty || metaKey() !== savedMeta));

	$effect.pre(() => {
		const nextBuffers = resolveInitialBuffers(initialBuffers);
		const startBuffer = nextBuffers.find((buffer) => buffer.id === 'image') ?? nextBuffers[0];
		buffers = nextBuffers;
		channels = resolveInitialChannels(initialChannels);
		assetCleanupKeys = [];
		editorValue = startBuffer?.code ?? '';
		activeBufferId = startBuffer?.id ?? 'image';
		shaderState.currentShaderId = initialId ?? null;
		shaderState.name = initialName ?? 'Untitled Shader';
		shaderState.description = initialDescription ?? '';
		shaderState.visiblity = initialVisiblity ?? 'public';
		markSaved();
		isFirstCompile = true;
	});

	function markSaved() {
		isDirty = false;
		savedMeta = untrack(metaKey);
	}

	function buffersWithLatestCode(): ShaderBuffer[] {
		return withLatestBufferCode(buffers, activeBufferId, editorValue);
	}

	function applyBuffers(nextBuffers: ShaderBuffer[], nextActiveId = activeBufferId) {
		activeBufferId = nextActiveId;
		buffers = nextBuffers;
		editorValue = nextBuffers.find((buffer) => buffer.id === nextActiveId)?.code ?? '';
	}

	/** Applies a structural change to the buffers, then reruns once the canvas got the new list. */
	async function changeBuffers(next: { activeBufferId?: string; buffers: ShaderBuffer[] }) {
		applyBuffers(next.buffers, next.activeBufferId);
		isDirty = true;
		await tick();
		shaderCanvas?.run();
	}

	function handleChannelChange(channel: ChannelEntry) {
		const previous = channels.find((entry) => entry.id === channel.id);
		if (previous?.storageKey && previous.storageKey !== channel.storageKey) {
			assetCleanupKeys = [...new Set([...assetCleanupKeys, previous.storageKey])];
		}
		channels = channels.map((entry) => (entry.id === channel.id ? channel : entry));
		isDirty = true;

		const isActive = channel.type != null;
		if ((previous?.type != null) !== isActive) {
			void changeBuffers({ buffers: applyChannelUniform(buffersWithLatestCode(), channel.id, isActive) });
		}
	}

	function run() {
		buffers = buffersWithLatestCode();
		shaderCanvas?.run();
	}

	function switchTab(id: string) {
		applyBuffers(buffersWithLatestCode(), id);
	}

	function addBuffer() {
		if (canAddUserBuffer(buffers)) void changeBuffers(addUserBuffer(buffersWithLatestCode()));
	}

	function addCommon() {
		if (!buffers.some((buffer) => buffer.id === 'common')) void changeBuffers({ activeBufferId: 'common', buffers: addCommonBuffer(buffersWithLatestCode()) });
	}

	function renameBuffer(id: string, label: string) {
		buffers = buffers.map((buffer) => (buffer.id === id ? { ...buffer, label } : buffer));
		isDirty = true;
	}

	function removeBuffer(id: string) {
		if (id !== 'image') void changeBuffers(removeUserBuffer(buffersWithLatestCode(), activeBufferId, id));
	}

	function duplicateBuffer(id: string) {
		if (id !== 'image' && canAddUserBuffer(buffers)) void changeBuffers(duplicateBufferAfter(buffersWithLatestCode(), id));
	}

	const uniformCatalog = $derived(buildUniformCatalog(buffers, editorValue));
	const presentNames = $derived(new Set(parseUniforms(editorValue).map((uniform) => uniform.name)));

	function toggleUniform(name: string, type: string) {
		editorValue = presentNames.has(name) ? removeUniformLine(editorValue, name) : addUniformLine(editorValue, name, type);
		run();
	}

	/** Colors in globals or `const` need a compile, the runtime keeps one in flight per buffer so a drag stays responsive. */
	function previewCode(bufferId: string, code: string) {
		const preview = withLatestBufferCode(buffersWithLatestCode(), bufferId, code);
		if (!shaderCanvas?.hotUpdate(preview)) shaderCanvas?.run(false, preview);
	}

	/**
	 * Literal-only edits (colors, numbers) hot-swap on the keystroke, structural ones compile after a short typing pause.
	 * Hot swaps still get a constant-folded rebuild once the edits settle.
	 */
	$effect(() => {
		void editorValue;
		const hot = untrack(() => shaderCanvas?.hotUpdate(buffersWithLatestCode())) ?? false;
		const timer = window.setTimeout(() => {
			buffers = buffersWithLatestCode();
			shaderCanvas?.run(false);
		}, hot ? 1000 : 250);
		if (isFirstCompile) isFirstCompile = false;
		else isDirty = true;
		return () => window.clearTimeout(timer);
	});

	function shaderPayload() {
		return {
			buffers: buffersWithLatestCode(),
			description: shaderState.description,
			name: shaderState.name.trim() || 'Untitled Shader',
			visiblity: shaderState.visiblity,
		};
	}

	function saveDraftLocally(): boolean {
		const saved = saveShaderDraft(shaderPayload());
		if (saved) markSaved();
		return saved;
	}

	/** Runs a save or a fork with `isSaving` held, failures end up in an alert. */
	async function mutateRecord(failure: string, task: () => Promise<void>, sessionExpiredMessage?: () => string) {
		if (shaderState.isSaving) return;
		shaderState.isSaving = true;
		try {
			await task();
		} catch (err) {
			if (err instanceof SessionExpiredError) {
				window.alert(sessionExpiredMessage?.() ?? err.message);
				return;
			}
			console.error(failure, err);
			window.alert(err instanceof Error ? err.message : failure);
		} finally {
			shaderState.isSaving = false;
		}
	}

	async function saveProject() {
		if (!auth.isLoggedIn) {
			saveDraftLocally();
			return;
		}

		const pendingChannelIds = listUnpersistedBinaryChannels(channels);
		if (pendingChannelIds.length > 0) {
			window.alert(`Upload channel assets before saving: ${pendingChannelIds.map((id) => `CH${id}`).join(', ')}.`);
			return;
		}

		await mutateRecord(
			'Failed to save shader.',
			async () => {
				const response = await saveShaderRecord({
					...shaderPayload(),
					channels,
					cleanupKeys: assetCleanupKeys,
					shaderId: shaderState.currentShaderId,
					token: pb.authStore.token,
				});
				await throwIfAuthenticatedApiError(response, `Failed to save shader (HTTP ${response.status}).`);
				const recordId = await readShaderMutationId(response);
				if (!recordId) return;
				const isNew = !shaderState.currentShaderId;
				shaderState.currentShaderId = recordId;
				assetCleanupKeys = [];
				markSaved();
				if (isNew) goto(getShaderPath(recordId), { replace: true, shallow: true });
			},
			() => (saveDraftLocally()
				? 'Session expired. You have been logged out. A local draft was saved so you can sign in again and retry.'
				: 'Session expired. You have been logged out. Log in again to continue.'),
		);
	}

	async function forkProject() {
		if (!auth.isLoggedIn) return;
		await mutateRecord('Failed to fork shader.', async () => {
			const response = await forkShaderRecord({ ...shaderPayload(), channels, token: pb.authStore.token });
			await throwIfAuthenticatedApiError(response, `Failed to fork shader (HTTP ${response.status}).`);
			const recordId = await readShaderMutationId(response);
			if (recordId) goto(getShaderPath(recordId));
		});
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 's' && !viewOnly) {
			event.preventDefault();
			void saveProject();
		}
	}

	beforeNavigate(({ cancel, shallow }) => {
		if (!shallow && hasUnsavedChanges && !confirm('You have unsaved changes. Leave anyway?')) cancel();
	});
</script>

<svelte:window onbeforeunload={(event) => hasUnsavedChanges && event.preventDefault()} onkeydown={handleWindowKeydown} />

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background font-sans text-foreground lg:flex-row">
	<div class="min-h-32 min-w-0 flex-1">
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
		onPreview={previewCode}
		onRun={run}
		uniforms={uniformCatalog}
		{uniformValues}
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
