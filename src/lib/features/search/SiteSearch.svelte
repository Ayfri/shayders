<script lang="ts" module>
	import type { SiteSearchResults } from '#features/search/search.js';

	const RESULT_CACHE_SIZE = 50;
	/** Shared by the desktop and mobile bars and kept across navigations, so retyping or deleting characters answers instantly. */
	const resultCache = new Map<string, SiteSearchResults>();
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CodeXml, CornerDownLeft, LoaderCircle, Search } from '@lucide/svelte';
	import UserAvatar from '#components/ui/UserAvatar.svelte';
	import ShaderPreview from '#features/shaders/preview/ShaderPreview.svelte';
	import SearchHighlight from '#features/search/SearchHighlight.svelte';
	import { buildSearchHref, normalizeSearchQuery, SEARCH_PREVIEW_MIN_QUERY_LENGTH } from '#features/search/search.js';
	import { getShaderPath, SITE_SEARCH_PATH } from '#lib/site.js';

	/** Mirrors the `/search` query, typing overrides it until the next navigation. */
	let query = $derived(page.url.pathname === SITE_SEARCH_PATH ? (page.url.searchParams.get('q') ?? '') : '');
	let error = $state('');
	let isFocused = $state(false);
	let isLoading = $state(false);
	/** Kept while the next query loads, so the list updates in place instead of flashing a spinner on every keystroke. */
	let results = $state.raw<SiteSearchResults | null>(null);

	let blurTimeout = 0;

	const normalizedQuery = $derived(normalizeSearchQuery(query));
	const showDropdown = $derived(
		isFocused && normalizedQuery.length >= SEARCH_PREVIEW_MIN_QUERY_LENGTH && (isLoading || error.length > 0 || results !== null),
	);

	/** Aborting the previous request on every rerun is what keeps a slow, stale response from overwriting a newer one. */
	$effect(() => {
		error = '';
		if (!isFocused || normalizedQuery.length < SEARCH_PREVIEW_MIN_QUERY_LENGTH) {
			isLoading = false;
			return;
		}

		const cacheKey = normalizedQuery.toLocaleLowerCase('en-US');
		const cached = resultCache.get(cacheKey);
		if (cached) {
			results = cached;
			isLoading = false;
			return;
		}

		const controller = new AbortController();
		isLoading = true;

		const timer = window.setTimeout(async () => {
			try {
				const response = await fetch(`/api/search?${new URLSearchParams({ q: normalizedQuery })}`, {
					headers: { accept: 'application/json' },
					signal: controller.signal,
				});
				if (!response.ok) throw new Error(`Search preview failed with HTTP ${response.status}.`);
				const fresh = (await response.json()) as SiteSearchResults;
				const oldestKey = resultCache.size >= RESULT_CACHE_SIZE ? resultCache.keys().next().value : undefined;
				if (oldestKey !== undefined) resultCache.delete(oldestKey);
				resultCache.set(cacheKey, fresh);
				results = fresh;
			} catch (err) {
				if (controller.signal.aborted) return;
				error = err instanceof Error ? err.message : 'Search preview failed.';
			}
			isLoading = false;
		}, 120);

		return () => {
			controller.abort();
			window.clearTimeout(timer);
		};
	});

	function setFocused(focused: boolean) {
		window.clearTimeout(blurTimeout);
		/** Blur waits a bit so a click on a result lands before the dropdown unmounts. */
		if (focused) isFocused = true;
		else blurTimeout = window.setTimeout(() => (isFocused = false), 120);
	}

	function closeDropdown() {
		window.clearTimeout(blurTimeout);
		isFocused = false;
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		closeDropdown();
		goto(buildSearchHref(query));
	}
</script>

{#snippet groupTitle(label: string)}
	<div class="px-3 pb-1 pt-3 font-mono text-10 font-medium uppercase tracking-[0.16em] text-subtle">{label}</div>
{/snippet}

{#snippet highlighted(text: string)}<SearchHighlight query={normalizedQuery} {text} />{/snippet}

<div class="relative">
	<form
		onsubmit={handleSubmit}
		class="group flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/90 px-2.5 py-1.5 transition-colors focus-within:border-accent/50"
	>
		<Search size={14} class="shrink-0 text-muted transition-colors group-focus-within:text-accent" />
		<input
			type="search"
			bind:value={query}
			placeholder="Search shaders or creators"
			aria-label="Search shaders or creators"
			class="min-w-0 flex-1 bg-transparent text-13 text-foreground outline-none placeholder:text-subtle"
			onfocus={() => setFocused(true)}
			onblur={() => setFocused(false)}
			onkeydown={(event) => event.key === 'Escape' && closeDropdown()}
		/>

		{#if isLoading}
			<LoaderCircle size={12} class="shrink-0 animate-spin text-muted" />
		{/if}
	</form>

	{#if showDropdown}
		<div class="absolute inset-x-0 top-[calc(100%+0.35rem)] z-40 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/50">
			{#if error}
				<div class="p-3 text-sm text-red-300">{error}</div>
			{:else if results && (results.shaders.length > 0 || results.users.length > 0)}
				<div class={['flex flex-col pb-1 transition-opacity', isLoading && 'opacity-60']}>
					{#if results.shaders.length > 0}
						{@render groupTitle('Shaders')}
						{#each results.shaders as shader (shader.id)}
							<a href={getShaderPath(shader.id)} class="mx-1 grid grid-cols-[64px_1fr] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-panel">
								<div class="aspect-video overflow-hidden rounded-md border border-border bg-black">
									{#if shader.buffers.length > 0}
										<ShaderPreview buffers={shader.buffers} channels={shader.channels} name={shader.name} />
									{:else}
										<div class="flex h-full items-center justify-center bg-linear-to-br from-panel via-background to-panel">
											<CodeXml size={14} class="text-muted opacity-40" />
										</div>
									{/if}
								</div>
								<div class="min-w-0">
									<p class="truncate text-13 font-medium text-foreground">{@render highlighted(shader.name)}</p>
									<p class="mt-1 truncate text-xs text-muted">by {@render highlighted(shader.authorName)}</p>
								</div>
							</a>
						{/each}
					{/if}

					{#if results.users.length > 0}
						{@render groupTitle('Creators')}
						{#each results.users as user (user.id)}
							<a href={user.profilePath} class="mx-1 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-panel">
								<UserAvatar src={user.avatarUrl} size={6} />
								<p class="min-w-0 truncate text-13 font-medium text-foreground">{@render highlighted(user.displayName)}</p>
							</a>
						{/each}
					{/if}
				</div>

				<a
					href={buildSearchHref(query)}
					class="flex items-center justify-between border-t border-border px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-panel"
				>
					<span>View all results</span>
					<kbd class="inline-flex items-center gap-1 rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-10 text-muted">
						<CornerDownLeft size={10} /> Enter
					</kbd>
				</a>
			{:else if isLoading}
				<div class="flex items-center gap-2 p-3 text-sm text-muted">
					<LoaderCircle size={12} class="animate-spin" />
					<span>Searching…</span>
				</div>
			{:else}
				<div class="p-3 text-sm text-muted">No results for "{normalizedQuery}".</div>
			{/if}
		</div>
	{/if}
</div>
