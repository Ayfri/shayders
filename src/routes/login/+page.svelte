<script lang="ts">
	import { login } from '$lib/auth.svelte';
	import { LogIn, Home } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import SeoHead from '$lib/components/SeoHead.svelte';

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

<SeoHead
	title="Login - Shayders"
	description="Sign in to your Shayders account to create and share GLSL shaders."
/>

<div class="min-h-screen flex flex-col items-center justify-center bg-background">
	<div class="w-full max-w-sm px-8 py-10 bg-surface border border-border rounded-lg shadow-lg">
		<div class="flex items-center justify-center gap-2 mb-6">
			<h1 class="text-2xl font-semibold text-foreground">Welcome back</h1>
		</div>

		<form onsubmit={handleSubmit} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<label for="email" class="text-sm font-medium text-muted">Email address</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
					autocomplete="email"
					class="px-3 py-2.5 rounded bg-panel border border-border text-foreground text-sm focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
					placeholder="you@example.com"
				/>
			</div>

			<div class="flex flex-col gap-2">
				<label for="password" class="text-sm font-medium text-muted">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
					class="px-3 py-2.5 rounded bg-panel border border-border text-foreground text-sm focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
					placeholder="••••••••"
				/>
			</div>

			{#if error}
				<div class="px-3 py-2 rounded bg-red-950/30 border border-red-700/50 text-red-300 text-sm">{error}</div>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="mt-2 px-4 py-2.5 rounded font-medium text-white bg-linear-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 border border-cyan-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
			>
				<span class="flex items-center justify-center gap-2">
					<LogIn size={16} />
					{loading ? 'Signing in…' : 'Sign in'}
				</span>
			</button>
		</form>

		<p class="mt-6 text-center text-sm text-muted">
			No account yet?
			<a href="/signup" class="text-cyan-300 hover:text-white font-medium transition-colors">Create one</a>
		</p>
	</div>
</div>
