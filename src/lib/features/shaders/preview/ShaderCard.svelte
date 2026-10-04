<script lang="ts">
	import { CodeXml } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import ShaderPreview from '#features/shaders/preview/ShaderPreview.svelte';
	import type { ChannelEntry, ShaderBuffer } from '#features/shaders/model/shader-content.js';
	import { formatDate } from '#lib/format.js';
	import { getShaderPath } from '#lib/site.js';

	interface Props {
		author?: { href: string; name: string };
		children?: Snippet;
		/** Shown in place of an empty description. */
		fallbackDescription?: string;
		/** Rendered over the preview, outside its link so it can hold buttons. */
		overlay?: Snippet;
		shader: { buffers: ShaderBuffer[]; channels: ChannelEntry[]; created: string; description: string; id: string; name: string };
	}

	let { author, children, fallbackDescription = 'No description yet.', overlay, shader }: Props = $props();

	const href = $derived(getShaderPath(shader.id));
</script>

<article class="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_12px_40px_-12px_--alpha(var(--color-accent)/35%)]">
	<div class="relative">
		<a {href} class="block aspect-video overflow-hidden bg-black">
			{#if shader.buffers.length > 0}
				<ShaderPreview buffers={shader.buffers} channels={shader.channels} name={shader.name} />
			{:else}
				<div class="flex h-full w-full items-center justify-center bg-linear-to-br from-panel via-background to-panel">
					<CodeXml size={20} class="text-muted opacity-30" />
				</div>
			{/if}
		</a>
		{@render overlay?.()}
	</div>

	<div class="flex flex-1 flex-col gap-2 p-3">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<a {href} class="block truncate text-sm font-medium text-foreground transition-colors hover:text-white">{shader.name}</a>
				{#if author}
					<a href={author.href} class="mt-1 inline-flex text-xs text-muted transition-colors hover:text-foreground">by {author.name}</a>
				{/if}
			</div>
			<span class="shrink-0 whitespace-nowrap text-xs text-subtle">{formatDate(shader.created)}</span>
		</div>

		{#if shader.description}
			<p class="line-clamp-2 text-xs leading-5 text-muted">{shader.description}</p>
		{:else}
			<p class="text-xs leading-5 text-subtle">{fallbackDescription}</p>
		{/if}

		{@render children?.()}
	</div>
</article>
