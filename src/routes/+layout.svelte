<script lang="ts">
	import '#lib/layout.css';
	import { VERSION } from '@sveltejs/kit';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '#lib/assets/logo.png';
	import { hydrateAuth } from '#features/auth/auth-client.svelte.js';
	import Footer from '#components/layout/Footer.svelte';
	import Header from '#components/layout/Header.svelte';
	import {
		buildSiteUrl,
		serializeJsonLd,
		SITE_AUTHOR,
		SITE_DESCRIPTION,
		SITE_NAME,
		SITE_OG_IMAGE,
		SITE_REPOSITORY_URL,
		SITE_SEARCH_URL_TEMPLATE,
		SITE_URL,
	} from '#lib/site.js';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types.js';

	interface Props {
		children: Snippet;
		data: LayoutServerData;
	}

	const siteStructuredData = serializeJsonLd([
		SITE_AUTHOR,
		{
			'@id': `${SITE_URL}/#website`,
			'@type': 'WebSite',
			description: SITE_DESCRIPTION,
			image: buildSiteUrl(SITE_OG_IMAGE.path),
			inLanguage: 'en',
			name: SITE_NAME,
			publisher: { '@id': SITE_AUTHOR['@id'] },
			potentialAction: {
				'@type': 'SearchAction',
				target: SITE_SEARCH_URL_TEMPLATE,
				'query-input': 'required name=search_term_string',
			},
			url: SITE_URL,
		},
		{
			'@id': `${SITE_URL}/#app`,
			'@type': 'WebApplication',
			applicationCategory: 'DeveloperApplication',
			author: { '@id': SITE_AUTHOR['@id'] },
			browserRequirements: 'Requires WebGL',
			isAccessibleForFree: true,
			license: 'https://www.gnu.org/licenses/gpl-3.0.html',
			sameAs: SITE_REPOSITORY_URL,
			screenshot: buildSiteUrl(SITE_OG_IMAGE.path),
			description: SITE_DESCRIPTION,
			featureList: [
				'GLSL fragment shader editor with live WebGL preview',
				'Multipass rendering with up to 8 offscreen buffers',
				'Image, video and webcam texture channels',
				'Autocompletion, hover docs and inline errors for GLSL',
				'Public shader gallery and creator profiles',
			],
			name: `${SITE_NAME} GLSL editor`,
			operatingSystem: 'Any',
			url: `${SITE_URL}/new`,
		},
	]);

	let { children, data }: Props = $props();
	const sessionUser = $derived(data.sessionUser ?? null);
	/** Editor pages fill the viewport, the footer scrolls with the content everywhere else. */
	const showFooter = $derived(!['/new', '/shader/'].some((path) => page.url.pathname.startsWith(path)));

	$effect(() => {
		hydrateAuth(sessionUser);
	});

	let main: HTMLElement;
	/** SvelteKit only resets the window scroll, the scrolling element here is `main`. Same-path query changes (sorting) and anchors keep their position. */
	afterNavigate(({ from, to, type }) => {
		if (type !== 'popstate' && !to?.url.hash && from?.url.pathname !== to?.url.pathname) main.scrollTop = 0;
	});
</script>

<svelte:head>
	<meta name="application-name" content={SITE_NAME} />
	<meta name="generator" content="SvelteKit {VERSION}" />
	<meta name="theme-color" content="#1a1a1a" />
	<link rel="canonical" href={buildSiteUrl(page.url.pathname)} />
	<link rel="icon" type="image/png" href={favicon} />
	<link rel="apple-touch-icon" sizes="400x400" href={favicon} />
	<link rel="search" type="application/opensearchdescription+xml" title="Shayders Search" href="/opensearch.xml" />
	<link rel="sitemap" type="application/xml" href="/sitemap.xml" />
	{@html `<script type="application/ld+json">${siteStructuredData}</script>`}

	<script async src="https://www.googletagmanager.com/gtag/js?id=G-H1GB3WTEBD"></script>
	<script>
		window.dataLayer = window.dataLayer || [];
		function gtag(){dataLayer.push(arguments);}
		gtag('js', new Date());

		gtag('config', 'G-H1GB3WTEBD');
	</script>
</svelte:head>

<div class="flex flex-col h-dvh">
	<Header {sessionUser} />
	<!-- `relative` keeps absolutely positioned descendants from growing the document, which would let anchor jumps scroll the header away. -->
	<main bind:this={main} class="relative flex-1 min-h-0 overflow-y-auto">
		<div class={showFooter ? 'flex min-h-full flex-col' : 'h-full'}>
			<div class={showFooter ? 'flex-1' : 'h-full'}>
				{@render children()}
			</div>
			{#if showFooter}<Footer />{/if}
		</div>
	</main>
</div>

