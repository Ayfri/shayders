<script lang="ts">
	import ShaderCanvas, { type ShaderBuffer } from '$lib/components/ShaderCanvas.svelte';
	import ShaderEditorPage from '$lib/components/ShaderEditorPage.svelte';
	import { auth } from '$lib/auth.svelte';
	import { Lock } from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const isOwner = $derived(!!auth.user?.id && auth.user.id === data.shader.user_id);
	const isPrivate = $derived(data.shader.visiblity === 'private' && !isOwner);

	const buffers = $derived<ShaderBuffer[]>(
		Array.isArray(data.shader.content) ? (data.shader.content as ShaderBuffer[]) : []
	);
</script>

{#if isPrivate}
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
		initialBuffers={buffers}
	/>
{:else}
	<ShaderEditorPage
		initialId={data.shader.id}
		initialName={data.shader.name}
		initialDescription={data.shader.description}
		initialVisiblity={data.shader.visiblity}
		initialBuffers={buffers}
		viewOnly
	/>
{/if}
