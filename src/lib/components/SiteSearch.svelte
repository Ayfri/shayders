<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LoaderCircle, Search, User } from '@lucide/svelte';
	import ShaderPreview from '$lib/components/ShaderPreview.svelte';
	import {
		buildSearchHref,
		SEARCH_PREVIEW_MIN_QUERY_LENGTH,
		normalizeSearchQuery,
		type SiteSearchResults,
	} from '$lib/search';

	let query = $state(page.url.pathname === '/search' ? (page.url.searchParams.get('q') ?? '') : '');
	let error = $state('');
	let isFocused = $state(false);
	let isLoading = $state(false);
	let results = $state<SiteSearchResults | null>(null);

	let blurTimeout = 0;
	let requestToken = 0;

	const normalizedQuery = $derived(normalizeSearchQuery(query));
	const showDropdown = $derived.by(() => (
		isFocused
		&& normalizedQuery.length >= SEARCH_PREVIEW_MIN_QUERY_LENGTH
		&& (isLoading || error.length > 0 || results !== null)
	));

	$effect(() => {
		if (page.url.pathname === '/search') {
			query = page.url.searchParams.get('q') ?? '';
		}
	});

	$effect(() => {
		if (!isFocused || normalizedQuery.length < SEARCH_PREVIEW_MIN_QUERY_LENGTH) {
			results = null;
			error = '';
			isLoading = false;
			return;
		}

		const currentRequest = ++requestToken;
		const controller = new AbortController();
		isLoading = true;
		results = null;
		error = '';

		const timer = window.setTimeout(async () => {
			try {
				const response = await fetch(`/api/search?q=${encodeURIComponent(normalizedQuery)}`, {
					headers: {
						accept: 'application/json',
					},
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error(`Search preview failed with HTTP ${response.status}.`);
				}

				const payload = (await response.json()) as SiteSearchResults;
				if (currentRequest !== requestToken) {
					return;
				}

				results = payload;
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') {
					return;
				}

				if (currentRequest !== requestToken) {
					return;
				}

				error = err instanceof Error ? err.message : 'Search preview failed.';
				results = null;
			} finally {
				if (currentRequest === requestToken) {
					isLoading = false;
				}
			}
		}, 180);

		return () => {
			controller.abort();
			window.clearTimeout(timer);
		};
	});

	function clearBlurTimeout() {
		window.clearTimeout(blurTimeout);
	}

	function closeDropdown() {
		clearBlurTimeout();
		isFocused = false;
	}

	function handleBlur() {
		clearBlurTimeout();
		blurTimeout = window.setTimeout(() => {
			isFocused = false;
		}, 120);
	}

	function handleFocus() {
		clearBlurTimeout();
		isFocused = true;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeDropdown();
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		closeDropdown();
		goto(buildSearchHref(query));
	}

	function formatUserHandle(username: string, fallbackId: string) {
		return username ? `@${username}` : fallbackId;
	}
</script>

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
			class="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle"
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeydown}
		/>

		{#if isLoading}
			<LoaderCircle size={12} class="shrink-0 animate-spin text-muted" />
		{/if}
	</form>

	{#if showDropdown}
		<div class="absolute inset-x-0 top-[calc(100%+0.35rem)] z-40 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
			{#if error}
				<div class="px-3 py-3 text-sm text-red-300">{error}</div>
			{:else if isLoading}
				<div class="flex items-center gap-2 px-3 py-3 text-sm text-muted">
					<LoaderCircle size={12} class="animate-spin" />
					<span>Loading suggestions...</span>
				</div>
			{:else if results && (results.shaders.length > 0 || results.users.length > 0)}
				<div class="flex flex-col">
					{#if results.shaders.length > 0}
						<div class="border-b border-border px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle first:border-t-0">
							Shaders
						</div>
						{#each results.shaders as shader (shader.id)}
							<a
								href="/shader/{shader.id}"
								class="grid grid-cols-[60px,1fr] gap-2.5 px-3 py-2.5 transition-colors hover:bg-panel"
							>
								<div class="h-12 overflow-hidden rounded-md border border-border bg-black">
									{#if shader.buffers.length > 0}
										<ShaderPreview
											buffers={shader.buffers}
											channels={shader.channels}
											shaderId={shader.id}
											name={shader.name}
										/>
									{:else}
										<div class="flex h-full items-center justify-center bg-linear-to-br from-panel via-background to-panel">
											<Search size={14} class="text-muted opacity-40" />
										</div>
									{/if}
								</div>
								<div class="min-w-0">
									<p class="truncate text-[13px] font-medium text-foreground">{shader.name}</p>
									<p class="mt-1 truncate text-xs text-muted">by {shader.authorName}</p>
									<p class="mt-1 truncate text-xs text-subtle">
										{shader.description || formatUserHandle(shader.authorUsername, shader.authorId)}
									</p>
								</div>
							</a>
						{/each}
					{/if}

					{#if results.users.length > 0}
						<div class="border-b border-t border-border px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">
							Creators
						</div>
						{#each results.users as user (user.id)}
							<a
								href={user.profilePath}
								class="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-panel"
							>
								{#if user.avatarUrl}
									<img src={user.avatarUrl} alt="" class="size-9 rounded-full border border-border object-cover" />
								{:else}
									<div class="flex size-9 items-center justify-center rounded-full border border-border bg-panel text-muted">
										<User size={14} />
									</div>
								{/if}
								<div class="min-w-0">
									<p class="truncate text-[13px] font-medium text-foreground">{user.displayName}</p>
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
				<div class="px-3 py-3 text-sm text-muted">
					No live results for "{normalizedQuery}".
				</div>
			{/if}
		</div>
	{/if}
</div>
