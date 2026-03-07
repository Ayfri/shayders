<script lang="ts">
	import ShaderEditorPage from '$lib/components/ShaderEditorPage.svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import { Lock } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const author = $derived(data.private ? 'Unknown Author' : (data.shader.authorName || 'Unknown Author'));
	const isOwner = $derived(!data.private && data.isOwner);
	const isPrivate = $derived(data.private);
	const title = $derived(data.private ? 'Shayder' : data.shader.name);
	const description = $derived(
		data.private
			? 'A shader created with Shayders GLSL editor'
			: (data.shader.description?.slice(0, 155) || 'A shader created with Shayders GLSL editor')
	);
</script>

<SeoHead
	title={isPrivate ? "Shayder" : `${title} by ${author} - Shayders`}
	description={isPrivate ? "A shader created with Shayders GLSL editor" : description}
/>

{#if data.private}
	<div class="flex flex-col items-center justify-center h-full gap-3 text-muted bg-background">
		<Lock size={32} class="opacity-40" />
		<p class="text-sm">This shader is private.</p>
	</div>
{:else if isOwner}
	<ShaderEditorPage
		initialId={data.shader.id}
		initialName={data.shader.name}
		initialDescription={data.shader.description}
		initialVisiblity={data.shader.visiblity}
		initialBuffers={data.shader.buffers}
		initialChannels={data.shader.channels}
	/>
{:else}
	<ShaderEditorPage
		initialId={data.shader.id}
		initialName={data.shader.name}
		initialDescription={data.shader.description}
		initialVisiblity={data.shader.visiblity}
		initialBuffers={data.shader.buffers}
		initialChannels={data.shader.channels}
		viewOnly
		authorId={data.shader.authorId}
		authorName={data.shader.authorName}
	/>
{/if}
