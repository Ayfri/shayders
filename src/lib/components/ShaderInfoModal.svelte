<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { shaderState } from '$lib/shaderState.svelte';
	import { Globe, Link, Lock } from '@lucide/svelte';
	import { ShadersVisiblityOptions } from '$lib/pocketbase-types';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	let nameDraft = $state('');
	let descDraft = $state<string | undefined>('');
	let visibilityDraft = $state<keyof typeof ShadersVisiblityOptions>('public');

	$effect(() => {
		if (open) {
			nameDraft = shaderState.name;
			descDraft = shaderState.description;
			visibilityDraft = shaderState.visiblity ?? 'public';
		}
	});

	function apply() {
		shaderState.name = nameDraft;
		shaderState.description = descDraft;
		shaderState.visiblity = visibilityDraft;
		open = false;
	}

	const visibilityOptions: Array<{ value: keyof typeof ShadersVisiblityOptions; label: string; desc: string }> = [
		{ value: 'public', label: 'Public', desc: 'Visible to everyone in profiles' },
		{ value: 'unlisted', label: 'Unlisted', desc: 'Accessible by URL, hidden from profiles' },
		{ value: 'private', label: 'Private', desc: 'Only accessible to you' },
	];
</script>

<Modal {open} onClose={() => (open = false)} title="Shader Info">
	<div class="p-5 flex flex-col gap-5">

		<div class="flex flex-col gap-1.5">
			<label for="shader-name" class="text-xs font-semibold text-muted uppercase tracking-wider">Name</label>
			<input
				id="shader-name"
				type="text"
				bind:value={nameDraft}
				placeholder="Untitled Shader"
				class="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-subtle outline-none focus:border-cyan-400/60 transition-colors"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="shader-desc" class="text-xs font-semibold text-muted uppercase tracking-wider">Description</label>
			<textarea
				id="shader-desc"
				bind:value={descDraft}
				rows={5}
				placeholder="Describe your shader..."
				class="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-subtle resize-none outline-none focus:border-cyan-400/60 transition-colors"
			></textarea>
		</div>

		<div class="flex flex-col gap-2">
			<span class="text-xs font-semibold text-muted uppercase tracking-wider">Visibility</span>
			<div class="flex flex-col gap-1.5">
				{#each visibilityOptions as opt}
					{@const isSelected = visibilityDraft === opt.value}
					<button
						type="button"
						onclick={() => (visibilityDraft = opt.value)}
						class="flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left cursor-pointer transition-all
							{isSelected
								? 'border-cyan-400/60 bg-cyan-400/8 text-foreground'
								: 'border-border bg-panel text-muted hover:border-subtle hover:text-foreground'}"
					>
						<div class="shrink-0 {isSelected ? 'text-cyan-400' : 'text-muted'}">
							{#if opt.value === 'public'}
								<Globe size={15} />
							{:else if opt.value === 'unlisted'}
								<Link size={15} />
							{:else}
								<Lock size={15} />
							{/if}
						</div>
						<div class="min-w-0">
							<div class="text-sm font-medium leading-none mb-1">{opt.label}</div>
							<div class="text-xs text-subtle">{opt.desc}</div>
						</div>
						{#if isSelected}
							<div class="ml-auto size-2 rounded-full bg-cyan-400 shrink-0"></div>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		<div class="flex justify-end gap-2 pt-1">
			<button
				onclick={() => (open = false)}
				class="px-4 py-1.5 rounded text-xs text-muted border border-border hover:bg-border transition-colors cursor-pointer"
			>
				Cancel
			</button>
			<button
				onclick={apply}
				class="px-4 py-1.5 rounded text-xs bg-cyan-400/10 text-cyan-400 border border-cyan-400/60 hover:bg-cyan-400/20 transition-colors cursor-pointer"
			>
				Apply
			</button>
		</div>
	</div>
</Modal>
