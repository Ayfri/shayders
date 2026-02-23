<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		open: boolean;
		onClose?: () => void;
		title?: string;
	}

	let { children, open = false, onClose, title }: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (!dialog) return;
		if (open) {
			dialog.showModal();
		} else if (dialog.open) {
			dialog.close();
		}
	});
</script>

<dialog
	bind:this={dialog}
	onclick={(e) => e.target === dialog && onClose?.()}
	oncancel={(e) => { e.preventDefault(); onClose?.(); }}
    class="m-auto border-none p-0 bg-transparent max-w-none max-h-none backdrop:bg-black/60 backdrop-blur-sm"
>
	<div class="bg-surface border border-border rounded-lg shadow-2xl w-140 max-w-[95vw]">
		{#if title}
			<div class="flex items-center justify-between px-5 py-3 border-b border-border bg-background">
				<h2 class="text-sm font-semibold text-foreground">{title}</h2>
				<button
					onclick={onClose}
					aria-label="Close"
					class="cursor-pointer text-subtle hover:text-foreground hover:bg-panel rounded p-1 transition-colors"
				>
					✕
				</button>
			</div>
		{/if}
		{@render children()}
	</div>
</dialog>
