<script lang="ts">
	import type { PageData } from './$types';
	import { auth } from '$lib/auth.svelte';
	import { pb } from '$lib/pocketbase';
	import { User, Trash2, ExternalLink, Code2 } from '@lucide/svelte';

	let { data }: { data: PageData } = $props();

	let deletedIds = $state(new Set<string>());
	let deletingId = $state<string | null>(null);
	let confirmId = $state<string | null>(null);

	const shaders = $derived(data.shaders.filter((s) => !deletedIds.has(s.id)));
	const isOwner = $derived(
		auth.isLoggedIn && auth.user?.id === data.profileUser.id
	);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('fr-FR', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}

	async function deleteShader(id: string) {
		deletingId = id;
		try {
			await pb.collection('shaders').delete(id);
				deletedIds = new Set([...deletedIds, id]);
		} catch (e) {
			console.error('Failed to delete shader', e);
		} finally {
			deletingId = null;
			confirmId = null;
		}
	}
</script>

<div class="min-h-full overflow-y-auto bg-background text-foreground p-6 lg:p-10">
	<div class="max-w-5xl mx-auto">
		<div class="flex items-center gap-4 mb-10">
			<div class="w-14 h-14 rounded-full bg-panel border border-border flex items-center justify-center shrink-0">
				<User size={26} class="text-muted" />
			</div>
			<div>
				<h1 class="text-xl font-semibold text-foreground">
					{data.profileUser.name}
				</h1>
			</div>
			<div class="ml-auto text-sm text-muted">
				{shaders.length} shader{shaders.length !== 1 ? 's' : ''}
			</div>
		</div>

		{#if shaders.length === 0}
			<div class="flex flex-col items-center justify-center py-24 gap-3 text-muted">
				<Code2 size={40} class="opacity-30" />
				<p class="text-sm">Aucun shader pour l'instant.</p>
				{#if isOwner}
					<a
						href="/new"
						class="mt-2 px-4 py-1.5 rounded bg-panel border border-border text-sm text-foreground hover:bg-surface transition-colors"
					>
						Créer un shader
					</a>
				{/if}
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each shaders as shader (shader.id)}
					<div class="group rounded-lg border border-border bg-surface overflow-hidden flex flex-col hover:border-subtle transition-colors">
						<a
							href="/shader/{shader.id}"
							class="block h-36 bg-linear-to-br from-panel via-background to-panel relative overflow-hidden"
							aria-label="Ouvrir {shader.name}"
						>
							<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_60%,rgba(6,182,212,0.08),transparent_60%)]"></div>
							<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(139,92,246,0.07),transparent_60%)]"></div>
							<div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
								<ExternalLink size={14} class="text-muted" />
							</div>
						</a>

						<div class="p-3 flex flex-col gap-1 flex-1">
							<div class="flex items-start justify-between gap-2">
								<a
									href="/shader/{shader.id}"
									class="font-medium text-sm text-foreground hover:text-white transition-colors truncate"
								>
									{shader.name}
								</a>
								{#if isOwner}
									{#if confirmId === shader.id}
										<div class="flex items-center gap-1 shrink-0">
											<button
												onclick={() => deleteShader(shader.id)}
												disabled={deletingId === shader.id}
												class="text-xs px-2 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-900/50 hover:bg-red-900/60 transition-colors cursor-pointer disabled:opacity-50"
											>
												{deletingId === shader.id ? '...' : 'Confirmer'}
											</button>
											<button
												onclick={() => (confirmId = null)}
												class="text-xs px-2 py-0.5 rounded bg-panel text-muted hover:text-foreground transition-colors cursor-pointer"
											>
												Annuler
											</button>
										</div>
									{:else}
										<button
											onclick={() => (confirmId = shader.id)}
											class="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded text-muted hover:text-red-400 hover:bg-red-950/40 transition-all cursor-pointer"
											title="Supprimer"
										>
											<Trash2 size={13} />
										</button>
									{/if}
								{/if}
							</div>
							{#if shader.description}
								<p class="text-xs text-muted line-clamp-2">{shader.description}</p>
							{/if}
							<p class="text-xs text-subtle mt-auto pt-1">{formatDate(shader.created)}</p>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
