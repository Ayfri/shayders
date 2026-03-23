<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		changed?: boolean;
		onReset?: () => void;
		children: Snippet;
	}

	let { label, changed = false, onReset, children }: Props = $props();
</script>

<div class="flex items-center justify-between gap-3">
	{#if changed}
		<button
			onclick={onReset}
			title="Reset to default"
			class="cursor-pointer flex items-center justify-center text-xs text-foreground"
		>
			<RotateCcw size={12} />
		</button>
	{/if}
	<span class={`flex-1 text-xs text-muted ${changed ? 'font-bold' : ''}`}>{label}</span>
	<div class="flex items-center gap-2">
		{@render children()}
	</div>
</div>
