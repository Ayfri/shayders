<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LoaderCircle, Search } from '@lucide/svelte';
	import UserAvatar from '#components/ui/UserAvatar.svelte';
	import ShaderPreview from '#features/shaders/preview/ShaderPreview.svelte';
	import {
		buildSearchHref,
		normalizeSearchQuery,
		SEARCH_PREVIEW_MIN_QUERY_LENGTH,
		type SiteSearchResults,
	} from '#features/search/search.js';
	import { formatUserHandle } from '#lib/format.js';
	import { getShaderPath, SITE_SEARCH_PATH } from '#lib/site.js';

	/** Mirrors the `/search` query, typing overrides it until the next navigation. */
	let query = $derived(page.url.pathname === SITE_SEARCH_PATH ? (page.url.searchParams.get('q') ?? '') : '');
	let error = $state('');
	let isFocused = $state(false);
	let isLoading = $state(false);
	let results = $state.raw<SiteSearchResults | null>(null);

	let blurTimeout = 0;

	const normalizedQuery = $derived(normalizeSearchQuery(query));
	const showDropdown = $derived(
		isFocused && normalizedQuery.length >= SEARCH_PREVIEW_MIN_QUERY_LENGTH && (isLoading || error.length > 0 || results !== null),
	);

	/** Aborting the previous request on every rerun is what keeps a slow, stale response from overwriting a newer one. */
	$effect(() => {
		results = null;
		error = '';
		if (!isFocused || normalizedQuery.length < SEARCH_PREVIEW_MIN_QUERY_LENGTH) {
			isLoading = false;
			return;
		}

		const controller = new AbortController();
		isLoading = true;

		const timer = window.setTimeout(async () => {
			try {
				const response = await fetch(`/api/search?q=${encodeURIComponent(normalizedQuery)}`, {
					headers: { accept: 'application/json' },
					signal: controller.signal,
				});
				if (!response.ok) throw new Error(`Search preview failed with HTTP ${response.status}.`);
				results = (await response.json()) as SiteSearchResults;
			} catch (err) {
				if (controller.signal.aborted) return;
				error = err instanceof Error ? err.message : 'Search preview failed.';
			}
			isLoading = false;
		}, 180);

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
	<div class="border-y border-border px-3 py-2 font-mono text-10 font-medium uppercase tracking-[0.16em] text-subtle first:border-t-0">{label}</div>
{/snippet}

<div class="relative">
	<form
		onsubmit={handleSubmit}
		class="group flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/90 px-2.5 py-1.5 transition-colors focus-within:border-subtle"
	>
		<Search size={14} class="shrink-0 text-muted transition-colors group-focus-within:text-foreground" />
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
		<div class="absolute inset-x-0 top-[calc(100%+0.35rem)] z-40 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
			{#if error}
				<div class="p-3 text-sm text-red-300">{error}</div>
			{:else if isLoading}
				<div class="flex items-center gap-2 p-3 text-sm text-muted">
					<LoaderCircle size={12} class="animate-spin" />
					<span>Loading suggestions…</span>
				</div>
			{:else if results && (results.shaders.length > 0 || results.users.length > 0)}
				<div class="flex flex-col">
					{#if results.shaders.length > 0}
						{@render groupTitle('Shaders')}
						{#each results.shaders as shader (shader.id)}
							<a href={getShaderPath(shader.id)} class="grid grid-cols-[60px_1fr] gap-2.5 px-3 py-2.5 transition-colors hover:bg-panel">
								<div class="h-12 overflow-hidden rounded-md border border-border bg-black">
									{#if shader.buffers.length > 0}
										<ShaderPreview buffers={shader.buffers} channels={shader.channels} name={shader.name} />
									{:else}
										<div class="flex h-full items-center justify-center bg-linear-to-br from-panel via-background to-panel">
											<Search size={14} class="text-muted opacity-40" />
										</div>
									{/if}
								</div>
								<div class="min-w-0">
									<p class="truncate text-13 font-medium text-foreground">{shader.name}</p>
									<p class="mt-1 truncate text-xs text-muted">by {shader.authorName}</p>
									<p class="mt-1 truncate text-xs text-subtle">
										{shader.description || formatUserHandle(shader.authorUsername, shader.authorId)}
									</p>
								</div>
							</a>
						{/each}
					{/if}

					{#if results.users.length > 0}
						{@render groupTitle('Creators')}
						{#each results.users as user (user.id)}
							<a href={user.profilePath} class="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-panel">
								<UserAvatar src={user.avatarUrl} class="size-9" />
								<div class="min-w-0">
									<p class="truncate text-13 font-medium text-foreground">{user.displayName}</p>
									<p class="mt-1 truncate text-xs text-muted">{formatUserHandle(user.username, user.id)}</p>
								</div>
							</a>
						{/each}
					{/if}

					<a
						href={buildSearchHref(query)}
						class="flex items-center justify-between border-t border-border px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-panel"
					>
						<span>View all results</span>
						<span class="text-xs text-muted">Enter</span>
					</a>
				</div>
			{:else}
				<div class="p-3 text-sm text-muted">No live results for "{normalizedQuery}".</div>
			{/if}
		</div>
	{/if}
</div>
