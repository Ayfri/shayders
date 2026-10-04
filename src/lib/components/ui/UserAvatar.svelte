<script lang="ts">
	import { User } from '@lucide/svelte';
	import type { ClassValue } from 'svelte/elements';

	interface Props {
		alt?: string;
		/** Sizes the avatar, e.g. `size-12`. */
		class: ClassValue;
		src: string | null | undefined;
	}

	let { alt = '', class: className, src }: Props = $props();
</script>

{#if src}
	<img {src} {alt} class={['shrink-0 rounded-full border border-border object-cover', className]} />
{:else}
	<span class={['flex shrink-0 items-center justify-center rounded-full border border-border bg-panel text-muted', className]}>
		<User class="size-1/2" />
	</span>
{/if}
