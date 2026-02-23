<script lang="ts">
	import { Home, LogIn, LogOut, User, UserPlus } from '@lucide/svelte';
	import { auth, logout } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';

	function handleLogout() {
		logout();
		goto('/login');
	}
</script>

<header class="flex items-center justify-between px-4 h-12 bg-surface border-b border-border shrink-0">
	<a href="/" class="flex items-center gap-2 text-foreground hover:text-white transition-colors font-semibold tracking-wide">
		<Home size={18} />
		<span>Shayders</span>
	</a>

	<nav class="flex items-center gap-4 text-sm">
		{#if auth.isLoggedIn}
			<span class="flex items-center gap-1.5 text-muted">
				<User size={15} />
				{auth.user?.name || auth.user?.email}
			</span>
			<button
				onclick={handleLogout}
				class="flex items-center gap-1.5 px-3 py-1 rounded text-red-400 hover:text-red-300 border border-red-current/50 bg-red-950/30 transition-colors cursor-pointer"
			>
				<LogOut size={14} />
				Logout
			</button>
		{:else}
			<a
				href="/login"
				class="flex items-center gap-1.5 px-3 py-1 rounded text-muted hover:text-foreground hover:bg-panel transition-colors"
			>
				<LogIn size={14} />
				Login
			</a>
			<a
				href="/signup"
				class="flex items-center gap-1.5 px-3 py-1 rounded bg-panel text-cyan-300 hover:bg-cyan-200/10 transition-colors"
			>
				<UserPlus size={14} />
				Sign up
			</a>
		{/if}
	</nav>
</header>
