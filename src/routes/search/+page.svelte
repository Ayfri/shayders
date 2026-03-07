<script lang="ts">
	import { CodeXml, Search, User } from '@lucide/svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import ShaderPreview from '$lib/components/ShaderPreview.svelte';
	import { buildSearchHref } from '$lib/search';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const exampleQueries = ['water', 'noise', 'plasma', 'ayfri'];

	const title = $derived(
		data.hasQuery
			? `Search results for "${data.query}" - Shayders`
			: 'Search - Shayders',
	);
	const description = $derived(
		data.hasQuery
			? `Browse public shaders and creators matching "${data.query}" on Shayders.`
			: 'Search public shaders and creators by shader name or username on Shayders.',
	);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}

	function formatUserHandle(username: string, fallbackId: string) {
		return username ? `@${username}` : fallbackId;
	}
</script>

<SeoHead
	{title}
	{description}
	robots={data.hasQuery ? 'noindex,follow' : undefined}
/>

<div class="min-h-full bg-background p-6 text-foreground lg:p-10">
	<div class="mx-auto max-w-6xl">
		<section class="mb-8 rounded-2xl border border-border bg-surface p-5 sm:p-6">
			<p class="text-xs uppercase tracking-[0.24em] text-subtle">Site search</p>
			<h1 class="mt-3 text-3xl font-bold text-foreground sm:text-4xl">Find shaders and creators</h1>
			<p class="mt-3 max-w-2xl text-sm leading-6 text-muted">
				Search public shaders by title, or jump to creators by display name and username.
			</p>

			<form method="GET" action="/search" class="mt-6 flex flex-col gap-3 sm:flex-row">
				<label class="relative flex-1">
					<Search size={18} class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
					<input
						type="search"
						name="q"
						value={data.query}
						placeholder="Search by shader name or username"
						class="w-full rounded-xl border border-border bg-background px-12 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-subtle focus:border-subtle"
					/>
				</label>
				<button
					type="submit"
					class="inline-flex items-center justify-center rounded-xl border border-border bg-panel px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-background"
				>
					Search
				</button>
			</form>

			{#if data.hasQuery}
				<div class="mt-4 flex flex-wrap gap-2 text-sm text-muted">
					<span class="rounded-full border border-border bg-panel px-3 py-1">
						{data.totalShaders} shader{data.totalShaders !== 1 ? 's' : ''}
					</span>
					<span class="rounded-full border border-border bg-panel px-3 py-1">
						{data.totalUsers} creator{data.totalUsers !== 1 ? 's' : ''}
					</span>
				</div>
			{:else}
				<div class="mt-4 flex flex-wrap gap-2 text-sm text-muted">
					{#each exampleQueries as example (example)}
						<a
							href={buildSearchHref(example)}
							class="rounded-full border border-border bg-panel px-3 py-1 transition-colors hover:bg-background hover:text-foreground"
						>
							Try "{example}"
						</a>
					{/each}
				</div>
			{/if}
		</section>

		{#if !data.hasQuery}
			<section class="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
				<p class="text-base font-medium text-foreground">Start with a shader title or a creator handle.</p>
				<p class="mt-2 max-w-2xl leading-6">
					The search page matches shader names, creator names, and usernames. Use the header search bar for live suggestions anywhere on the site.
				</p>
			</section>
		{:else if data.shaders.length === 0 && data.users.length === 0}
			<section class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-6 py-20 text-center text-muted">
				<Search size={42} class="opacity-35" />
				<p class="text-base text-foreground">No results for "{data.query}".</p>
				<p class="max-w-md text-sm leading-6 text-muted">
					Try a shorter shader name, a creator display name, or a username without punctuation.
				</p>
			</section>
		{:else}
			<div class="flex flex-col gap-8">
				{#if data.users.length > 0}
					<section>
						<div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<h2 class="text-xl font-semibold text-foreground">Creators</h2>
								<p class="text-sm text-muted">Matched by display name or username.</p>
							</div>
							<p class="text-xs text-subtle">
								Showing {data.users.length} of {data.totalUsers}
							</p>
						</div>

						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.users as user (user.id)}
								<a
									href={user.profilePath}
									class="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-4 transition-colors hover:border-subtle hover:bg-panel"
								>
									{#if user.avatarUrl}
										<img src={user.avatarUrl} alt="" class="size-12 rounded-full border border-border object-cover" />
									{:else}
										<div class="flex size-12 items-center justify-center rounded-full border border-border bg-panel text-muted">
											<User size={18} />
										</div>
									{/if}

									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-foreground">{user.displayName}</p>
										<p class="mt-1 truncate text-xs text-muted">{formatUserHandle(user.username, user.id)}</p>
									</div>
								</a>
							{/each}
						</div>
					</section>
				{/if}

				{#if data.shaders.length > 0}
					<section>
						<div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<h2 class="text-xl font-semibold text-foreground">Shaders</h2>
								<p class="text-sm text-muted">Matched by shader title or creator identity.</p>
							</div>
							<p class="text-xs text-subtle">
								Showing {data.shaders.length} of {data.totalShaders}
							</p>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.shaders as shader (shader.id)}
								<div class="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-subtle">
									<a href="/shader/{shader.id}" class="block h-40 overflow-hidden bg-black">
										{#if shader.buffers.length > 0}
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

									<div class="flex flex-1 flex-col gap-2 p-4">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<a href="/shader/{shader.id}" class="block truncate text-sm font-medium text-foreground transition-colors hover:text-white">
													{shader.name}
												</a>
												<a href={shader.authorProfilePath} class="mt-1 inline-flex text-xs text-muted transition-colors hover:text-foreground">
													by {shader.authorName}
												</a>
											</div>
											<span class="shrink-0 whitespace-nowrap text-xs text-subtle">{formatDate(shader.created)}</span>
										</div>

										{#if shader.description}
											<p class="line-clamp-2 text-xs leading-5 text-muted">{shader.description}</p>
										{:else}
											<p class="text-xs leading-5 text-subtle">{formatUserHandle(shader.authorUsername, shader.authorId)}</p>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		{/if}
	</div>
</div>
