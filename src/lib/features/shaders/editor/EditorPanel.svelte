<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { ChevronLeft, ChevronRight, Code, Copy, Layers, type LucideIcon, Pencil, Play, Plus, Save, Settings, Trash2, Tv2, X } from '@lucide/svelte';
	import { convertFromShadertoy, isShadertoyShader } from '#features/shaders/model/shadertoy-converter.js';
	import GlslEditor from '#features/shaders/editor/GlslEditor.svelte';
	import BuiltinsPanel from '#features/shaders/editor/BuiltinsPanel.svelte';
	import ChannelsPanel from '#features/shaders/editor/ChannelsPanel.svelte';
	import EditorSettingsModal from '#features/shaders/editor/EditorSettingsModal.svelte';
	import Button from '#components/ui/Button.svelte';
	import Modal from '#components/ui/Modal.svelte';
	import type { ChannelEntry, ShaderBuffer } from '#features/shaders/model/shader-content.js';
	import { editorSettings } from '#features/shaders/editor/editor-settings.svelte.js';
	import type { UniformDescriptor } from '#features/shaders/editor/uniforms.js';
	import { auth } from '#features/auth/auth-client.svelte.js';
	import { canAddUserBuffer } from '#features/shaders/editor/buffers.js';
	import { BUFFER_UNIFORM_NAMES } from '#features/shaders/model/shader-domain.js';

	interface Props {
		value: string;
		errors?: string;
		onPreview?: (bufferId: string, code: string) => void;
		onRun?: () => void;
		uniforms: UniformDescriptor[];
		uniformValues?: Record<string, string>;
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
		onPreview,
		onRun,
		uniforms,
		uniformValues = {},
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

	/** Context menu box, used to keep it inside the viewport. */
	const CONTEXT_MENU_SIZE = { height: 120, width: 176 };

	let isDragging = $state(false);
	let channelsOpen = $state(false);
	let showSettings = $state(false);
	let viewportHeight = $state(0);
	let viewportWidth = $state(0);
	let contextMenu = $state<{ bufferId: string; bufferLabel: string; x: number; y: number } | null>(null);
	let editingTabId = $state<string | null>(null);
	let editingLabel = $state('');
	/** Buffers whose Shadertoy prompt was declined, they aren't asked again. */
	const declinedConversions = new SvelteSet<string>();

	let dragStartPointer = 0;
	let dragStartSize = 0;

	/** Matches the `lg` breakpoint where ShaderEditorPage switches from stacked to side by side. */
	const vertical = $derived(viewportWidth < 1024);
	/** Stacked, the panel always leaves room for the header, the gutter and a usable canvas strip. */
	const maxSize = $derived(vertical ? Math.min(viewportHeight * 0.75, viewportHeight - 220) : viewportWidth * 0.75);
	const hasCommon = $derived(buffers.some((buffer) => buffer.id === 'common'));
	const canAddBuffer = $derived(canAddUserBuffer(buffers));
	const isShadertoy = $derived(isShadertoyShader(value));
	const showConvertModal = $derived(isShadertoy && !declinedConversions.has(activeBufferId));

	/** Stacked viewers start with the code hidden so the shader gets the screen, switching layout applies that default again. */
	let visible = $derived(!(viewOnly && vertical && viewportWidth > 0));
	/** Size picked by dragging, dropped on a layout switch since a width doesn't make sense as a height. */
	let draggedSize = $derived.by<number | null>(() => {
		void vertical;
		return null;
	});
	/** Width side by side, height when stacked. */
	const size = $derived(Math.min(draggedSize ?? (vertical ? viewportHeight : viewportWidth) * 0.5, maxSize));

	function openContextMenu(event: MouseEvent, buffer: ShaderBuffer) {
		if (buffer.id === 'image') return;
		event.preventDefault();
		event.stopPropagation();
		contextMenu = { bufferId: buffer.id, bufferLabel: buffer.label, x: event.clientX, y: event.clientY };
	}

	function startRename(id: string, label: string) {
		contextMenu = null;
		editingTabId = id;
		editingLabel = label;
	}

	function commitRename() {
		if (editingTabId && editingLabel.trim()) onRenameBuffer?.(editingTabId, editingLabel.trim());
		editingTabId = null;
	}

	function handleConvert() {
		if (isShadertoy) value = convertFromShadertoy(value);
	}

	function startDrag(event: PointerEvent) {
		event.preventDefault();
		isDragging = true;
		dragStartPointer = vertical ? event.clientY : event.clientX;
		dragStartSize = size;
	}

	function handleWindowPointermove(event: PointerEvent) {
		if (!isDragging) return;
		const delta = dragStartPointer - (vertical ? event.clientY : event.clientX);
		draggedSize = Math.max(vertical ? 100 : 240, Math.min(maxSize, dragStartSize + delta));
	}
</script>

<svelte:window
	bind:innerHeight={viewportHeight}
	bind:innerWidth={viewportWidth}
	onpointermove={handleWindowPointermove}
	onpointerup={() => (isDragging = false)}
	onpointercancel={() => (isDragging = false)}
/>

{#snippet menuItem(label: string, Icon: LucideIcon, onclick: () => void, danger = false)}
	<button
		{onclick}
		class={['flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-surface', danger ? 'text-red-400' : 'text-foreground hover:text-accent']}
	>
		<Icon size={12} />
		{label}
	</button>
{/snippet}

{#if !visible}
	<button
		onclick={() => (visible = true)}
		class="flex h-10 w-full shrink-0 items-center justify-center gap-2 border-t border-border bg-panel text-xs text-muted transition-colors hover:bg-surface hover:text-accent lg:h-full lg:w-8 lg:border-l lg:border-t-0"
		title="Show editor"
	>
		<ChevronLeft size={16} class="rotate-90 lg:rotate-0" />
		<span class="lg:hidden">Show code</span>
	</button>
{:else}
	{#if !vertical}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class={['w-1.5 shrink-0 cursor-col-resize touch-none transition-colors', isDragging ? 'bg-accent/70' : 'bg-border hover:bg-accent/50']}
			onpointerdown={startDrag}
			role="separator"
			aria-label="Resize editor panel"
		></div>
	{:else}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="group flex h-4 w-full shrink-0 cursor-row-resize touch-none items-center justify-center border-t border-border bg-panel"
			onpointerdown={startDrag}
			role="separator"
			aria-label="Resize editor panel"
		>
			<span class={['h-1 w-10 rounded-full transition-colors', isDragging ? 'bg-accent' : 'bg-subtle group-hover:bg-accent/60']}></span>
		</div>
	{/if}

	<div class="flex min-w-0 max-w-full shrink-0 flex-col overflow-hidden bg-surface" style:width={vertical ? undefined : `${size}px`} style:height={vertical ? `${size}px` : undefined}>
		<div role="tablist" aria-label="Buffers" class="flex shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-border bg-panel">
			{#each buffers as buffer (buffer.id)}
				{@const isActive = activeBufferId === buffer.id}
				{@const thumb = editorSettings.bufferPreviews ? thumbnails[buffer.id] : null}
				<div
					role="tab"
					aria-selected={isActive}
					tabindex="0"
					onclick={() => onTabChange?.(buffer.id)}
					oncontextmenu={(event) => openContextMenu(event, buffer)}
					onkeydown={(event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						onTabChange?.(buffer.id);
					}}
					class={[
						'group relative flex shrink-0 select-none items-center gap-1 border-r border-border px-2 py-1 text-xs font-medium transition-colors sm:gap-1.5 sm:px-3 sm:py-1.5',
						isActive ? '-mb-px border-b-2 border-b-accent bg-surface text-accent' : 'text-muted hover:bg-surface/50 hover:text-foreground',
					]}
					title={editingTabId === buffer.id ? '' : buffer.label}
				>
					{#if buffer.id === 'common'}
						<Layers size={11} class="shrink-0" />
					{:else if buffer.id === 'image'}
						<Code size={11} class="shrink-0" />
					{:else if thumb}
						<img src={thumb} alt={buffer.label} class="h-5 w-9 shrink-0 rounded-sm object-cover" />
					{:else}
						<span class="size-2 shrink-0 rounded-sm bg-current opacity-40"></span>
					{/if}

					{#if editingTabId === buffer.id}
						<input
							{@attach (input) => {
								input.focus();
								input.select();
							}}
							bind:value={editingLabel}
							onclick={(event) => event.stopPropagation()}
							onblur={commitRename}
							onkeydown={(event) => {
								event.stopPropagation();
								if (event.key === 'Enter') commitRename();
								else if (event.key === 'Escape') editingTabId = null;
							}}
							aria-label="Buffer name"
							class="w-20 border-b border-accent bg-transparent text-xs font-medium text-accent outline-none"
						/>
					{:else}
						<span>{buffer.label}</span>
					{/if}

					{#if buffer.id !== 'image'}
						<button
							onclick={(event) => {
								event.stopPropagation();
								onRemoveBuffer?.(buffer.id);
							}}
							class="ml-0.5 rounded p-0.5 opacity-0 transition-all hover:text-red-400 hover:opacity-100! group-hover:opacity-60 pointer-coarse:opacity-60"
							title="Remove {buffer.label}"
							aria-label="Remove {buffer.label}"
						>
							<X size={10} />
						</button>
					{/if}
				</div>
			{/each}

			{#if !hasCommon}
				<button
					onclick={onAddCommon}
					class="flex shrink-0 items-center gap-1 border-r border-border px-3 py-1.5 text-xs text-subtle transition-colors hover:bg-surface/50 hover:text-accent"
					title="Add Common"
				>
					<Plus size={12} />
					<span>Common</span>
				</button>
			{/if}

			<button
				onclick={onAddBuffer}
				disabled={!canAddBuffer}
				class="flex shrink-0 items-center gap-1 border-r border-border px-2 py-1 text-xs text-subtle transition-colors enabled:hover:bg-surface/50 enabled:hover:text-accent disabled:opacity-40 sm:gap-1.5 sm:px-3 sm:py-1.5"
				title={canAddBuffer ? 'Add buffer' : `Up to ${BUFFER_UNIFORM_NAMES.length} buffers`}
			>
				<Plus size={12} />
				<span>Buffer</span>
			</button>
		</div>

		<div class="flex shrink-0 items-center gap-1 border-b border-border bg-panel px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
			<button
				onclick={() => (showSettings = true)}
				title="Editor settings"
				aria-label="Editor settings"
				class="flex size-6 items-center justify-center rounded text-muted transition-colors hover:bg-border hover:text-foreground"
			>
				<Settings size={14} />
			</button>
			<span class="mr-auto hidden font-mono text-xs text-subtle sm:inline">Ctrl+Enter</span>
			<Button
				onclick={() => (channelsOpen = !channelsOpen)}
				aria-pressed={channelsOpen}
				variant={channelsOpen ? 'accent' : 'ghost'}
				size="toolbar"
				mono
				title="Toggle channels"
			>
				<Tv2 size={12} />
				<span class="hidden min-[360px]:inline">Channels</span>
			</Button>
			<Button onclick={onRun} variant="accent" size="toolbar" mono>
				<Play size={12} />
				Run
			</Button>
			{#if !viewOnly}
				<Button
					onclick={onSave}
					disabled={isSaving}
					variant="ghost"
					size="toolbar"
					mono
					title={auth.isLoggedIn ? 'Save shader (Ctrl+S)' : 'Save locally (Ctrl+S)'}
				>
					<Save size={12} />
					{isSaving ? 'Saving…' : 'Save'}
				</Button>
			{/if}
			<button
				onclick={() => (visible = false)}
				class="flex size-6 items-center justify-center rounded text-muted transition-colors hover:bg-border hover:text-foreground"
				title="Hide editor"
				aria-label="Hide editor"
			>
				<ChevronRight size={14} class="rotate-90 lg:rotate-0" />
			</button>
		</div>

		{#if channelsOpen}
			<ChannelsPanel {channels} {onChannelChange} {buffers} {thumbnails} />
		{/if}
		<GlslEditor bind:value {buffers} {activeBufferId} {errors} {onPreview} {onRun} onBufferFocus={onTabChange} />
		<BuiltinsPanel {uniforms} values={uniformValues} {presentNames} onToggle={onToggleUniform} bind:open={panelOpen} />
	</div>
{/if}

{#if contextMenu}
	{@const { bufferId, bufferLabel } = contextMenu}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-40"
		role="presentation"
		onclick={() => (contextMenu = null)}
		oncontextmenu={(event) => {
			event.preventDefault();
			contextMenu = null;
		}}
	></div>
	<div
		role="menu"
		class="fixed z-50 min-w-40 rounded border border-border bg-panel py-1 text-xs shadow-xl"
		style:left="{Math.min(contextMenu.x, viewportWidth - CONTEXT_MENU_SIZE.width)}px"
		style:top="{Math.min(contextMenu.y, viewportHeight - CONTEXT_MENU_SIZE.height)}px"
	>
		{@render menuItem('Rename', Pencil, () => startRename(bufferId, bufferLabel))}
		{#if bufferId !== 'common' && canAddBuffer}
			{@render menuItem('Duplicate', Copy, () => {
				onDuplicateBuffer?.(bufferId);
				contextMenu = null;
			})}
		{/if}
		<div class="my-1 border-t border-border"></div>
		{@render menuItem('Remove', Trash2, () => {
			onRemoveBuffer?.(bufferId);
			contextMenu = null;
		}, true)}
	</div>
{/if}

<EditorSettingsModal open={showSettings} onClose={() => (showSettings = false)} />
<Modal open={showConvertModal} onClose={() => declinedConversions.add(activeBufferId)} title="Convert from Shadertoy?">
	<div class="px-5 py-4">
		<p class="mb-6 text-sm text-foreground">This shader looks like Shadertoy code. Convert it to the WebGL format Shayders runs?</p>
		<div class="flex items-center justify-end gap-2">
			<Button onclick={() => declinedConversions.add(activeBufferId)} variant="ghost" size="sm" mono>Cancel</Button>
			<Button onclick={handleConvert} variant="accent" size="sm" mono>Convert</Button>
		</div>
	</div>
</Modal>
