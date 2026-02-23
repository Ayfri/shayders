<script lang="ts">
	import '$lib/layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Shayders - GLSL Shader Editor</title>
	<meta name="description" content="A modern GLSL shader editor for creating and experimenting with fragment shaders in real-time." />
	<meta property="og:title" content="Shayders - GLSL Shader Editor" />
	<meta property="og:description" content="A modern GLSL shader editor for creating and experimenting with fragment shaders in real-time." />
	<meta property="og:type" content="website" />
	<meta name="theme-color" content="#1e1e1e" />
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex flex-col h-screen">
	<Header />
	<main class="flex-1 overflow-hidden">
		{@render children()}
	</main>
	<Footer />
</div>
