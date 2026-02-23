<script lang="ts">
	import { login } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;
		try {
			await login(email, password);
			goto('/');
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Login failed. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-background">
	<div class="w-full max-w-sm px-8 py-10 bg-surface border border-border rounded-lg">
		<h1 class="text-xl font-semibold text-foreground mb-6 text-center">Login</h1>

		<form onsubmit={handleSubmit} class="flex flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<label for="email" class="text-sm text-muted">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
					autocomplete="email"
					class="px-3 py-2 rounded bg-panel border border-border text-foreground text-sm focus:outline-none focus:border-muted transition-colors"
					placeholder="you@example.com"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="password" class="text-sm text-muted">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
					class="px-3 py-2 rounded bg-panel border border-border text-foreground text-sm focus:outline-none focus:border-muted transition-colors"
					placeholder="••••••••"
				/>
			</div>

			{#if error}
				<p class="text-sm text-red-400">{error}</p>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="mt-1 px-4 py-2 rounded bg-panel border border-border text-foreground text-sm font-medium hover:bg-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{loading ? 'Logging in…' : 'Login'}
			</button>
		</form>

		<p class="mt-6 text-center text-sm text-muted">
			No account yet?
			<a href="/signup" class="text-foreground hover:underline ml-1">Sign up</a>
		</p>
	</div>
</div>
