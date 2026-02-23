<script lang="ts">
	import ShaderCanvas, { type ShaderBuffer } from '$lib/components/ShaderCanvas.svelte';
	import ShaderEditorPage from '$lib/components/ShaderEditorPage.svelte';
	import { auth } from '$lib/auth.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const isOwner = $derived(!!auth.user?.id && auth.user.id === data.shader.user_id);

	const buffers = $derived<ShaderBuffer[]>(
		Array.isArray(data.shader.content) ? (data.shader.content as ShaderBuffer[]) : []
	);
</script>

{#if isOwner}
	<ShaderEditorPage
		initialId={data.shader.id}
		initialName={data.shader.name}
		initialDescription={data.shader.description}
		initialBuffers={buffers}
	/>
{:else}
	<div class="flex flex-col h-full bg-background text-foreground">
		<div class="flex items-center gap-4 px-5 h-11 border-b border-border bg-surface shrink-0">
			<div class="flex flex-col min-w-0">
				<span class="text-sm font-semibold text-foreground truncate">{data.shader.name || 'Untitled Shader'}</span>
				{#if data.shader.description}
					<span class="text-xs text-muted truncate max-w-xl">{data.shader.description}</span>
				{/if}
			</div>
		</div>
		<div class="flex-1 overflow-hidden">
			<ShaderCanvas {buffers} readonly />
		</div>
	</div>
{/if}
