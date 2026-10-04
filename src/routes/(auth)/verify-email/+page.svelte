<script lang="ts">
	import { enhance } from '$app/forms';
	import { MailCheck, RefreshCw } from '@lucide/svelte';
	import SeoHead from '#components/SeoHead.svelte';
	import AuthField from '#features/auth/AuthField.svelte';
	import AuthForm from '#features/auth/AuthForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const displayEmail = $derived(form?.email ?? data.email);
</script>

<SeoHead
	title="Verify Email - Shayders"
	description="Verify your email address to complete your Shayders account registration."
	robots="noindex, nofollow"
/>

<AuthForm title="Check your email" action="?/verify" error={form?.error} submitIcon={MailCheck} submitLabel="Verify email">
	{#snippet header()}
		<MailCheck size={32} class="text-accent" />
	{/snippet}

	<p class="-mt-2 text-center text-sm text-muted">
		{#if displayEmail}
			We sent a verification email to<br />
			<span class="font-medium text-foreground">{displayEmail}</span>
		{:else}
			Enter the verification token from your email.
		{/if}
	</p>
	<input type="hidden" name="email" value={displayEmail} />
	<AuthField id="token" label="Verification token" type="text" name="token" autocomplete="one-time-code" placeholder="Paste the token from your email" />

	{#snippet footer()}
		<form method="POST" action="?/resend" use:enhance class="mt-5 flex items-center justify-center">
			<input type="hidden" name="email" value={displayEmail} />
			<button
				type="submit"
				disabled={!displayEmail}
				class="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
			>
				<RefreshCw size={13} />
				Resend email
			</button>
		</form>

		{#if form?.resendSuccess}
			<p class="mt-3 text-center text-xs text-green-300">Verification email sent!</p>
		{/if}
	{/snippet}
</AuthForm>
