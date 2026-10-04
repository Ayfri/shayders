<script lang="ts">
	import Button from '#components/ui/Button.svelte';
	import Modal from '#components/ui/Modal.svelte';
	import { getShaderState } from '#features/shaders/model/shader-state.svelte.js';
	import { getVisibilityOption, type ShaderVisibility, VISIBILITY_OPTIONS } from '#features/shaders/model/shader-visibility.js';

	interface Props {
		open?: boolean;
		readonly?: boolean;
	}

	let { open = $bindable(false), readonly = false }: Props = $props();

	const shaderState = getShaderState();

	/** Drafts restart from the saved values each time the modal opens, typing overrides them until then. */
	let nameDraft = $derived(open ? shaderState.name : '');
	let descriptionDraft = $derived(open ? shaderState.description : '');
	let visibilityDraft = $derived<ShaderVisibility>(open ? shaderState.visiblity : 'public');

	const visibility = $derived(getVisibilityOption(shaderState.visiblity));

	function apply() {
		shaderState.name = nameDraft;
		shaderState.description = descriptionDraft;
		shaderState.visiblity = visibilityDraft;
		open = false;
	}
</script>

{#snippet fieldLabel(label: string, id?: string)}
	{#if id}
		<label for={id} class="text-xs font-semibold uppercase tracking-wider text-muted">{label}</label>
	{:else}
		<span class="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
	{/if}
{/snippet}

<Modal {open} onClose={() => (open = false)} title="Shader info">
	<div class="flex flex-col gap-5 p-5">
		{#if readonly}
			<div class="flex flex-col gap-1.5">
				{@render fieldLabel('Name')}
				<p class="text-sm text-foreground">{shaderState.name || 'Untitled Shader'}</p>
			</div>

			<div class="flex flex-col gap-1.5">
				{@render fieldLabel('Description')}
				{#if shaderState.description}
					<p class="whitespace-pre-wrap text-sm text-foreground">{shaderState.description}</p>
				{:else}
					<p class="text-sm italic text-subtle">No description.</p>
				{/if}
			</div>

			<div class="flex flex-col gap-1.5">
				{@render fieldLabel('Visibility')}
				<div class="flex items-center gap-2 text-sm text-foreground">
					<visibility.icon size={14} class="text-muted" />
					<span>{visibility.label}</span>
					<span class="text-subtle">- {visibility.description}</span>
				</div>
			</div>
		{:else}
			<div class="flex flex-col gap-1.5">
				{@render fieldLabel('Name', 'shader-name')}
				<input id="shader-name" type="text" bind:value={nameDraft} placeholder="Untitled Shader" class="field bg-background px-3 py-2" />
			</div>

			<div class="flex flex-col gap-1.5">
				{@render fieldLabel('Description', 'shader-description')}
				<textarea
					id="shader-description"
					bind:value={descriptionDraft}
					rows={5}
					placeholder="Describe your shader..."
					class="field resize-none bg-background px-3 py-2"
				></textarea>
			</div>

			<div class="flex flex-col gap-2">
				{@render fieldLabel('Visibility')}
				<div role="radiogroup" aria-label="Visibility" class="flex flex-col gap-1.5">
					{#each VISIBILITY_OPTIONS as choice (choice.value)}
						{@const isSelected = visibilityDraft === choice.value}
						<button
							type="button"
							role="radio"
							aria-checked={isSelected}
							onclick={() => (visibilityDraft = choice.value)}
							class={[
								'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
								isSelected ? 'border-accent/60 bg-accent/8 text-foreground' : 'border-border bg-panel text-muted hover:border-subtle hover:text-foreground',
							]}
						>
							<choice.icon size={15} class={['shrink-0', isSelected ? 'text-accent' : 'text-muted']} />
							<div class="min-w-0">
								<div class="mb-1 text-sm font-medium leading-none">{choice.label}</div>
								<div class="text-xs text-subtle">{choice.description}</div>
							</div>
							{#if isSelected}
								<div class="ml-auto size-2 shrink-0 rounded-full bg-accent"></div>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<div class="flex justify-end gap-2 pt-1">
				<Button onclick={() => (open = false)} variant="ghost" size="sm">Cancel</Button>
				<Button onclick={apply} variant="accent" size="sm">Apply</Button>
			</div>
		{/if}
	</div>
</Modal>
