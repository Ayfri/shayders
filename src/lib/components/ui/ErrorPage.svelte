<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';

	interface Props {
		icon: LucideIcon;
		linkLabel?: string;
		message: string;
		status: number;
		title: string;
	}

	let { icon: Icon, linkLabel = 'Go back home', message, status, title }: Props = $props();
</script>

<svelte:head>
	<title>{title} - Shayders</title>
</svelte:head>

<div class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
	<Icon size={40} class="text-muted opacity-50" />
	<h1 class="font-mono text-7xl font-bold text-foreground">{status}</h1>
	<p class="max-w-xs text-sm text-muted">{message}</p>
	<a href="/" class="mt-2 text-xs text-subtle underline underline-offset-4 transition-colors hover:text-muted">{linkLabel}</a>
</div>
