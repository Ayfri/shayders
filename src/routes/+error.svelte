<script lang="ts">
	import { page } from '$app/state';
	import { CircleAlert } from '@lucide/svelte';
</script>

<svelte:head>
	<title>{page.status} - Shayders</title>
</svelte:head>

<div class="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
	<CircleAlert size={40} class="text-muted opacity-50" />
	<h1 class="font-mono text-7xl font-bold text-foreground">{page.status}</h1>
	<p class="text-muted text-sm max-w-xs">{page.error?.message ?? 'An unexpected error occurred.'}</p>
	<a href="/" class="mt-2 text-xs text-subtle hover:text-muted transition-colors underline underline-offset-4">
		Go back home
	</a>
</div>
