<script lang="ts">
	import type { PageData } from './$types';
	import { CodeXml, Globe } from '@lucide/svelte';
	import ShaderPreview from '$lib/components/ShaderPreview.svelte';
	import type { ShaderBuffer } from '$lib/components/ShaderCanvas.svelte';

	let { data }: { data: PageData } = $props();

	type ShaderItem = {
		id: string;
		name: string;
		description: string;
		created: string;
		updated: string;
		visiblity: string;
		buffers?: ShaderBuffer[];
		userId: string;
	};

	const shaders = $derived<ShaderItem[]>(data.shaders);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}
</script>

<div class="min-h-full overflow-y-auto bg-background text-foreground p-6 lg:p-10">
	<div class="max-w-6xl mx-auto">
		<div class="mb-12">
			<h1 class="text-3xl font-bold text-foreground mb-2">Explore Shaders</h1>
			<p class="text-muted">Discover amazing WebGL shaders created by the community</p>
		</div>

		{#if shaders.length === 0}
			<div class="flex flex-col items-center justify-center py-24 gap-3 text-muted">
				<CodeXml size={40} class="opacity-30" />
				<p class="text-sm">No public shaders yet.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				{#each shaders as shader (shader.id)}
					<div class="group rounded-lg border border-border bg-surface overflow-hidden flex flex-col hover:border-subtle transition-colors">
						<a
							href="/shader/{shader.id}"
							class="block h-36 relative overflow-hidden bg-black group-hover:brightness-110 transition-all"
						>
							{#if shader.buffers && shader.buffers.length > 0}
								<ShaderPreview
									buffers={shader.buffers}
									shaderId={shader.id}
									name={shader.name}
								/>
							{:else}
								<div class="w-full h-full bg-linear-to-br from-panel via-background to-panel flex items-center justify-center">
									<CodeXml size={20} class="text-muted opacity-30" />
								</div>
							{/if}
						</a>
						<div class="p-3 flex flex-col gap-1 flex-1">
							<div class="flex items-start justify-between gap-2">
								<a
									href="/shader/{shader.id}"
									class="font-medium text-sm text-foreground hover:text-white transition-colors truncate"
								>
									{shader.name}
								</a>
							</div>

							{#if shader.description}
								<p class="text-xs text-muted line-clamp-2">{shader.description}</p>
							{/if}

							<div class="flex items-center justify-between mt-auto pt-1">
								<p class="text-xs text-subtle">{formatDate(shader.created)}</p>
								<span class="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-green-900/50 bg-green-950/30 text-green-400">
									<Globe size={10} />
									Public
								</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
