<script lang="ts" module>
	const SIZES = { 6: 'size-6', 9: 'size-9', 12: 'size-12', 14: 'size-14', 16: 'size-16', 20: 'size-20' } as const;
</script>

<script lang="ts">
	import { User } from '@lucide/svelte';

	interface Props {
		alt?: string;
		/** Tailwind size step, e.g. `12` for `size-12`. */
		size: keyof typeof SIZES;
		src: string | null | undefined;
	}

	let { alt = '', size, src }: Props = $props();
</script>

{#if src}
	<img {src} {alt} class={['shrink-0 rounded-full border border-border object-cover', SIZES[size]]} />
{:else}
	<span class={['flex shrink-0 items-center justify-center rounded-full border border-border bg-panel text-muted', SIZES[size]]}>
		<User class="size-1/2" />
	</span>
{/if}
