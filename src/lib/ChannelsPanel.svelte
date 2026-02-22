<script lang="ts">
	import { X, Upload, Image, Video } from '@lucide/svelte';

	export interface ChannelEntry {
		id: number; // 0–3
		type: 'image' | 'video' | null;
		url: string | null;
		name: string | null;
	}

	interface Props {
		channels: ChannelEntry[];
		onChannelChange?: (ch: ChannelEntry) => void;
	}

	let { channels, onChannelChange }: Props = $props();

	let fileInputs = $state<(HTMLInputElement | null)[]>([null, null, null, null]);

	function handleFile(id: number, e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const isVideo = file.type.startsWith('video/');
		const existing = channels.find((c) => c.id === id);
		if (existing?.url) URL.revokeObjectURL(existing.url);
		const url = URL.createObjectURL(file);
		onChannelChange?.({ id, type: isVideo ? 'video' : 'image', url, name: file.name });
		(e.target as HTMLInputElement).value = '';
	}

	function clearChannel(id: number) {
		const ch = channels.find((c) => c.id === id);
		if (ch?.url) URL.revokeObjectURL(ch.url);
		onChannelChange?.({ id, type: null, url: null, name: null });
	}

	function onSlotKeydown(id: number, e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			fileInputs[id]?.click();
		}
	}
</script>

<div class="grid grid-cols-2 gap-2 p-3 bg-panel border-b border-border shrink-0">
	{#each [0, 1, 2, 3] as id (id)}
		{@const ch = channels.find((c) => c.id === id) ?? null}
		<div class="flex flex-col gap-1">
			<div class="flex items-center justify-between px-0.5">
				<span class="text-xs font-mono font-semibold text-cyan-400/80">CH{id}</span>
				<span class="text-xs font-mono text-subtle">uChannel{id}</span>
			</div>

			<!-- Slot clickable area -->
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				role="button"
				tabindex="0"
				class="relative w-full overflow-hidden rounded border border-border bg-background cursor-pointer hover:border-cyan-400/40 transition-colors group"
				style="aspect-ratio: 16/9;"
				onclick={() => fileInputs[id]?.click()}
				onkeydown={(e) => onSlotKeydown(id, e)}
			>
				{#if ch?.type === 'image' && ch.url}
					<img src={ch.url} alt={ch.name ?? ''} class="w-full h-full object-cover" />
				{:else if ch?.type === 'video' && ch.url}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						src={ch.url}
						class="w-full h-full object-cover"
						autoplay
						loop
						muted
						playsinline
					></video>
				{:else}
					<div
						class="flex flex-col items-center justify-center h-full gap-1 text-subtle group-hover:text-muted transition-colors"
					>
						<Upload size={13} />
						<span class="text-xs leading-none">Image / Video</span>
					</div>
				{/if}

				{#if ch?.type === 'image'}
					<div class="absolute top-1 left-1 p-0.5 rounded bg-black/50 text-white pointer-events-none">
						<Image size={10} />
					</div>
				{:else if ch?.type === 'video'}
					<div class="absolute top-1 left-1 p-0.5 rounded bg-black/50 text-white pointer-events-none">
						<Video size={10} />
					</div>
				{/if}
			</div>

			<!-- File name row -->
			<div class="flex items-center gap-1 px-0.5 min-h-4">
				{#if ch?.name}
					<span class="text-xs text-muted truncate flex-1" title={ch.name}>{ch.name}</span>
					<button
						onclick={() => clearChannel(id)}
						class="shrink-0 text-subtle hover:text-red-400 cursor-pointer transition-colors p-0.5"
						title="Remove channel"
					>
						<X size={10} />
					</button>
				{:else}
					<span class="text-xs text-subtle">—</span>
				{/if}
			</div>

			<input
				bind:this={fileInputs[id]}
				type="file"
				accept="image/*,video/*"
				class="sr-only"
				onchange={(e) => handleFile(id, e)}
			/>
		</div>
	{/each}
</div>
