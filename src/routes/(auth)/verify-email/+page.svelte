<script lang="ts">
	import { MailCheck, RefreshCw } from '@lucide/svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const displayEmail = $derived(form?.email ?? data.email);
</script>

<SeoHead
	title="Verify Email - Shayders"
	description="Verify your email address to complete your Shayders account registration."
/>

<div class="min-h-screen flex flex-col items-center justify-center bg-background">
	<div class="w-full max-w-sm px-8 py-10 bg-surface border border-border rounded-lg shadow-lg">
		<div class="flex flex-col items-center gap-2 mb-6">
			<MailCheck size={32} class="text-cyan-400" />
			<h1 class="text-2xl font-semibold text-foreground">Check your email</h1>
			{#if displayEmail}
				<p class="text-sm text-muted text-center">
					We sent a verification link to<br />
					<span class="text-foreground font-medium">{displayEmail}</span>
				</p>
			{:else}
				<p class="text-sm text-muted text-center">Enter the verification token from your email.</p>
			{/if}
		</div>

		<form method="POST" action="?/verify" class="flex flex-col gap-4">
			<input type="hidden" name="email" value={displayEmail} />
			<div class="flex flex-col gap-2">
				<label for="token" class="text-sm font-medium text-muted">Verification token</label>
				<input
					id="token"
					type="text"
					name="token"
					autocomplete="one-time-code"
					required
					class="px-3 py-2.5 rounded bg-panel border border-border text-foreground text-sm focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
					placeholder="Paste the token from your email"
				/>
			</div>

			{#if form?.error}
				<div class="px-3 py-2 rounded bg-red-950/30 border border-red-700/50 text-red-300 text-sm">{form.error}</div>
			{/if}

			<button
				type="submit"
				class="mt-2 px-4 py-2.5 rounded font-medium text-white bg-linear-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 border border-cyan-400/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
			>
				<span class="flex items-center justify-center gap-2">
					<MailCheck size={16} />
					Verify email
				</span>
			</button>
		</form>

		<form method="POST" action="?/resend" class="mt-5 flex items-center justify-center">
			<input type="hidden" name="email" value={displayEmail} />
			<button
				type="submit"
				disabled={!displayEmail}
				class="flex items-center gap-1.5 text-sm text-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
			>
				<RefreshCw size={13} />
				Resend email
			</button>
		</form>

		{#if form?.resendSuccess}
			<p class="mt-3 text-center text-xs text-green-300">Verification email sent!</p>
		{/if}
	</div>
</div>
