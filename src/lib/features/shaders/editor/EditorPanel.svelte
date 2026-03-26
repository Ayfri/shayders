<script lang="ts">
	import { tick } from 'svelte';
	import { Code, Play, Save, ChevronLeft, ChevronRight, Plus, X, Layers, Pencil, Copy, Trash2, Tv2, Settings } from '@lucide/svelte';
	import { isShadertoyShader, convertFromShadertoy } from '$features/shaders/model/shadertoy-converter';
	import GlslEditor from '$features/shaders/editor/GlslEditor.svelte';
	import BuiltinsPanel, { type UniformEntry } from '$features/shaders/editor/BuiltinsPanel.svelte';
	import ChannelsPanel from '$features/shaders/editor/ChannelsPanel.svelte';
	import EditorSettingsModal from '$features/shaders/editor/EditorSettingsModal.svelte';
	import Modal from '$ui/Modal.svelte';
	import type { ChannelEntry, ShaderBuffer } from '$features/shaders/model/shader-content';
	import { loadSettings, saveSettings, type EditorSettingsData, EDITOR_DEFAULTS } from '$features/shaders/editor/editor-settings';
	import { auth } from '$features/auth/auth-client.svelte';

	interface Props {
		value: string;
		errors?: string;
		onRun?: () => void;
		uniforms: UniformEntry[];
		presentNames?: Set<string>;
		onToggleUniform?: (name: string, type: string) => void;
		panelOpen?: boolean;
		buffers: ShaderBuffer[];
		activeBufferId: string;
		thumbnails?: Record<string, string>;
		channels?: ChannelEntry[];
		onTabChange?: (id: string) => void;
		onAddBuffer?: () => void;
		onAddCommon?: () => void;
		onRemoveBuffer?: (id: string) => void;
		onRenameBuffer?: (id: string, label: string) => void;
		onDuplicateBuffer?: (id: string) => void;
		onChannelChange?: (ch: ChannelEntry) => void;
		onSave?: () => void;
		isSaving?: boolean;
		viewOnly?: boolean;
	}

	let {
		value = $bindable(),
		errors = '',
		onRun,
		uniforms,
		presentNames = new Set(),
		onToggleUniform,
		panelOpen = $bindable(false),
		buffers,
		activeBufferId,
		thumbnails = {},
		channels = [],
		onTabChange,
		onAddBuffer,
		onAddCommon,
		onRemoveBuffer,
		onRenameBuffer,
		onDuplicateBuffer,
		onChannelChange,
		onSave,
		isSaving = false,
		viewOnly = false,
	}: Props = $props();

	let visible = $state(true);
	let width = $state(0);
	let isDragging = $state(false);
	let channelsOpen = $state(false);
	let settings = $state<EditorSettingsData>(loadSettings());
	let showSettings = $state(false);
	let showConvertModal = $state(false);
	let promptedShadertoyByBuffer = $state<Record<string, true>>({});
	let viewportHeight = $state(0);
	let viewportWidth = $state(0);

	let dragStartPointer = 0;
	let dragStartSize = 0;
	let renameInputEl = $state<HTMLInputElement | null>(null);
	let wasVerticalLayout: boolean | null = null;

	const vertical = $derived(viewportWidth < 640);
	const panelStyle = $derived(vertical ? `height: ${width}px` : `width: ${width}px`);

	$effect(() => {
		saveSettings(settings);
	});

	$effect(() => {
		if (!viewportWidth || !viewportHeight) {
			return;
		}

		const nextWidth = vertical ? viewportHeight * 0.5 : viewportWidth * 0.5;
		const maxWidth = vertical ? viewportHeight * 0.75 : viewportWidth * 0.75;
		width = Math.min(width || nextWidth, maxWidth);

		if (wasVerticalLayout === vertical) {
			return;
		}

		if (vertical) {
			visible = false;
		}

		wasVerticalLayout = vertical;
	});

	const hasCommon = $derived(buffers.some((b) => b.id === 'common'));

	// Context menu
	interface CtxMenu { bufferId: string; bufferLabel: string; x: number; y: number; }
	let ctxMenu = $state<CtxMenu | null>(null);

	function openContextMenu(e: MouseEvent, buf: ShaderBuffer) {
		if (buf.id === 'image') return;
		e.preventDefault();
		e.stopPropagation();
		ctxMenu = { bufferId: buf.id, bufferLabel: buf.label, x: e.clientX, y: e.clientY };
	}

	function closeCtx() { ctxMenu = null; }

	// Inline rename
	let editingTabId = $state<string | null>(null);
	let editingLabel = $state('');

	async function startRename(id: string, label: string) {
		closeCtx();
		editingTabId = id;
		editingLabel = label;
		await tick();
		renameInputEl?.focus();
		renameInputEl?.select();
	}

	function commitRename() {
		if (editingTabId && editingLabel.trim()) {
			onRenameBuffer?.(editingTabId, editingLabel.trim());
		}
		editingTabId = null;
	}

	const isShadertoy = $derived(isShadertoyShader(value));

	$effect(() => {
		if (!isShadertoy) {
			if (promptedShadertoyByBuffer[activeBufferId]) {
				const { [activeBufferId]: _removed, ...rest } = promptedShadertoyByBuffer;
				promptedShadertoyByBuffer = rest;
			}
			return;
		}

		if (showConvertModal || promptedShadertoyByBuffer[activeBufferId]) {
			return;
		}

		promptedShadertoyByBuffer = {
			...promptedShadertoyByBuffer,
			[activeBufferId]: true,
		};
			showConvertModal = true;
	});

	function handleConvert() {
		if (isShadertoy) value = convertFromShadertoy(value);
		showConvertModal = false;
	}

	function handleCancelConvert() {
		showConvertModal = false;
	}

	function startDrag(e: MouseEvent) {
		e.preventDefault();
		isDragging = true;
		dragStartPointer = vertical ? e.clientY : e.clientX;
		dragStartSize = width;
	}

	function handleWindowMousemove(event: MouseEvent) {
		if (!isDragging) {
			return;
		}

		const delta = dragStartPointer - (vertical ? event.clientY : event.clientX);
		const maxWidth = vertical ? viewportHeight * 0.75 : viewportWidth * 0.75;
		const minWidth = vertical ? 100 : 240;
		width = Math.max(minWidth, Math.min(maxWidth, dragStartSize + delta));
	}

	function stopDrag() {
		isDragging = false;
	}
</script>

<svelte:window
	bind:innerHeight={viewportHeight}
	bind:innerWidth={viewportWidth}
	onmousemove={handleWindowMousemove}
	onmouseup={stopDrag}
/>

{#if !visible}
	<button
		onclick={() => (visible = true)}
		class="flex items-center justify-center w-full h-8 lg:w-8 lg:h-full bg-panel border-t border-border lg:border-l lg:border-t-0 text-muted hover:text-cyan-400 hover:bg-surface transition-colors shrink-0 cursor-pointer"
		title="Show editor"
	>
		<!-- rotate the icon when vertical so it points up -->
		<ChevronLeft size={16} class="transform lg:rotate-0 rotate-90" />
	</button>
{:else}
	<!-- horizontal gutter shown only when not vertical/mobile -->
	{#if !vertical}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="hidden lg:block w-1.5 shrink-0 cursor-col-resize transition-colors bg-border hover:bg-cyan-400/50 {isDragging ? 'bg-cyan-400/70' : ''}"
			onmousedown={startDrag}
			role="separator"
			aria-label="Resize editor panel"
		></div>
	{/if}
	{#if vertical && visible}
		<!-- vertical gutter for mobile resizing -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="h-1.5 w-full shrink-0 cursor-row-resize transition-colors bg-border hover:bg-cyan-400/50 {isDragging ? 'bg-cyan-400/70' : ''}"
			onmousedown={startDrag}
			role="separator"
			aria-label="Resize editor panel"
		></div>
	{/if}

	<div class="flex flex-col min-w-0 bg-surface shrink-0 overflow-hidden max-w-full" style={panelStyle}>

		<!-- Tab bar -->
		<div class="flex items-stretch shrink-0 bg-panel border-b border-border overflow-x-auto overflow-y-hidden">
			{#each buffers as buf (buf.id)}
				{@const isActive = activeBufferId === buf.id}
				{@const thumb = settings.bufferPreviews ? thumbnails[buf.id] : null}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="tab"
					aria-selected={isActive}
					tabindex="0"
					onclick={() => onTabChange?.(buf.id)}
					oncontextmenu={(e) => openContextMenu(e, buf)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTabChange?.(buf.id); } }}
					class="relative flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 text-xs font-medium border-r border-border cursor-pointer transition-colors shrink-0 group select-none
						{isActive ? 'bg-surface text-cyan-400 border-b-2 border-b-cyan-400 -mb-px' : 'text-muted hover:text-foreground hover:bg-surface/50'}"
					title={editingTabId === buf.id ? '' : buf.label}
				>
					{#if buf.id === 'common'}
						<Layers size={11} class="shrink-0" />
					{:else if buf.id === 'image'}
						<Code size={11} class="shrink-0" />
					{:else if thumb}
						<img src={thumb} alt={buf.label} class="h-5 rounded-sm object-cover shrink-0" style="width: 36px;" />
					{:else}
						<span class="size-2 rounded-sm bg-current opacity-40 shrink-0"></span>
					{/if}

					{#if editingTabId === buf.id}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							bind:this={renameInputEl}
							bind:value={editingLabel}
							onclick={(e) => e.stopPropagation()}
							onblur={commitRename}
							onkeydown={(e) => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') editingTabId = null; e.stopPropagation(); }}
							class="w-20 bg-transparent border-b border-cyan-400 text-cyan-400 outline-none text-xs font-medium"
						/>
					{:else}
						<span>{buf.label}</span>
					{/if}

					{#if buf.id !== 'image'}
						<button
							onclick={(e) => { e.stopPropagation(); onRemoveBuffer?.(buf.id); }}
							class="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:opacity-100! hover:text-red-400 transition-all cursor-pointer"
							title={`Remove ${buf.label}`}
						>
							<X size={10} />
						</button>
					{/if}
				</div>
			{/each}

			<!-- Add Common (only if not present) -->
			{#if !hasCommon}
				<button
					onclick={() => onAddCommon?.()}
					class="flex items-center gap-1 px-3 py-1.5 text-xs text-subtle hover:text-cyan-400 hover:bg-surface/50 transition-colors cursor-pointer border-r border-border shrink-0"
					title="Add Common"
				>
					<Plus size={12} />
					<span>Common</span>
				</button>
			{/if}

			<!-- Add Buffer -->
			<button
				onclick={() => onAddBuffer?.()}
				class="flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 text-xs text-subtle hover:text-cyan-400 hover:bg-surface/50 transition-colors cursor-pointer border-r border-border shrink-0"
				title="Add buffer"
			>
				<Plus size={12} />
				<span>Buffer</span>
			</button>
		</div>

		<!-- Run bar -->
		<div class="flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 bg-panel border-b border-border shrink-0">
			<button
				onclick={() => (showSettings = true)}
				title="Editor settings"
				aria-label="Editor settings"
				class="flex items-center justify-center w-6 h-6 rounded text-muted hover:text-foreground hover:bg-border transition-colors cursor-pointer"
			>
				<Settings size={14} />
			</button>
			<span class="hidden sm:inline text-xs text-subtle font-mono mr-auto">Ctrl+Enter</span>
			<button
				onclick={() => (channelsOpen = !channelsOpen)}
				class="flex items-center gap-1.5 px-3 py-1 rounded font-mono text-xs font-semibold tracking-wider cursor-pointer transition-colors
					{channelsOpen ? 'bg-cyan-400/15 text-cyan-400 border border-cyan-400/60' : 'text-muted border border-border hover:text-foreground hover:bg-border'}"
				title="Toggle channels"
			>
				<Tv2 size={12} />
				Channels
			</button>
			<button
				onclick={onRun}
				class="flex items-center gap-1.5 px-2 py-0.5 sm:px-4 sm:py-1 bg-cyan-400/10 text-cyan-400 border border-cyan-400/60 rounded font-mono text-xs font-semibold tracking-wider cursor-pointer hover:bg-cyan-400/20 transition-colors"
			>
				<Play size={12} />
				Run
			</button>
			{#if !viewOnly}
			<button
				onclick={onSave}
				disabled={isSaving}
				class="flex items-center gap-1.5 px-2 py-0.5 sm:px-4 sm:py-1 bg-surface text-muted border border-border rounded font-mono text-xs font-semibold tracking-wider cursor-pointer hover:text-foreground hover:bg-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
				title={auth.isLoggedIn ? 'Save shader (Ctrl+S)' : 'Save to localhost (Ctrl+S)'}
			>
				<Save size={12} />
				{isSaving ? 'Saving…' : 'Save'}
			</button>
			{/if}
			<button
				onclick={() => (visible = false)}
				class="flex items-center justify-center size-6 rounded text-muted hover:text-foreground hover:bg-border transition-colors cursor-pointer"
				title="Hide editor"
			>
				<ChevronRight size={14} class="transform lg:rotate-0 rotate-90" />
			</button>
		</div>

		{#if channelsOpen}
			<ChannelsPanel {channels} {onChannelChange} {buffers} {thumbnails} />
		{/if}
		<GlslEditor bind:value {buffers} {activeBufferId} {errors} {onRun} {settings} onBufferFocus={onTabChange} />
		<BuiltinsPanel {uniforms} {presentNames} onToggle={onToggleUniform} bind:open={panelOpen} />
	</div>
{/if}

<!-- Context menu overlay -->
{#if ctxMenu}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-40"
		role="presentation"
		onclick={closeCtx}
		oncontextmenu={(e) => { e.preventDefault(); closeCtx(); }}
	></div>
	<div
		class="fixed z-50 min-w-40 py-1 bg-panel border border-border rounded shadow-xl text-xs"
		style="left: {ctxMenu.x}px; top: {ctxMenu.y}px;"
	>
		<button
			onclick={() => startRename(ctxMenu!.bufferId, ctxMenu!.bufferLabel)}
			class="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-foreground hover:bg-surface hover:text-cyan-400 transition-colors cursor-pointer"
		>
			<Pencil size={12} />
			Rename
		</button>
		{#if ctxMenu.bufferId !== 'common'}
			<button
				onclick={() => { onDuplicateBuffer?.(ctxMenu!.bufferId); closeCtx(); }}
				class="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-foreground hover:bg-surface hover:text-cyan-400 transition-colors cursor-pointer"
			>
				<Copy size={12} />
				Duplicate
			</button>
		{/if}
		<div class="my-1 border-t border-border"></div>
		<button
			onclick={() => { onRemoveBuffer?.(ctxMenu!.bufferId); closeCtx(); }}
			class="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-red-400 hover:bg-surface transition-colors cursor-pointer"
		>
			<Trash2 size={12} />
			Remove
		</button>
	</div>
{/if}

<EditorSettingsModal
	bind:settings
	open={showSettings}
	onClose={() => (showSettings = false)}
	onReset={() => {
		settings = { ...EDITOR_DEFAULTS };
		showSettings = false;
	}}
/>
<Modal open={showConvertModal} onClose={handleCancelConvert} title="Convert from Shadertoy?">
	<div class="px-5 py-4">
		<p class="text-sm text-foreground mb-6">We detected that this shader is in Shadertoy format. Would you like to convert it to WebGL shader format?</p>
		<div class="flex items-center justify-end gap-2">
			<button
				onclick={handleCancelConvert}
				class="px-4 py-2 rounded font-mono text-xs font-semibold border border-border text-muted hover:text-foreground hover:bg-border transition-colors cursor-pointer"
			>
				Cancel
			</button>
			<button
				onclick={handleConvert}
				class="px-4 py-2 rounded font-mono text-xs font-semibold bg-cyan-400/10 text-cyan-400 border border-cyan-400/60 hover:bg-cyan-400/20 transition-colors cursor-pointer"
			>
				Convert
			</button>
		</div>
	</div>
</Modal>
