<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		icon: LucideIcon;
		title: string;
	}

	let { children, icon: Icon, title }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted">
	<Icon size={40} class="opacity-30" />
	<p class="text-base text-foreground">{title}</p>
	{#if children}
		<div class="flex max-w-md flex-col items-center gap-2 text-sm leading-6">{@render children()}</div>
	{/if}
</div>
