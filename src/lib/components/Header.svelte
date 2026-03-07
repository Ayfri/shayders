<script lang="ts">
	import { goto } from '$app/navigation';
	import { LogIn, LogOut, User, UserPlus } from '@lucide/svelte';
	import type { AuthUser } from '$lib/auth-shared';
	import { auth, logout } from '$lib/auth.svelte';
	import logo from '$lib/assets/logo.png';
	import SiteSearch from '$lib/components/SiteSearch.svelte';
	import { pb } from '$lib/pocketbase';
	import { getUserProfilePath } from '$lib/site';

	interface Props {
		sessionUser?: AuthUser | null;
	}

	let { sessionUser = null }: Props = $props();

	const currentUser = $derived(auth.user ?? sessionUser);
	const isLoggedIn = $derived(currentUser !== null);

	function handleLogout() {
		logout();
		goto('/login');
	}
</script>

<header class="shrink-0 border-b border-border bg-surface">
	<div class="px-4 py-1.5 sm:px-6">
		<div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
			<div class="flex items-center gap-4 sm:gap-10">
				<a href="/" class="flex items-center gap-2 font-semibold tracking-wide text-foreground transition-colors hover:text-white">
					<img src={logo} alt="Shayders Logo" class="size-6" />
					<span>Shayders</span>
				</a>
				<nav class="flex items-center gap-2 sm:gap-4">
					<a
						href="/new"
						class="flex items-center gap-1.5 rounded px-5 py-1 text-foreground transition-colors hover:bg-panel"
					>
						New
					</a>
				</nav>
			</div>

			<div class="flex flex-col gap-12 sm:flex-row sm:items-center xl:flex-1 xl:justify-end">
				<div class="w-full sm:max-w-xs xl:max-w-sm">
					<SiteSearch />
				</div>

				<nav class="flex min-w-0 items-center gap-2 text-sm sm:shrink-0 sm:gap-4">
					{#if isLoggedIn}
						<a
							href={currentUser ? getUserProfilePath(currentUser.id) : '/'}
							class="flex min-w-0 items-center gap-1.5 text-muted transition-colors hover:text-foreground"
						>
							{#if currentUser?.avatar}
								<img
									src={`${pb.baseURL}/api/files/users/${currentUser.id}/${currentUser.avatar}`}
									alt=""
									class="size-6 rounded-full object-cover"
								/>
							{:else}
								<User size={15} />
							{/if}
							<span class="truncate">{currentUser?.name || currentUser?.username}</span>
						</a>
						<button
							onclick={handleLogout}
							class="flex items-center gap-1.5 rounded border border-red-current/50 bg-red-950/30 px-2 py-1 text-red-400 transition-colors hover:text-red-300 cursor-pointer sm:px-3"
						>
							<LogOut size={14} />
							Logout
						</button>
					{:else}
						<a
							href="/login"
							class="flex items-center gap-1.5 rounded px-2 py-1 text-muted transition-colors hover:bg-panel hover:text-foreground sm:px-3"
						>
							<LogIn size={14} />
							Login
						</a>
						<a
							href="/signup"
							class="flex items-center gap-1.5 rounded bg-panel px-2 py-1 text-cyan-300 transition-colors hover:bg-cyan-200/10 sm:px-3"
						>
							<UserPlus size={14} />
							Sign up
						</a>
					{/if}
				</nav>
			</div>
		</div>
	</div>
</header>
