<script lang="ts">
	import { Image, Layers, Upload, Video, Webcam, X } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import type { ChannelEntry, ChannelFilter, ChannelWrap, ShaderBuffer } from '$features/shaders/model/shader-content';

	const CHANNEL_FILTER_OPTIONS = [
		{ label: 'Linear', value: 'linear' },
		{ label: 'Mipmap', value: 'linear-mipmap' },
		{ label: 'Nearest', value: 'nearest' },
	] as const satisfies readonly { label: string; value: ChannelFilter }[];

	const CHANNEL_WRAP_OPTIONS = [
		{ label: 'Clamp', value: 'clamp' },
		{ label: 'Repeat', value: 'repeat' },
	] as const satisfies readonly { label: string; value: ChannelWrap }[];

	interface Props {
		accept: string;
		assignableBuffers?: ShaderBuffer[];
		channel: ChannelEntry | null;
		fileInput?: HTMLInputElement | null;
		id: number;
		onAssignBuffer: (buffer: ShaderBuffer) => void;
		onClear: () => void;
		onFileChange: (event: Event) => void;
		onOpenFilePicker: () => void;
		onStartWebcam: () => void;
		onUpdateChannel: (channel: ChannelEntry) => void;
		thumbnails?: Record<string, string>;
		uploadError?: string;
		uploadStatus?: string;
		webcamVideo?: HTMLVideoElement | null;
	}

	let {
		accept,
		assignableBuffers = [],
		channel,
		fileInput = $bindable(null),
		id,
		onAssignBuffer,
		onClear,
		onFileChange,
		onOpenFilePicker,
		onStartWebcam,
		onUpdateChannel,
		thumbnails = {},
		uploadError = '',
		uploadStatus = '',
		webcamVideo = $bindable(null),
	}: Props = $props();

	function updateFilter(event: Event): void {
		if (!channel) return;
		untrack(() => {
			onUpdateChannel({ ...channel, filter: (event.currentTarget as HTMLSelectElement).value as ChannelFilter });
		});
	}

	function updateVflip(event: Event): void {
		if (!channel) return;
		untrack(() => {
			onUpdateChannel({ ...channel, vflip: (event.currentTarget as HTMLInputElement).checked });
		});
	}

	function updateWrap(event: Event): void {
		if (!channel) return;
		untrack(() => {
			onUpdateChannel({ ...channel, wrap: (event.currentTarget as HTMLSelectElement).value as ChannelWrap });
		});
	}
</script>

{#snippet overlayIcon()}
	{#if channel?.type === 'image'}
		<div class="pointer-events-none absolute left-1 top-1 rounded bg-black/50 p-0.5 text-white">
			<Image size={10} />
		</div>
	{:else if channel?.type === 'video'}
		<div class="pointer-events-none absolute left-1 top-1 rounded bg-black/50 p-0.5 text-white">
			<Video size={10} />
		</div>
	{:else if channel?.type === 'webcam'}
		<div class="pointer-events-none absolute left-1 top-1 rounded bg-black/50 p-0.5 text-cyan-400">
			<Webcam size={10} />
		</div>
	{:else if channel?.type === 'buffer'}
		<div class="pointer-events-none absolute left-1 top-1 rounded bg-black/50 p-0.5 text-cyan-400">
			<Layers size={10} />
		</div>
	{/if}
{/snippet}

<div class="flex flex-col gap-1">
	<div class="flex items-center justify-between px-0.5">
		<span class="font-mono text-xs font-semibold text-cyan-400/80">CH{id}</span>
		<span class="font-mono text-xs text-subtle">uChannel{id}</span>
	</div>

	<button
		type="button"
		class="group relative h-24 w-full cursor-pointer overflow-hidden rounded border border-border bg-background transition-colors hover:border-cyan-400/40"
		onclick={onOpenFilePicker}
	>
		{#if channel?.type === 'image' && channel.url}
			<img src={channel.url} alt={channel.name ?? ''} class="h-full w-full object-cover" style="transform: {channel.vflip ? 'scaleY(-1)' : ''};" />
		{:else if channel?.type === 'video' && channel.url}
			<video
				src={channel.url}
				autoplay
				class="h-full w-full object-cover"
				loop
				muted
				playsinline
				style="transform: {channel.vflip ? 'scaleY(-1)' : ''};"
			></video>
		{:else if channel?.type === 'webcam'}
			<video
				bind:this={webcamVideo}
				autoplay
				class="h-full w-full object-cover"
				muted
				playsinline
			></video>
		{:else if channel?.type === 'buffer' && channel.bufferId && thumbnails[channel.bufferId]}
			<img src={thumbnails[channel.bufferId]} alt={channel.name ?? ''} class="h-full w-full object-cover" />
		{:else if channel?.type === 'buffer'}
			<div class="flex h-full flex-col items-center justify-center gap-1 text-cyan-400/60">
				<Layers size={13} />
				<span class="text-xs leading-none">{channel.name ?? 'Buffer'}</span>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center gap-1 text-subtle transition-colors group-hover:text-muted">
				<Upload size={13} />
				<span class="text-xs leading-none">Image / Video</span>
			</div>
		{/if}

		{@render overlayIcon()}
	</button>

	<div class="flex min-h-4 items-center gap-1 px-0.5">
		{#if channel?.type === 'webcam'}
			<span class="flex-1 truncate text-xs text-cyan-400/70">Webcam</span>
			<button type="button" onclick={onClear} class="shrink-0 cursor-pointer p-0.5 text-subtle transition-colors hover:text-red-400" title="Remove channel">
				<X size={10} />
			</button>
			<button type="button" onclick={onStartWebcam} class="shrink-0 cursor-pointer p-1 text-cyan-400 transition-colors" title="Webcam active">
				<Webcam size={14} />
			</button>
		{:else if channel?.name}
			<span class="flex-1 truncate text-xs text-muted" title={channel.name}>{channel.name}</span>
			<button type="button" onclick={onClear} class="shrink-0 cursor-pointer p-0.5 text-subtle transition-colors hover:text-red-400" title="Remove channel">
				<X size={10} />
			</button>
		{:else}
			<span class="text-xs text-subtle">-</span>
			<button type="button" onclick={onStartWebcam} class="ml-auto shrink-0 cursor-pointer p-1 text-subtle transition-colors hover:text-cyan-400" title="Use webcam">
				<Webcam size={14} />
			</button>
		{/if}
	</div>

	{#if uploadError}
		<p class="px-0.5 text-[10px] leading-relaxed text-red-400">{uploadError}</p>
	{:else if uploadStatus}
		<p class="px-0.5 text-[10px] leading-relaxed text-cyan-400">{uploadStatus}</p>
	{/if}

	{#if channel?.type && channel.type !== 'buffer'}
		<div class="space-y-1 px-0.5 py-1">
			<div class="flex items-center gap-1">
				<label for="filter-{id}" class="w-12 text-xs text-subtle">Filter:</label>
				<select
					id="filter-{id}"
					value={channel.filter ?? 'linear'}
					onchange={updateFilter}
					class="flex-1 cursor-pointer rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
				>
					{#each CHANNEL_FILTER_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
			<div class="flex items-center gap-1">
				<label for="wrap-{id}" class="w-12 text-xs text-subtle">Wrap:</label>
				<select
					id="wrap-{id}"
					value={channel.wrap ?? 'clamp'}
					onchange={updateWrap}
					class="flex-1 cursor-pointer rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
				>
					{#each CHANNEL_WRAP_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
			<label for="vflip-{id}" class="flex cursor-pointer items-center gap-2 text-xs text-subtle">
				<input
					id="vflip-{id}"
					type="checkbox"
					checked={channel.vflip ?? false}
					onchange={updateVflip}
					class="h-3 w-3 cursor-pointer rounded"
				/>
				<span>Flip V</span>
			</label>
		</div>
	{/if}

	{#if assignableBuffers.length > 0}
		<div class="flex flex-wrap gap-1 px-0.5">
			{#each assignableBuffers as buffer (buffer.id)}
				{@const isSelected = channel?.type === 'buffer' && channel.bufferId === buffer.id}
				<button
					type="button"
					onclick={() => onAssignBuffer(buffer)}
					title={`Use ${buffer.label}`}
					class="flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs transition-colors {isSelected
						? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-400'
						: 'border-border text-subtle hover:border-muted/40 hover:text-foreground'}"
				>
					{#if thumbnails[buffer.id]}
						<img src={thumbnails[buffer.id]} alt="" class="h-3 rounded-sm object-cover" style="width:6px;" />
					{:else}
						<Layers size={9} />
					{/if}
					<span>{buffer.label}</span>
				</button>
			{/each}
		</div>
	{/if}

	<input bind:this={fileInput} type="file" {accept} class="sr-only" onchange={onFileChange} />
</div>

