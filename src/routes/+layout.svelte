<script lang="ts">
	import '$lib/layout.css';
	import favicon from '$lib/assets/logo.png';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="theme-color" content="#1e1e1e" />
	<link rel="icon" type="image/png" href={favicon} />
	<link rel="apple-touch-icon" sizes="400x400" href={favicon} />
</svelte:head>

<div class="flex flex-col h-screen">
	<Header />
	<main class="flex-1 overflow-hidden min-h-0">
		{@render children()}
	</main>
	<Footer />
</div>
