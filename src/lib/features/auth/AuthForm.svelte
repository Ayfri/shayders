<script lang="ts">
	import { enhance } from '$app/forms';
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		action?: string;
		children: Snippet;
		error?: string;
		footer?: Snippet;
		header?: Snippet;
		submitIcon: LucideIcon;
		submitLabel: string;
		title: string;
	}

	let { action, children, error, footer, header, submitIcon: SubmitIcon, submitLabel, title }: Props = $props();

	let pending = $state(false);
</script>

<div class="flex min-h-full items-center justify-center bg-background px-4 py-16">
	<div class="w-full max-w-sm rounded-xl border border-border bg-surface px-8 py-10 shadow-lg">
		<div class="mb-6 flex flex-col items-center gap-2 text-center">
			{@render header?.()}
			<h1 class="text-2xl font-semibold text-foreground">{title}</h1>
		</div>

		<form
			method="POST"
			{action}
			use:enhance={() => {
				pending = true;
				return async ({ update }) => {
					await update();
					pending = false;
				};
			}}
			class="flex flex-col gap-4"
		>
			{@render children()}

			{#if error}
				<div class="alert-error px-3 py-2">{error}</div>
			{/if}

			<button type="submit" disabled={pending} class="btn-primary mt-2 px-4 py-2.5 text-sm">
				<SubmitIcon size={16} />
				{submitLabel}
			</button>
		</form>

		{@render footer?.()}
	</div>
</div>
