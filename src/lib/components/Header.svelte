<script lang="ts">
	import { Home, LogIn, LogOut, Plus, User, UserPlus } from '@lucide/svelte';
	import { auth, logout } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import logo from '$lib/assets/logo.png';

	function handleLogout() {
		logout();
		goto('/login');
	}
</script>

<header class="flex items-center justify-between px-4 sm:px-6 h-12 bg-surface border-b border-border shrink-0">
	<div class="flex items-center gap-4 sm:gap-10">
		<a href="/" class="flex items-center gap-2 text-foreground hover:text-white transition-colors font-semibold tracking-wide">
			<img src={logo} alt="Shayders Logo" class="size-6" />
			<span>Shayders</span>
		</a>
		<nav class="flex items-center gap-2 sm:gap-4">
			<a
				href="/new"
				class="flex items-center gap-1.5 px-5 py-1 rounded text-foreground hover:bg-panel transition-colors"
			>
				New
			</a>
		</nav>
	</div>

	<nav class="flex items-center gap-2 sm:gap-4 text-sm">
		{#if auth.isLoggedIn}
			<a
				href="/users/{auth.user?.id}"
				class="flex items-center gap-1.5 text-muted hover:text-foreground transition-colors"
			>
				<User size={15} />
				{auth.user?.name || auth.user?.username}
			</a>
			<button
				onclick={handleLogout}
				class="flex items-center gap-1.5 px-2 py-1 sm:px-3 rounded text-red-400 hover:text-red-300 border border-red-current/50 bg-red-950/30 transition-colors cursor-pointer"
			>
				<LogOut size={14} />
				Logout
			</button>
		{:else}
			<a
				href="/login"
				class="flex items-center gap-1.5 px-2 py-1 sm:px-3 rounded text-muted hover:text-foreground hover:bg-panel transition-colors"
			>
				<LogIn size={14} />
				Login
			</a>
			<a
				href="/signup"
				class="flex items-center gap-1.5 px-2 py-1 sm:px-3 rounded bg-panel text-cyan-300 hover:bg-cyan-200/10 transition-colors"
			>
				<UserPlus size={14} />
				Sign up
			</a>
		{/if}
	</nav>
</header>
