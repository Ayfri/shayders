<script lang="ts">
	import { Home, LogOut, User } from '@lucide/svelte';
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

	<nav class="flex items-center gap-3 text-sm">
		{#if auth.isLoggedIn}
			<span class="flex items-center gap-1.5 text-muted">
				<User size={15} />
				{auth.user?.name || auth.user?.email}
			</span>
			<button
				onclick={handleLogout}
				class="flex items-center gap-1.5 px-3 py-1 rounded text-muted hover:text-foreground hover:bg-panel transition-colors"
			>
				<LogOut size={14} />
				Logout
			</button>
		{:else}
			<a
				href="/login"
				class="px-3 py-1 rounded text-muted hover:text-foreground hover:bg-panel transition-colors"
			>
				Login
			</a>
			<a
				href="/signup"
				class="px-3 py-1 rounded bg-panel text-foreground hover:bg-border transition-colors"
			>
				Sign up
			</a>
		{/if}
	</nav>
</header>
