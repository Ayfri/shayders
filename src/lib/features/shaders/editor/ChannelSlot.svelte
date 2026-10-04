<script lang="ts" module>
	import { Image, ImageOff, Layers, type LucideIcon, Upload, Video, Webcam, X } from '@lucide/svelte';
	import type { ChannelEntry, ChannelFilter, ChannelWrap, ShaderBuffer } from '#features/shaders/model/shader-content.js';

	const CHANNEL_FILTER_OPTIONS = [
		{ label: 'Linear', value: 'linear' },
		{ label: 'Mipmap', value: 'linear-mipmap' },
		{ label: 'Nearest', value: 'nearest' },
	] as const satisfies readonly { label: string; value: ChannelFilter }[];

	const CHANNEL_WRAP_OPTIONS = [
		{ label: 'Clamp', value: 'clamp' },
		{ label: 'Repeat', value: 'repeat' },
	] as const satisfies readonly { label: string; value: ChannelWrap }[];

	/** Live sources get the accent color, static files stay white. */
	const TYPE_BADGES: Record<NonNullable<ChannelEntry['type']>, { icon: LucideIcon; live: boolean }> = {
		buffer: { icon: Layers, live: true },
		image: { icon: Image, live: false },
		video: { icon: Video, live: false },
		webcam: { icon: Webcam, live: true },
	};
</script>

<script lang="ts">
	interface Props {
		accept: string;
		assignableBuffers?: ShaderBuffer[];
		channel: ChannelEntry | null;
		id: number;
		onAssignBuffer: (buffer: ShaderBuffer) => void;
		onClear: () => void;
		onFileChange: (event: Event) => void;
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
		id,
		onAssignBuffer,
		onClear,
		onFileChange,
		onStartWebcam,
		onUpdateChannel,
		thumbnails = {},
		uploadError = '',
		uploadStatus = '',
		webcamVideo = $bindable(null),
	}: Props = $props();

	/** Keyed by URL so picking a new file clears the error without any reset logic. */
	let failedUrl = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	const badge = $derived(channel?.type ? TYPE_BADGES[channel.type] : null);

	function update(patch: Partial<ChannelEntry>): void {
		if (channel) onUpdateChannel({ ...channel, ...patch });
	}
</script>

{#snippet removeButton()}
	<button type="button" onclick={onClear} class="shrink-0 p-0.5 text-subtle transition-colors hover:text-red-400" title="Remove channel" aria-label="Remove channel">
		<X size={10} />
	</button>
{/snippet}

{#snippet settingSelect(label: string, value: string, options: readonly { label: string; value: string }[], onchange: (value: string) => void)}
	<div class="flex items-center gap-1">
		<label for="{label.toLowerCase()}-{id}" class="w-12 text-xs text-subtle">{label}:</label>
		<select
			id="{label.toLowerCase()}-{id}"
			{value}
			onchange={(event) => onchange(event.currentTarget.value)}
			class="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
		>
			{#each options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>
{/snippet}

<div class="flex flex-col gap-1">
	<div class="flex items-center justify-between px-0.5">
		<span class="font-mono text-xs font-semibold text-accent/80">CH{id}</span>
		<span class="font-mono text-xs text-subtle">uChannel{id}</span>
	</div>

	<button
		type="button"
		class="group relative h-24 w-full overflow-hidden rounded border border-border bg-background transition-colors hover:border-accent/40"
		onclick={() => fileInput?.click()}
	>
		{#if (channel?.type === 'image' || channel?.type === 'video') && channel.url && failedUrl === channel.url}
			<div class="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-red-400/80">
				<ImageOff size={13} />
				<span class="text-xs leading-tight">Couldn't load {channel.type}</span>
			</div>
		{:else if channel?.type === 'image' && channel.url}
			<img src={channel.url} alt={channel.name ?? ''} onerror={() => (failedUrl = channel.url)} class={['h-full w-full object-cover', channel.vflip && '-scale-y-100']} />
		{:else if channel?.type === 'video' && channel.url}
			<video
				src={channel.url}
				onerror={() => (failedUrl = channel.url)}
				autoplay
				class={['h-full w-full object-cover', channel.vflip && '-scale-y-100']}
				loop
				muted
				playsinline
			></video>
		{:else if channel?.type === 'webcam'}
			<video bind:this={webcamVideo} autoplay class="h-full w-full object-cover" muted playsinline></video>
		{:else if channel?.type === 'buffer' && channel.bufferId && thumbnails[channel.bufferId]}
			<img src={thumbnails[channel.bufferId]} alt={channel.name ?? ''} class="h-full w-full object-cover" />
		{:else if channel?.type === 'buffer'}
			<div class="flex h-full flex-col items-center justify-center gap-1 text-accent/60">
				<Layers size={13} />
				<span class="text-xs leading-none">{channel.name ?? 'Buffer'}</span>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center gap-1 text-subtle transition-colors group-hover:text-muted">
				<Upload size={13} />
				<span class="text-xs leading-none">Image / Video</span>
			</div>
		{/if}

		{#if badge}
			<div class={['pointer-events-none absolute left-1 top-1 rounded bg-black/50 p-0.5', badge.live ? 'text-accent' : 'text-white']}>
				<badge.icon size={10} />
			</div>
		{/if}
	</button>

	<div class="flex min-h-4 items-center gap-1 px-0.5">
		{#if channel?.type === 'webcam'}
			<span class="flex-1 truncate text-xs text-accent/70">Webcam</span>
			{@render removeButton()}
			<button type="button" onclick={onStartWebcam} class="shrink-0 p-1 text-accent transition-colors" title="Webcam active" aria-label="Restart webcam">
				<Webcam size={14} />
			</button>
		{:else if channel?.name}
			<span class="flex-1 truncate text-xs text-muted" title={channel.name}>{channel.name}</span>
			{@render removeButton()}
		{:else}
			<span class="text-xs text-subtle">-</span>
			<button type="button" onclick={onStartWebcam} class="ml-auto shrink-0 p-1 text-subtle transition-colors hover:text-accent" title="Use webcam" aria-label="Use webcam">
				<Webcam size={14} />
			</button>
		{/if}
	</div>

	{#if uploadError}
		<p class="px-0.5 text-10 leading-relaxed text-red-400">{uploadError}</p>
	{:else if uploadStatus}
		<p class="px-0.5 text-10 leading-relaxed text-accent">{uploadStatus}</p>
	{/if}

	{#if channel?.type && channel.type !== 'buffer'}
		<div class="space-y-1 px-0.5 py-1">
			{@render settingSelect('Filter', channel.filter ?? 'linear', CHANNEL_FILTER_OPTIONS, (value) => update({ filter: value as ChannelFilter }))}
			{@render settingSelect('Wrap', channel.wrap ?? 'clamp', CHANNEL_WRAP_OPTIONS, (value) => update({ wrap: value as ChannelWrap }))}
			<label for="vflip-{id}" class="flex items-center gap-2 text-xs text-subtle">
				<input
					id="vflip-{id}"
					type="checkbox"
					checked={channel.vflip ?? false}
					onchange={(event) => update({ vflip: event.currentTarget.checked })}
					class="size-3 rounded"
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
					title="Use {buffer.label}"
					class={[
						'flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs transition-colors',
						isSelected ? 'border-accent/60 bg-accent/15 text-accent' : 'border-border text-subtle hover:border-muted/40 hover:text-foreground',
					]}
				>
					{#if thumbnails[buffer.id]}
						<img src={thumbnails[buffer.id]} alt="" class="h-3 w-1.5 rounded-sm object-cover" />
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
