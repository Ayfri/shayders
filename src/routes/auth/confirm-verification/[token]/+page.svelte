<script lang="ts">
	import { CircleAlert, MailCheck } from '@lucide/svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const isSuccess = $derived(data.status === 'success');
</script>

<svelte:head>
	{#if isSuccess}
		<meta http-equiv="refresh" content="2;url=/" />
	{/if}
</svelte:head>

<SeoHead
	title="Confirm Email - Shayders"
	description="Confirming your email verification for your Shayders account."
/>

<div class="min-h-screen flex flex-col items-center justify-center bg-background">
	<div class="w-full max-w-sm px-8 py-10 bg-surface border border-border rounded-lg shadow-lg">
		{#if isSuccess}
			<div class="flex flex-col items-center gap-4 text-center">
				<MailCheck size={40} class="text-green-400" />
				<p class="text-foreground font-semibold text-lg">Email verified!</p>
				<p class="text-sm text-muted">{data.message}</p>
			</div>
		{:else}
			<div class="flex flex-col items-center gap-4 text-center">
				<CircleAlert size={40} class="text-red-400" />
				<p class="text-foreground font-semibold text-lg">Verification failed</p>
				<p class="text-sm text-red-300">{data.message}</p>
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
