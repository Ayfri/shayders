<script lang="ts">
	import '$lib/layout.css';
	import favicon from '$lib/assets/logo.png';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { VERSION } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types.js';

	interface Props {
		children: Snippet;
		data: LayoutServerData;
	}

	const domain = 'https://shayders.ayfri.com';

	let { children, data }: Props = $props();
</script>

<svelte:head>
	<meta name="generator" content="SvelteKit {VERSION}" />
	<meta name="theme-color" content="#1e1e1e" />
	<link rel="canonical" href={domain + data.pathname} />
	<link rel="icon" type="image/png" href={favicon} />
	<link rel="apple-touch-icon" sizes="400x400" href={favicon} />
</svelte:head>

<div class="flex flex-col h-screen">
	<Header />
	<main class="flex-1 min-h-0 overflow-y-auto">
		{@render children()}
	</main>
	<Footer />
</div>
