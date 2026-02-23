<script lang="ts">
	interface Props {
		title: string;
		description: string;
		ogType?: string;
		ogImage?: string;
		ogUrl?: string;
		twitterCard?: string;
	}

	const {
		title,
		description,
		ogType = 'website',
		ogImage,
		ogUrl = typeof window !== 'undefined' ? window.location.href : 'https://shayders.ayfri.com',
		twitterCard = 'summary',
	}: Props = $props();

	const domainUrl = 'https://shayders.ayfri.com';
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
