<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		changed?: boolean;
		children: Snippet;
		label: string;
		onReset?: () => void;
	}

	let { changed = false, children, label, onReset }: Props = $props();
</script>

<div class="flex items-center justify-between gap-3">
	<span class={['flex flex-1 items-center gap-2 text-xs', changed ? 'font-bold text-foreground' : 'text-muted']}>
		{label}
		{#if changed}
			<button onclick={onReset} title="Reset to default" aria-label="Reset {label} to default" class="text-muted transition-colors hover:text-foreground">
				<RotateCcw size={12} />
			</button>
		{/if}
	</span>
	<div class="flex items-center gap-2">
		{@render children()}
	</div>
</div>
