<script lang="ts" module>
	const VARIANTS = {
		accent: 'rounded border border-accent/60 bg-accent/10 text-accent hover:bg-accent/20',
		danger: 'rounded-lg border border-red-900/50 bg-red-950/30 text-red-300 hover:bg-red-900/50',
		ghost: 'rounded border border-border text-muted hover:bg-border hover:text-foreground',
		primary: 'rounded-lg bg-accent font-semibold text-background hover:bg-accent-light',
		secondary: 'rounded-lg border border-border bg-surface text-foreground hover:bg-panel',
	};

	const SIZES = {
		lg: 'px-4 py-2.5 text-sm',
		md: 'px-3 py-1.5 text-sm',
		sm: 'px-3 py-1.5 text-xs',
		/** Dense editor bars, roomier from the `sm` breakpoint. */
		toolbar: 'px-2 py-0.5 text-xs sm:px-4 sm:py-1',
		xs: 'px-2 py-1 text-xs',
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClassValue, HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = {
		children: Snippet;
		/** Layout only (margins, alignment, min width), colors and spacing come from `variant` and `size`. */
		class?: ClassValue;
		/** Monospace semibold label used by the editor's controls. */
		mono?: boolean;
		size?: keyof typeof SIZES;
		variant?: keyof typeof VARIANTS;
	} & ((HTMLButtonAttributes & { href?: never }) | (HTMLAnchorAttributes & { href: string }));

	let { children, class: layoutClass, mono = false, size = 'md', variant = 'secondary', ...attributes }: Props = $props();

	const className = $derived([
		'inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50',
		VARIANTS[variant],
		SIZES[size],
		mono && 'font-mono font-semibold tracking-wider',
		layoutClass,
	]);
</script>

{#if attributes.href !== undefined}
	<a {...attributes as HTMLAnchorAttributes} class={className}>{@render children()}</a>
{:else}
	<button type="button" {...attributes as HTMLButtonAttributes} class={className}>{@render children()}</button>
{/if}
