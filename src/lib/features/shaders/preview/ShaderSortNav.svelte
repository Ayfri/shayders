<script lang="ts">
	import { SHADER_SORT_OPTIONS, type ShaderSort } from '#features/shaders/model/shader-list.js';

	interface Props {
		/** Anchor kept in the sort links, the page doesn't scroll back to the top when it's set. */
		hash?: string;
		label: string;
		selected: ShaderSort;
	}

	let { hash, label, selected }: Props = $props();
</script>

<nav aria-label={label} class="flex flex-wrap items-center gap-2">
	{#each SHADER_SORT_OPTIONS as option (option.value)}
		<a
			href="?sort={option.value}{hash ? `#${hash}` : ''}"
			data-sveltekit-noscroll={hash ? true : undefined}
			aria-current={selected === option.value ? 'page' : undefined}
			class={[
				'inline-flex items-center rounded-lg border px-3 py-1.5 text-sm transition-colors',
				selected === option.value ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-muted hover:bg-panel hover:text-foreground',
			]}
		>
			{option.label}
		</a>
	{/each}
</nav>
