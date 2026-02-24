<script lang="ts">
	import logo from '$lib/assets/logo.png';

	interface Props {
		title: string;
		description: string;
		ogType?: string;
		ogImage?: string;
		ogUrl?: string;
		twitterCard?: string;
	}

	const domain = 'https://shayders.ayfri.com';

	const {
		title,
		description,
		ogType = 'website',
		ogImage = logo,
		ogUrl = typeof window !== 'undefined' ? window.location.href : domain,
		twitterCard = 'summary',
	}: Props = $props();
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content={ogType} />
	<meta property="og:url" content={ogUrl} />
	{#if ogImage}
		<meta property="og:image" content={ogImage} />
		<meta name="twitter:image" content={ogImage} />
	{/if}
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:card" content={twitterCard} />
</svelte:head>
