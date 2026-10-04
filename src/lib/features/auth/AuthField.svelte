<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends HTMLInputAttributes {
		id: string;
		label: string;
	}

	let { id, label, ...inputProps }: Props = $props();
</script>

<div class="flex flex-col gap-2">
	<label for={id} class="text-sm font-medium text-muted">{label}</label>
	<input {id} required {...inputProps} class="field px-3 py-2.5" />
</div>
