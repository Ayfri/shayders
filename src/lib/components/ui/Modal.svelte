<script lang="ts">
	import { X } from '@lucide/svelte';
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
		if (open) dialog.showModal();
		else if (dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	onclick={(event) => event.target === dialog && onClose?.()}
	oncancel={(event) => {
		event.preventDefault();
		onClose?.();
	}}
	class="m-auto max-h-none max-w-none border-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
>
	<div class="w-140 max-w-[95vw] rounded-lg border border-border bg-surface shadow-2xl">
		{#if title}
			<div class="flex items-center justify-between border-b border-border bg-background px-5 py-3">
				<h2 class="text-sm font-semibold text-foreground">{title}</h2>
				<button onclick={onClose} aria-label="Close" class="rounded p-1 text-subtle transition-colors hover:bg-panel hover:text-foreground">
					<X size={14} />
				</button>
			</div>
		{/if}
		{@render children()}
	</div>
</dialog>
