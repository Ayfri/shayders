<script lang="ts">
	import { ArrowRight, Search, Sparkles } from '@lucide/svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import Button from '#components/ui/Button.svelte';
	import EmptyState from '#components/ui/EmptyState.svelte';
	import UserAvatar from '#components/ui/UserAvatar.svelte';
	import SearchHighlight from '#features/search/SearchHighlight.svelte';
	import ShaderCard from '#features/shaders/preview/ShaderCard.svelte';
	import { buildSearchHref } from '#features/search/search.js';
	import { plural } from '#lib/format.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const EXAMPLE_QUERIES = ['water', 'noise', 'plasma', 'fractal', 'raymarch'];
</script>

<SeoHead
	title={data.hasQuery ? `Search results for "${data.query}" - Shayders` : 'Search - Shayders'}
	description={data.hasQuery
		? `Browse public shaders and creators matching "${data.query}" on Shayders.`
		: 'Search public shaders and creators by shader name or creator name on Shayders.'}
	robots={data.hasQuery ? 'noindex, follow' : undefined}
/>

{#snippet sectionHeader(title: string, shown: number, total: number)}
	<div class="mb-4 flex items-baseline justify-between gap-4">
		<h2 class="text-xl font-semibold text-white">{title} <span class="ml-1 text-sm font-normal text-subtle">{total}</span></h2>
		{#if total > shown}<p class="text-xs text-subtle">Top {shown}, refine the query to narrow it down</p>{/if}
	</div>
{/snippet}

{#snippet exampleChips()}
	{#each EXAMPLE_QUERIES as example (example)}
		<a
			href={buildSearchHref(example)}
			class="rounded-full border border-border bg-background/60 px-3 py-1 text-sm text-muted backdrop-blur transition-colors hover:border-accent/40 hover:text-accent"
		>
			{example}
		</a>
	{/each}
{/snippet}

<div class="min-h-full bg-background text-foreground">
	<section class="relative isolate overflow-hidden border-b border-border">
		<div class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_100%_at_50%_0%,--alpha(var(--color-accent)/14%),transparent_70%)]"></div>

		<div class="mx-auto max-w-3xl px-6 pb-10 pt-14 text-center lg:pt-20">
			<h1 class="text-3xl font-bold tracking-tight text-white sm:text-5xl">
				{#if data.hasQuery}Results for <span class="text-accent-light">"{data.query}"</span>{:else}Find shaders and creators{/if}
			</h1>
			<p class="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base">
				{#if data.hasQuery}
					{plural(data.totalShaders, 'shader')} and {plural(data.totalUsers, 'creator')} match your search.
				{:else}
					Search the public gallery by shader title or creator name.
				{/if}
			</p>

			<form method="GET" action="/search" class="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-xl border border-border bg-surface p-1.5 shadow-[0_12px_40px_-16px_--alpha(var(--color-accent)/40%)] transition-colors focus-within:border-accent/50">
				<Search size={18} class="ml-3 shrink-0 text-muted" />
				<input
					type="search"
					name="q"
					value={data.query}
					placeholder="Shader title or creator name"
					aria-label="Search by shader title or creator name"
					class="min-w-0 flex-1 bg-transparent px-1 py-2 text-base text-foreground outline-none placeholder:text-subtle"
				/>
				<Button type="submit" variant="primary" size="lg">Search</Button>
			</form>

			{#if !data.hasQuery}
				<div class="mt-6 flex flex-wrap items-center justify-center gap-2">
					<span class="flex items-center gap-1.5 text-xs text-subtle"><Sparkles size={12} /> Try</span>
					{@render exampleChips()}
				</div>
			{/if}
		</div>
	</section>

	<div class="mx-auto max-w-6xl px-6 py-10 lg:px-10">
		{#if !data.hasQuery}
			<p class="text-center text-sm text-muted">
				The search bar in the header gives live suggestions from any page.
				<a href="/#gallery" class="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent-light">
					Or browse the gallery <ArrowRight size={13} />
				</a>
			</p>
		{:else if data.shaders.length === 0 && data.users.length === 0}
			<EmptyState icon={Search} title={`Nothing matches "${data.query}".`}>
				Try a shorter or different word, search matches anywhere in shader titles and creator names.
				<div class="mt-2 flex flex-wrap justify-center gap-2">{@render exampleChips()}</div>
			</EmptyState>
		{:else}
			<div class="flex flex-col gap-12">
				{#if data.users.length > 0}
					<section>
						{@render sectionHeader('Creators', data.users.length, data.totalUsers)}
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
							{#each data.users as user (user.id)}
								<a
									href={user.profilePath}
									class="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-all hover:-translate-y-0.5 hover:border-accent/40"
								>
									<UserAvatar src={user.avatarUrl} size={12} />
									<span class="min-w-0 flex-1 truncate font-medium text-foreground">
										<SearchHighlight query={data.query} text={user.displayName} />
									</span>
									<ArrowRight size={14} class="shrink-0 text-subtle transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
								</a>
							{/each}
						</div>
					</section>
				{/if}

				{#if data.shaders.length > 0}
					<section>
						{@render sectionHeader('Shaders', data.shaders.length, data.totalShaders)}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{#each data.shaders as shader (shader.id)}
								<ShaderCard {shader} author={{ href: shader.authorProfilePath, name: shader.authorName }} />
							{/each}
						</div>
					</section>
				{/if}
			</div>
		{/if}
	</div>
</div>
