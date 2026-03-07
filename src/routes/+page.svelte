<script lang="ts">
	import { ArrowRight, CodeXml } from '@lucide/svelte';
	import ShaderPreview from '$lib/components/ShaderPreview.svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import {
		getShaderSortLabel,
		SHADER_SORT_OPTIONS,
		sortShaders,
		type ShaderSort,
	} from '$lib/shader-list';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const shaders = $derived.by(() => sortShaders(data.shaders, data.selectedSort));
	const currentSortLabel = $derived(getShaderSortLabel(data.selectedSort));
	const visibleAuthors = $derived.by(() => new Set(shaders.map((shader) => shader.authorId)).size);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}

	function sortHref(sort: ShaderSort) {
		return `?sort=${sort}`;
	}
</script>

<SeoHead
	title="Shayders - GLSL Shader Editor"
	description="Discover amazing WebGL shaders created by the community. A modern GLSL shader editor for creating and experimenting with fragment shaders in real-time."
/>

<div class="min-h-full bg-background text-foreground p-6 lg:p-10">
	<div class="mx-auto max-w-6xl">
		<div class="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
			<div>
				<h1 class="text-3xl font-bold text-foreground sm:text-4xl">Explore Shaders</h1>
				<p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
					Discover work from the community and open any shader instantly in the editor.
				</p>
				<p class="mt-3 text-sm text-subtle">
					{data.totalShaders} public shader{data.totalShaders !== 1 ? 's' : ''}, {visibleAuthors} creator{visibleAuthors !== 1 ? 's' : ''} on this page.
				</p>
			</div>

			<a
				href="/new"
				class="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground transition-colors hover:bg-panel lg:self-auto"
			>
				Create a shader
				<ArrowRight size={14} />
			</a>
		</div>

		<div class="mb-8 flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<p class="text-sm font-medium text-foreground">Sorted by {currentSortLabel.toLowerCase()}.</p>
				<p class="text-xs text-muted">Switch between recent uploads and alphabetical browsing.</p>
			</div>

			<nav aria-label="Sort public shaders" class="flex flex-wrap gap-2">
				{#each SHADER_SORT_OPTIONS as option (option.value)}
					<a
						href={sortHref(option.value)}
						aria-current={data.selectedSort === option.value ? 'page' : undefined}
						class={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm transition-colors ${data.selectedSort === option.value ? 'border-subtle bg-panel text-foreground' : 'border-border text-muted hover:bg-panel hover:text-foreground'}`}
					>
						{option.label}
					</a>
				{/each}
			</nav>
		</div>

		{#if shaders.length === 0}
			<div class="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted">
				<CodeXml size={40} class="opacity-30" />
				<p class="text-base text-foreground">No public shaders yet.</p>
				<p class="max-w-md text-sm text-muted">Publish the first shader and start the gallery.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{#each shaders as shader (shader.id)}
					<div class="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-subtle">
						<a href="/shader/{shader.id}" class="block h-36 overflow-hidden bg-black">
							{#if shader.buffers && shader.buffers.length > 0}
								<ShaderPreview
									buffers={shader.buffers}
									channels={shader.channels}
									name={shader.name}
								/>
							{:else}
								<div class="flex h-full w-full items-center justify-center bg-linear-to-br from-panel via-background to-panel">
									<CodeXml size={20} class="text-muted opacity-30" />
								</div>
							{/if}
						</a>

						<div class="flex flex-1 flex-col gap-2 p-3">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<a href="/shader/{shader.id}" class="block truncate text-sm font-medium text-foreground transition-colors hover:text-white">
										{shader.name}
									</a>
									<a href="/users/{shader.authorId}" class="mt-1 inline-flex text-xs text-muted transition-colors hover:text-foreground">
										by {shader.authorName}
									</a>
								</div>
								<span class="shrink-0 whitespace-nowrap text-xs text-subtle">{formatDate(shader.created)}</span>
							</div>

							{#if shader.description}
								<p class="line-clamp-2 text-xs leading-5 text-muted">{shader.description}</p>
							{:else}
								<p class="text-xs leading-5 text-subtle">No description yet.</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
