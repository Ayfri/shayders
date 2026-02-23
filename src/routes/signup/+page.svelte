<script lang="ts">
	import { signup } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';

	let email = $state('');
	let name = $state('');
	let password = $state('');
	let passwordConfirm = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (password !== passwordConfirm) {
			error = 'Passwords do not match.';
			return;
		}
		loading = true;
		try {
			await signup(email, name, password, passwordConfirm);
			goto('/');
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Sign up failed. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-background">
	<div class="w-full max-w-sm px-8 py-10 bg-surface border border-border rounded-lg">
		<h1 class="text-xl font-semibold text-foreground mb-6 text-center">Sign up</h1>

		<form onsubmit={handleSubmit} class="flex flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<label for="name" class="text-sm text-muted">Username</label>
				<input
					id="name"
					type="text"
					bind:value={name}
					required
					autocomplete="username"
					class="px-3 py-2 rounded bg-panel border border-border text-foreground text-sm focus:outline-none focus:border-muted transition-colors"
					placeholder="your_name"
				/>
			</div>

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
					autocomplete="new-password"
					class="px-3 py-2 rounded bg-panel border border-border text-foreground text-sm focus:outline-none focus:border-muted transition-colors"
					placeholder="••••••••"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="password-confirm" class="text-sm text-muted">Confirm password</label>
				<input
					id="password-confirm"
					type="password"
					bind:value={passwordConfirm}
					required
					autocomplete="new-password"
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
				{loading ? 'Creating account…' : 'Create account'}
			</button>
		</form>

		<p class="mt-6 text-center text-sm text-muted">
			Already have an account?
			<a href="/login" class="text-foreground hover:underline ml-1">Login</a>
		</p>
	</div>
</div>
