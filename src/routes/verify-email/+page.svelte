<script lang="ts">
	import { confirmVerification, requestVerification } from '$lib/auth.svelte';
	import { MailCheck, RefreshCw } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let email = $state(page.url.searchParams.get('email') ?? '');

	let token = $state('');
	let error = $state('');
	let loading = $state(false);
	let resendLoading = $state(false);
	let resendSuccess = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;
		try {
			await confirmVerification(token);
			goto('/');
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Invalid or expired token. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function resend() {
		if (!email || resendLoading) return;
		resendLoading = true;
		error = '';
		try {
			await requestVerification(email);
			resendSuccess = true;
			setTimeout(() => (resendSuccess = false), 3000);
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Failed to resend verification email.';
		} finally {
			resendLoading = false;
		}
	}
</script>

<div class="min-h-screen flex flex-col items-center justify-center bg-background">
	<div class="w-full max-w-sm px-8 py-10 bg-surface border border-border rounded-lg shadow-lg">
		<div class="flex flex-col items-center gap-2 mb-6">
			<MailCheck size={32} class="text-cyan-400" />
			<h1 class="text-2xl font-semibold text-foreground">Check your email</h1>
			{#if email}
				<p class="text-sm text-muted text-center">
					We sent a verification link to<br />
					<span class="text-foreground font-medium">{email}</span>
				</p>
			{:else}
				<p class="text-sm text-muted text-center">Enter the verification token from your email.</p>
			{/if}
		</div>

		<form onsubmit={handleSubmit} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<label for="token" class="text-sm font-medium text-muted">Verification token</label>
				<input
					id="token"
					type="text"
					autocomplete="one-time-code"
					bind:value={token}
					required
					class="px-3 py-2.5 rounded bg-panel border border-border text-foreground text-sm focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
					placeholder="Paste the token from your email"
				/>
			</div>

			{#if error}
				<div class="px-3 py-2 rounded bg-red-950/30 border border-red-700/50 text-red-300 text-sm">{error}</div>
			{/if}

			<button
				type="submit"
				disabled={loading || !token}
				class="mt-2 px-4 py-2.5 rounded font-medium text-white bg-linear-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 border border-cyan-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
			>
				<span class="flex items-center justify-center gap-2">
					<MailCheck size={16} />
					{loading ? 'Verifying…' : 'Verify email'}
				</span>
			</button>
		</form>

		<div class="mt-5 flex items-center justify-center">
			<button
				onclick={resend}
				disabled={resendLoading || !email}
				class="flex items-center gap-1.5 text-sm text-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
			>
				<RefreshCw size={13} class={resendLoading ? 'animate-spin' : ''} />
				{resendLoading ? 'Sending…' : 'Resend email'}
			</button>
		</div>

		{#if resendSuccess}
			<p class="mt-3 text-center text-xs text-green-300">Verification email sent!</p>
		{/if}
	</div>
</div>
