<script lang="ts">
	import '$lib/layout.css';
	import { VERSION } from '@sveltejs/kit';
	import favicon from '$lib/assets/logo.png';
	import { hydrateAuth } from '$features/auth/auth-client.svelte';
	import Footer from '$layout/Footer.svelte';
	import Header from '$layout/Header.svelte';
	import {
		buildSiteUrl,
		SITE_NAME,
		SITE_SEARCH_URL_TEMPLATE,
		SITE_URL,
	} from '$lib/site';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types.js';

	interface Props {
		children: Snippet;
		data: LayoutServerData;
	}

	const websiteStructuredData = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: SITE_NAME,
		potentialAction: {
			'@type': 'SearchAction',
			target: SITE_SEARCH_URL_TEMPLATE,
			'query-input': 'required name=search_term_string',
		},
		url: SITE_URL,
	});

	let { children, data }: Props = $props();
	const sessionUser = $derived(data.sessionUser ?? null);

	$effect(() => {
		hydrateAuth(sessionUser);
	});
</script>

<svelte:head>
	<meta name="application-name" content={SITE_NAME} />
	<meta name="generator" content="SvelteKit {VERSION}" />
	<meta name="theme-color" content="#1e1e1e" />
	<link rel="canonical" href={buildSiteUrl(data.pathname)} />
	<link rel="icon" type="image/png" href={favicon} />
	<link rel="apple-touch-icon" sizes="400x400" href={favicon} />
	<link rel="search" type="application/opensearchdescription+xml" title="Shayders Search" href="/opensearch.xml" />
	<svelte:element this={'script'} type="application/ld+json">{websiteStructuredData}</svelte:element>

	<script async src="https://www.googletagmanager.com/gtag/js?id=G-H1GB3WTEBD"></script>
	<script>
		window.dataLayer = window.dataLayer || [];
		function gtag(){dataLayer.push(arguments);}
		gtag('js', new Date());

		gtag('config', 'G-H1GB3WTEBD');
	</script>
</svelte:head>

<div class="flex flex-col h-screen">
	<Header {sessionUser} />
	<main class="flex-1 min-h-0 overflow-y-auto">
		{@render children()}
	</main>
	<Footer />
</div>

