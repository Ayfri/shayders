<script lang="ts">
	import { FileX } from '@lucide/svelte';
</script>

<svelte:head>
	<title>Shader Not Found - Shayders</title>
</svelte:head>

<div class="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
	<FileX size={40} class="text-muted opacity-50" />
	<h1 class="font-mono text-7xl font-bold text-foreground">404</h1>
	<p class="text-muted text-sm max-w-xs">This shader doesn't exist or may have been deleted.</p>
	<a href="/" class="mt-2 text-xs text-subtle hover:text-muted transition-colors underline underline-offset-4">
		Browse shaders
	</a>
</div>
