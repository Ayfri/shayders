<script lang="ts">
	import { page } from '$app/state';
	import { buildSiteUrl, type JsonLdNode, serializeJsonLd, SITE_AUTHOR, SITE_NAME, SITE_OG_IMAGE, SITE_TWITTER_HANDLE } from '#lib/site.js';

	interface Props {
		title: string;
		description: string;
		jsonLd?: JsonLdNode | JsonLdNode[];
		modifiedTime?: string;
		ogImage?: string;
		ogImageAlt?: string;
		ogType?: 'website' | 'article' | 'profile';
		ogUrl?: string;
		publishedTime?: string;
		robots?: string;
		twitterCard?: 'summary' | 'summary_large_image';
	}

	const {
		title,
		description,
		jsonLd,
		modifiedTime,
		ogImage,
		ogImageAlt,
		ogType = 'website',
		ogUrl,
		publishedTime,
		robots = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
		twitterCard,
	}: Props = $props();

	const resolvedOgUrl = $derived(buildSiteUrl(ogUrl ?? page.url.pathname));
	const resolvedOgImage = $derived(buildSiteUrl(ogImage ?? SITE_OG_IMAGE.path));
	const resolvedOgImageAlt = $derived(ogImageAlt ?? (ogImage ? title : SITE_OG_IMAGE.alt));
	/** Custom images (avatars) are square, only the generated banner fits the large card. */
	const resolvedTwitterCard = $derived(twitterCard ?? (ogImage ? 'summary' : 'summary_large_image'));
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta name="robots" content={robots} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:locale" content="en_US" />
	<meta property="og:type" content={ogType} />
	<meta property="og:url" content={resolvedOgUrl} />
	<meta property="og:image" content={resolvedOgImage} />
	<meta property="og:image:alt" content={resolvedOgImageAlt} />
	{#if !ogImage}
		<meta property="og:image:type" content="image/png" />
		<meta property="og:image:width" content={String(SITE_OG_IMAGE.width)} />
		<meta property="og:image:height" content={String(SITE_OG_IMAGE.height)} />
	{/if}
	{#if publishedTime}
		<meta property="article:published_time" content={publishedTime} />
	{/if}
	{#if modifiedTime}
		<meta property="article:modified_time" content={modifiedTime} />
	{/if}
	<meta name="author" content={SITE_AUTHOR.name} />
	<meta name="twitter:card" content={resolvedTwitterCard} />
	<meta name="twitter:site" content={SITE_TWITTER_HANDLE} />
	<meta name="twitter:creator" content={SITE_TWITTER_HANDLE} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={resolvedOgImage} />
	<meta name="twitter:image:alt" content={resolvedOgImageAlt} />
	{#if jsonLd}
		{@html `<script type="application/ld+json">${serializeJsonLd(jsonLd)}</script>`}
	{/if}
</svelte:head>
