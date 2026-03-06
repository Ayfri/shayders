<script lang="ts">
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.png';
	import { buildSiteUrl, SITE_NAME } from '$lib/site';

	interface Props {
		title: string;
		description: string;
		ogType?: string;
		ogImage?: string;
		ogUrl?: string;
		robots?: string;
		twitterCard?: string;
	}

	const {
		title,
		description,
		ogType = 'website',
		ogImage = logo,
		ogUrl = undefined,
		robots = undefined,
		twitterCard = 'summary',
	}: Props = $props();

	const resolvedOgUrl = $derived(ogUrl ? buildSiteUrl(ogUrl) : buildSiteUrl(`${page.url.pathname}${page.url.search}`));
	const resolvedOgImage = $derived(ogImage ? buildSiteUrl(ogImage) : null);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	{#if robots}
		<meta name="robots" content={robots} />
	{/if}
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:type" content={ogType} />
	<meta property="og:url" content={resolvedOgUrl} />
	{#if resolvedOgImage}
		<meta property="og:image" content={resolvedOgImage} />
		<meta name="twitter:image" content={resolvedOgImage} />
	{/if}
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:card" content={twitterCard} />
</svelte:head>
