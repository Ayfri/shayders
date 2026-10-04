<script lang="ts">
	import { Search } from '@lucide/svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import EmptyState from '#components/ui/EmptyState.svelte';
	import UserAvatar from '#components/ui/UserAvatar.svelte';
	import ShaderCard from '#features/shaders/preview/ShaderCard.svelte';
	import { buildSearchHref } from '#features/search/search.js';
	import { formatUserHandle, plural } from '#lib/format.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const EXAMPLE_QUERIES = ['water', 'noise', 'plasma', 'ayfri'];
</script>

<SeoHead
	title={data.hasQuery ? `Search results for "${data.query}" - Shayders` : 'Search - Shayders'}
	description={data.hasQuery
		? `Browse public shaders and creators matching "${data.query}" on Shayders.`
		: 'Search public shaders and creators by shader name or username on Shayders.'}
	robots={data.hasQuery ? 'noindex, follow' : undefined}
/>

{#snippet sectionHeader(title: string, subtitle: string, shown: number, total: number)}
	<div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-xl font-semibold text-foreground">{title}</h2>
			<p class="text-sm text-muted">{subtitle}</p>
		</div>
		<p class="text-xs text-subtle">Showing {shown} of {total}</p>
	</div>
{/snippet}

<div class="min-h-full bg-background p-6 text-foreground lg:p-10">
	<div class="mx-auto max-w-6xl">
		<section class="mb-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
			<p class="font-mono text-11 uppercase tracking-[0.2em] text-subtle">Site search</p>
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
						aria-label="Search by shader name or username"
						class="w-full rounded-lg border border-border bg-background px-12 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-subtle focus:border-accent/50"
					/>
				</label>
				<button
					type="submit"
					class="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-accent-light"
				>
					Search
				</button>
			</form>

			<div class="mt-4 flex flex-wrap gap-2 text-sm text-muted">
				{#if data.hasQuery}
					<span class="rounded-full border border-border bg-panel px-3 py-1">{plural(data.totalShaders, 'shader')}</span>
					<span class="rounded-full border border-border bg-panel px-3 py-1">{plural(data.totalUsers, 'creator')}</span>
				{:else}
					{#each EXAMPLE_QUERIES as example (example)}
						<a href={buildSearchHref(example)} class="rounded-full border border-border bg-panel px-3 py-1 transition-colors hover:bg-background hover:text-foreground">
							Try "{example}"
						</a>
					{/each}
				{/if}
			</div>
		</section>

		{#if !data.hasQuery}
			<section class="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
				<p class="text-base font-medium text-foreground">Start with a shader title or a creator handle.</p>
				<p class="mt-2 max-w-2xl leading-6">
					The search page matches shader names, creator names, and usernames. Use the header search bar for live suggestions anywhere on the site.
				</p>
			</section>
		{:else if data.shaders.length === 0 && data.users.length === 0}
			<EmptyState icon={Search} title={`No results for "${data.query}".`}>
				Try a shorter shader name, a creator display name, or a username without punctuation.
			</EmptyState>
		{:else}
			<div class="flex flex-col gap-8">
				{#if data.users.length > 0}
					<section>
						{@render sectionHeader('Creators', 'Matched by display name or username.', data.users.length, data.totalUsers)}
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.users as user (user.id)}
								<a
									href={user.profilePath}
									class="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-subtle hover:bg-panel"
								>
									<UserAvatar src={user.avatarUrl} class="size-12" />
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
						{@render sectionHeader('Shaders', 'Matched by shader title or creator identity.', data.shaders.length, data.totalShaders)}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.shaders as shader (shader.id)}
								<ShaderCard
									{shader}
									author={{ href: shader.authorProfilePath, name: shader.authorName }}
									fallbackDescription={formatUserHandle(shader.authorUsername, shader.authorId)}
								/>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		{/if}
	</div>
</div>
