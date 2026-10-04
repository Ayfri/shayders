<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LogOut, Plus, Search, X } from '@lucide/svelte';
	import type { AuthUser } from '#features/auth/auth-shared.js';
	import { auth, logout } from '#features/auth/auth-client.svelte.js';
	import logo from '#lib/assets/logo.png';
	import UserAvatar from '#components/ui/UserAvatar.svelte';
	import SiteSearch from '#features/search/SiteSearch.svelte';
	import { getAvatarUrl } from '#lib/pocketbase.js';
	import { getUserProfilePath } from '#lib/site.js';

	interface Props {
		sessionUser?: AuthUser | null;
	}

	let { sessionUser = null }: Props = $props();

	let searchOpen = $state(false);

	const currentUser = $derived(auth.user ?? sessionUser);
	const isEditor = $derived(page.url.pathname === '/new');

	afterNavigate(() => (searchOpen = false));

	function handleLogout() {
		logout();
		goto('/login');
	}
</script>

<header class="shrink-0 border-b border-border bg-surface">
	<div class="flex h-12 items-center gap-2 px-3 sm:gap-4 sm:px-6">
		<a href="/" class="flex shrink-0 items-center gap-2 font-semibold tracking-wide text-foreground transition-colors hover:text-white">
			<img src={logo} alt="Shayders Logo" class="size-6" />
			<span class="hidden min-[400px]:inline">Shayders</span>
		</a>

		<nav class="flex items-center gap-1 text-sm sm:ml-4">
			<a href="/#gallery" class="hidden rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-panel hover:text-foreground sm:block">Gallery</a>
			<a
				href="/new"
				aria-current={isEditor ? 'page' : undefined}
				class={[
					'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-accent transition-colors',
					isEditor ? 'border-accent/60 bg-accent/15' : 'border-accent/30 hover:bg-accent/10',
				]}
			>
				<Plus size={14} />
				New<span class="hidden sm:inline">&nbsp;shader</span>
			</a>
		</nav>

		<div class="ml-auto hidden w-full max-w-sm md:block">
			<SiteSearch />
		</div>

		<button
			onclick={() => (searchOpen = !searchOpen)}
			aria-label={searchOpen ? 'Close search' : 'Search'}
			aria-expanded={searchOpen}
			class="ml-auto flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel hover:text-foreground md:hidden"
		>
			{#if searchOpen}<X size={16} />{:else}<Search size={16} />{/if}
		</button>

		<nav class="flex min-w-0 shrink-0 items-center gap-1 text-sm">
			{#if currentUser}
				<a
					href={getUserProfilePath(currentUser.id)}
					class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-muted transition-colors hover:bg-panel hover:text-foreground"
				>
					<UserAvatar src={getAvatarUrl(currentUser)} class="size-6" />
					<span class="hidden max-w-32 truncate sm:inline">{currentUser.name || currentUser.username}</span>
				</a>
				<button
					onclick={handleLogout}
					aria-label="Logout"
					title="Logout"
					class="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-red-950/40 hover:text-red-400"
				>
					<LogOut size={15} />
				</button>
			{:else}
				<a href="/login" class="rounded-md px-2.5 py-1 text-muted transition-colors hover:bg-panel hover:text-foreground">Login</a>
				<a href="/signup" class="rounded-md bg-accent px-2.5 py-1 font-medium text-background transition-colors hover:bg-accent-light">Sign up</a>
			{/if}
		</nav>
	</div>

	{#if searchOpen}
		<div {@attach (element) => element.querySelector('input')?.focus()} class="border-t border-border px-3 py-2 md:hidden">
			<SiteSearch />
		</div>
	{/if}
</header>
