<script lang="ts">
	import { Code, Play, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import GlslEditor from '$lib/GlslEditor.svelte';
	import BuiltinsPanel, { type UniformEntry } from '$lib/BuiltinsPanel.svelte';

	interface Props {
		value: string;
		errors?: string;
		onRun?: () => void;
		uniforms: UniformEntry[];
		panelOpen?: boolean;
	}

	let { value = $bindable(), errors = '', onRun, uniforms, panelOpen = $bindable(false) }: Props =
		$props();

	let visible = $state(true);
	let width = $state(500);
	let isDragging = $state(false);

	function startDrag(e: MouseEvent) {
		e.preventDefault();
		isDragging = true;
		const startX = e.clientX;
		const startWidth = width;

		const onMove = (e: MouseEvent) => {
			const delta = startX - e.clientX;
			width = Math.max(240, Math.min(window.innerWidth * 0.75, startWidth + delta));
		};

		const onUp = () => {
			isDragging = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}
</script>

{#if !visible}
	<!-- Collapsed strip -->
	<button
		onclick={() => (visible = true)}
		class="flex items-center justify-center w-8 h-full bg-panel border-l border-border text-muted hover:text-cyan-400 hover:bg-surface transition-colors shrink-0 cursor-pointer"
		title="Show editor"
	>
		<ChevronLeft size={16} />
	</button>
{:else}
	<!-- Drag / resize handle -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="w-1.5 shrink-0 cursor-col-resize transition-colors bg-border hover:bg-cyan-400/50 {isDragging
			? 'bg-cyan-400/70'
			: ''}"
		onmousedown={startDrag}
		role="separator"
		aria-label="Resize editor panel"
	></div>

	<!-- Editor panel -->
	<div
		class="flex flex-col min-w-0 bg-surface shrink-0 overflow-hidden"
		style="width: {width}px"
	>
		<!-- Header -->
		<div
			class="flex items-center gap-4 px-4 py-2 bg-panel border-b border-border text-xs text-muted shrink-0"
		>
			<Code size={14} class="text-cyan-400 shrink-0" />
			<span class="font-medium tracking-wider">fragment.glsl</span>
			<span class="text-xs text-subtle font-mono ml-auto">Ctrl+Enter</span>
			<button
				onclick={onRun}
				class="flex items-center gap-2 px-4 py-1.5 bg-cyan-400/10 text-cyan-400 border border-cyan-400/60 rounded font-mono text-xs font-semibold tracking-wider cursor-pointer hover:bg-cyan-400/20 transition-colors"
			>
				<Play size={13} />
				Run
			</button>
			<!-- Toggle close -->
			<button
				onclick={() => (visible = false)}
				class="flex items-center justify-center size-7 rounded text-muted hover:text-foreground hover:bg-border transition-colors cursor-pointer"
				title="Hide editor"
			>
				<ChevronRight size={15} />
			</button>
		</div>

		<GlslEditor bind:value {errors} {onRun} />
		<BuiltinsPanel {uniforms} bind:open={panelOpen} />
	</div>
{/if}
