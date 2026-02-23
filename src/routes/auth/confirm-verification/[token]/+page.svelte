<script lang="ts">
	import { confirmVerification } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { MailCheck, CircleAlert } from '@lucide/svelte';

	let { params } = $props();

	let loading = $state(true);
	let error = $state('');
	let success = $state(false);

	onMount(async () => {
		try {
			await confirmVerification(params.token);
			success = true;
			setTimeout(() => goto('/'), 2000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to verify email. The link may have expired.';
			loading = false;
		}
	});
</script>

<div class="min-h-screen flex flex-col items-center justify-center bg-background">
	<div class="w-full max-w-sm px-8 py-10 bg-surface border border-border rounded-lg shadow-lg">
		{#if loading && !error && !success}
			<div class="flex flex-col items-center gap-4">
				<div class="animate-spin">
					<MailCheck size={32} class="text-cyan-400" />
				</div>
				<p class="text-foreground font-medium">Verifying your email...</p>
				<p class="text-sm text-muted">Please wait while we confirm your email address.</p>
			</div>
		{:else if success}
			<div class="flex flex-col items-center gap-4 text-center">
				<MailCheck size={40} class="text-green-400" />
				<p class="text-foreground font-semibold text-lg">Email verified!</p>
				<p class="text-sm text-muted">Your email has been successfully verified. Redirecting you home...</p>
			</div>
		{:else if error}
			<div class="flex flex-col items-center gap-4 text-center">
				<CircleAlert size={40} class="text-red-400" />
				<p class="text-foreground font-semibold text-lg">Verification failed</p>
				<p class="text-sm text-red-300">{error}</p>
				<a
					href="/"
					class="mt-4 px-4 py-2 rounded text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
				>
					Back to home
				</a>
			</div>
		{/if}
	</div>
</div>
