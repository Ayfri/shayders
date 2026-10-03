<script lang="ts">
	import ShaderEditorPage from '#features/shaders/editor/ShaderEditorPage.svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import { Lock } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fallbackDescription = 'A shader created with Shayders GLSL editor';
</script>

{#if data.private}
	<SeoHead title="Shayder" description={fallbackDescription} />
	<div class="flex flex-col items-center justify-center h-full gap-3 text-muted bg-background">
		<Lock size={32} class="opacity-40" />
		<p class="text-sm">This shader is private.</p>
	</div>
{:else}
	{@const { shader } = data}
	<SeoHead
		title="{shader.name} by {shader.authorName} - Shayders"
		description={shader.description.slice(0, 155) || fallbackDescription}
	/>
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
{/if}
