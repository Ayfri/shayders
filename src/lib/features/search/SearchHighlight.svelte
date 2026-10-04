<script lang="ts">
	import { splitMatches } from '#features/search/search.js';

	interface Props {
		query: string;
		text: string;
	}

	let { query, text }: Props = $props();
</script>

{#each splitMatches(text, query) as part, index (index)}
	{#if part.match}<mark class="rounded-sm bg-accent/20 text-accent-light">{part.text}</mark>{:else}{part.text}{/if}
{/each}
