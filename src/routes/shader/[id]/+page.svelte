<script lang="ts">
	import ShaderEditorPage from '#features/shaders/editor/ShaderEditorPage.svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import { buildSiteUrl, getShaderPath, getUserProfilePath, SITE_NAME, SITE_URL, truncateText } from '#lib/site.js';
	import { Lock } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Crawlers and answer engines don't run WebGL nor Monaco, the source is exposed as structured data and a no-JS fallback. */
	const MAX_INDEXED_SOURCE_LENGTH = 20_000;
</script>

{#if data.private}
	<SeoHead title="Private shader - {SITE_NAME}" description="This shader is private." robots="noindex, nofollow" />
	<div class="flex flex-col items-center justify-center h-full gap-3 text-muted bg-background">
		<Lock size={32} class="opacity-40" />
		<p class="text-sm">This shader is private.</p>
	</div>
{:else}
	{@const { shader } = data}
	{@const url = buildSiteUrl(getShaderPath(shader.id))}
	{@const authorUrl = buildSiteUrl(getUserProfilePath(shader.authorId))}
	{@const source = shader.buffers.map((buffer) => `// ${buffer.label}\n${buffer.code}`).join('\n\n')}
	{@const description = truncateText(shader.description) || `${shader.name}, a GLSL fragment shader by ${shader.authorName} with a live WebGL preview on ${SITE_NAME}.`}
	<SeoHead
		title="{shader.name} by {shader.authorName} - {SITE_NAME}"
		{description}
		ogType="article"
		publishedTime={shader.created}
		modifiedTime={shader.updated}
		robots={shader.visiblity === 'public' ? undefined : 'noindex, follow'}
		jsonLd={[
			{
				'@id': `${url}#code`,
				'@type': 'SoftwareSourceCode',
				author: { '@type': 'Person', name: shader.authorName, url: authorUrl },
				codeSampleType: 'full solution',
				dateCreated: shader.created,
				dateModified: shader.updated,
				description,
				isPartOf: { '@id': `${SITE_URL}/#website` },
				name: shader.name,
				programmingLanguage: { '@type': 'ComputerLanguage', name: 'GLSL ES 1.00' },
				runtimePlatform: 'WebGL',
				text: source.slice(0, MAX_INDEXED_SOURCE_LENGTH),
				url,
			},
			{
				'@type': 'BreadcrumbList',
				itemListElement: [
					{ '@type': 'ListItem', item: SITE_URL, name: 'Shaders', position: 1 },
					{ '@type': 'ListItem', item: authorUrl, name: shader.authorName, position: 2 },
					{ '@type': 'ListItem', item: url, name: shader.name, position: 3 },
				],
			},
		]}
	/>
	<noscript>
		<article class="p-6 text-foreground">
			<h1 class="text-xl font-bold">{shader.name}</h1>
			<p class="text-sm text-muted">By <a href={getUserProfilePath(shader.authorId)}>{shader.authorName}</a></p>
			{#if shader.description}<p class="mt-2 text-sm">{shader.description}</p>{/if}
			{#each shader.buffers as buffer (buffer.id)}
				<h2 class="mt-4 text-sm font-bold">{buffer.label}</h2>
				<pre class="overflow-x-auto text-xs"><code>{buffer.code}</code></pre>
			{/each}
		</article>
	</noscript>
	{#key shader.id}
		<ShaderEditorPage
			initialId={shader.id}
			initialName={shader.name}
			initialDescription={shader.description}
			initialVisiblity={shader.visiblity}
			initialBuffers={shader.buffers}
			initialChannels={shader.channels}
			viewOnly={!data.isOwner}
			authorId={data.isOwner ? undefined : shader.authorId}
			authorName={data.isOwner ? undefined : shader.authorName}
		/>
	{/key}
{/if}
