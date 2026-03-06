<script lang="ts">
	import { Image, Layers, Upload, Video, Webcam, X } from '@lucide/svelte';
	import { auth, SessionExpiredError } from '$lib/auth.svelte';
	import { pb } from '$lib/pocketbase';
	import { CHANNEL_SLOT_IDS, type ChannelEntry, type ShaderBuffer } from '$lib/shader-content';
	import {
		formatBytes,
		SHADER_FILE_ACCEPT,
	} from '$lib/shader-asset-policy';
	import {
		createLocalChannelEntry,
		createUploadedChannelEntry,
		getPreparationStatusLabel,
		getUploadStatusLabel,
		prepareChannelUpload,
		type PreparedChannelUpload,
		uploadPreparedChannelAsset,
	} from '$lib/channel-upload';

	interface Props {
		channels: ChannelEntry[];
		onChannelChange?: (ch: ChannelEntry) => void;
		buffers?: ShaderBuffer[];
		thumbnails?: Record<string, string>;
	}

	let { channels, onChannelChange, buffers = [], thumbnails = {} }: Props = $props();

	const assignableBuffers = $derived(
		buffers.filter((b) => b.id !== 'common' && b.id !== 'image')
	);

	let fileInputs = $state<(HTMLInputElement | null)[]>(CHANNEL_SLOT_IDS.map(() => null));
	let webcamVideos = $state<(HTMLVideoElement | null)[]>(CHANNEL_SLOT_IDS.map(() => null));
	let webcamStreams = $state<(MediaStream | null)[]>(CHANNEL_SLOT_IDS.map(() => null));
	let uploadStatus = $state<Record<number, string>>({});
	let uploadErrors = $state<Record<number, string>>({});

	function clearBinaryAssetFields() {
		return {
			mime: null,
			size: null,
			storageKey: null,
			width: null,
			height: null,
			durationSeconds: null,
		};
	}

	function keepChannelSettings(existing: ChannelEntry | undefined) {
		return {
			filter: existing?.filter,
			wrap: existing?.wrap,
			vflip: existing?.vflip,
		};
	}

	function revokeObjectUrl(url: string | null | undefined) {
		if (url?.startsWith('blob:')) {
			URL.revokeObjectURL(url);
		}
	}

	function clearUploadStatus(id: number) {
		const next = { ...uploadStatus };
		delete next[id];
		uploadStatus = next;
	}

	function clearUploadError(id: number) {
		const next = { ...uploadErrors };
		delete next[id];
		uploadErrors = next;
	}

	function setUploadStatus(id: number, message: string) {
		clearUploadError(id);
		uploadStatus = { ...uploadStatus, [id]: message };
	}

	function setUploadError(id: number, message: string) {
		clearUploadStatus(id);
		uploadErrors = { ...uploadErrors, [id]: message };
	}

	function expireUploadStatus(id: number, delay = 2500) {
		window.setTimeout(() => clearUploadStatus(id), delay);
	}

	function startWebcam(id: number) {
		const existing = channels.find((c) => c.id === id);
		revokeObjectUrl(existing?.url);
		clearUploadStatus(id);
		clearUploadError(id);

		navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
			.then(stream => {
				if (webcamVideos[id]) {
					webcamVideos[id]!.srcObject = stream;
					webcamVideos[id]!.play().catch(err => console.error('Error playing webcam:', err));
				}
				webcamStreams[id] = stream;
				onChannelChange?.({
					id,
					type: 'webcam',
					url: 'webcam',
					name: 'Webcam',
					bufferId: null,
					...keepChannelSettings(existing),
					...clearBinaryAssetFields(),
				});
			})
			.catch(err => console.error('Webcam access denied:', err));
	}

	async function handleFile(id: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const existing = channels.find((c) => c.id === id);
		clearUploadError(id);
		let prepared: PreparedChannelUpload | null = null;

		try {
			setUploadStatus(id, getPreparationStatusLabel(file));
			prepared = await prepareChannelUpload(file);
			if (auth.isLoggedIn) {
				setUploadStatus(id, getUploadStatusLabel(prepared));
				const upload = await uploadPreparedChannelAsset(
					pb.authStore.token,
					prepared,
					existing?.storageKey,
				);
				revokeObjectUrl(existing?.url);
				onChannelChange?.(createUploadedChannelEntry(id, existing, upload));
				setUploadStatus(
					id,
					`Uploaded ${formatBytes(upload.asset.size)}. ${formatBytes(upload.quota.usedBytes)} / ${formatBytes(upload.quota.totalBytes)} used.`
				);
			} else {
				revokeObjectUrl(existing?.url);
				const url = URL.createObjectURL(prepared.file);
				onChannelChange?.(createLocalChannelEntry(id, existing, prepared, url));
				setUploadStatus(id, 'Local preview only. Log in to persist assets.');
				expireUploadStatus(id, 4000);
				return;
			}
			expireUploadStatus(id);
		} catch (err) {
			if (err instanceof SessionExpiredError && prepared) {
				revokeObjectUrl(existing?.url);
				const url = URL.createObjectURL(prepared.file);
				onChannelChange?.(createLocalChannelEntry(id, existing, prepared, url));
				setUploadStatus(id, 'Session expired. Logged out. Asset kept as local preview only. Log in again to persist it.');
				expireUploadStatus(id, 5000);
			} else {
				setUploadError(id, err instanceof Error ? err.message : 'Failed to process asset.');
			}
		} finally {
			input.value = '';
		}
	}

	function assignBuffer(id: number, buf: ShaderBuffer) {
		const existing = channels.find((c) => c.id === id);
		revokeObjectUrl(existing?.url);
		clearUploadStatus(id);
		clearUploadError(id);
		onChannelChange?.({
			id,
			type: 'buffer',
			url: null,
			name: buf.label,
			bufferId: buf.id,
			...keepChannelSettings(existing),
			...clearBinaryAssetFields(),
		});
	}

	function clearChannel(id: number) {
		const ch = channels.find((c) => c.id === id);
		revokeObjectUrl(ch?.url);
		if (webcamStreams[id]) {
			webcamStreams[id]!.getTracks().forEach(t => t.stop());
			webcamStreams[id] = null;
		}
		clearUploadStatus(id);
		clearUploadError(id);
		onChannelChange?.({
			id,
			type: null,
			url: null,
			name: null,
			bufferId: null,
			...clearBinaryAssetFields(),
		});
	}

	function onSlotKeydown(id: number, e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			fileInputs[id]?.click();
		}
	}
</script>

<div class="grid grid-cols-2 gap-2 p-3 bg-panel border-b border-border shrink-0 max-h-96 overflow-y-auto">
	{#if !auth.isLoggedIn}
		<div class="col-span-2 rounded border border-border bg-background/60 px-2 py-1.5 text-[10px] leading-relaxed text-muted">
			Images are still optimized in a worker, but uploads stay local until you log in. Buffer and webcam channels still work normally.
		</div>
	{/if}
	{#each CHANNEL_SLOT_IDS as id (id)}
		{@const ch = channels.find((c) => c.id === id) ?? null}
		<div class="flex flex-col gap-1">
			<div class="flex items-center justify-between px-0.5">
				<span class="text-xs font-mono font-semibold text-cyan-400/80">CH{id}</span>
				<span class="text-xs font-mono text-subtle">uChannel{id}</span>
			</div>

			<!-- Slot clickable area (click = upload file) -->
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				role="button"
				tabindex="0"
				class="relative w-full h-24 overflow-hidden rounded border border-border bg-background cursor-pointer hover:border-cyan-400/40 transition-colors group"
				onclick={() => fileInputs[id]?.click()}
				onkeydown={(e) => onSlotKeydown(id, e)}
			>
				{#if ch?.type === 'image' && ch.url}
					<img src={ch.url} alt={ch.name ?? ''} class="w-full h-full object-cover" style="transform: {ch.vflip ? 'scaleY(-1)' : ''};" />
				{:else if ch?.type === 'video' && ch.url}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						src={ch.url}
						class="w-full h-full object-cover"
						style="transform: {ch.vflip ? 'scaleY(-1)' : ''};"
						autoplay
						loop
						muted
						playsinline
					></video>
				{:else if ch?.type === 'webcam'}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						bind:this={webcamVideos[id]}
						class="w-full h-full object-cover"
						autoplay
						muted
						playsinline
					></video>
				{:else if ch?.type === 'buffer' && ch.bufferId && thumbnails[ch.bufferId]}
					<img src={thumbnails[ch.bufferId]} alt={ch.name ?? ''} class="w-full h-full object-cover" />
				{:else if ch?.type === 'buffer'}
					<div class="flex flex-col items-center justify-center h-full gap-1 text-cyan-400/60">
						<Layers size={13} />
						<span class="text-xs leading-none">{ch.name ?? 'Buffer'}</span>
					</div>
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
				{:else if ch?.type === 'webcam'}
					<div class="absolute top-1 left-1 p-0.5 rounded bg-black/50 text-cyan-400 pointer-events-none">
						<Webcam size={10} />
					</div>
				{:else if ch?.type === 'buffer'}
					<div class="absolute top-1 left-1 p-0.5 rounded bg-black/50 text-cyan-400 pointer-events-none">
						<Layers size={10} />
					</div>
				{/if}
			</div>

			<!-- File name / clear row with webcam button -->
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
					<span class="text-xs text-subtle">-</span>
					<button
						onclick={() => startWebcam(id)}
						class="ml-auto shrink-0 text-subtle hover:text-cyan-400 cursor-pointer transition-colors p-1"
						title="Use webcam"
					>
						<Webcam size={14} />
					</button>
				{/if}
			</div>

			{#if uploadErrors[id]}
				<p class="px-0.5 text-[10px] leading-relaxed text-red-400">{uploadErrors[id]}</p>
			{:else if uploadStatus[id]}
				<p class="px-0.5 text-[10px] leading-relaxed text-cyan-400">{uploadStatus[id]}</p>
			{/if}

			<!-- Texture options -->
			{#if ch?.type && ch.type !== 'buffer' && ch.type !== null}
				<div class="space-y-1 px-0.5 py-1">
					<!-- Filter -->
					<div class="flex items-center gap-1">
						<label for="filter-{id}" class="text-xs text-subtle w-12">Filter:</label>
						<select
							id="filter-{id}"
							value={ch.filter ?? 'linear'}
							onchange={(e) => {
								const target = e.target as HTMLSelectElement;
								const newCh = { ...ch, filter: target.value as 'linear' | 'nearest' | 'linear-mipmap' };
								onChannelChange?.(newCh);
							}}
							class="text-xs flex-1 px-1.5 py-0.5 rounded bg-background border border-border text-foreground cursor-pointer"
						>
							<option value="linear">Linear</option>
							<option value="linear-mipmap">Mipmap</option>
							<option value="nearest">Nearest</option>
						</select>
					</div>
					<!-- Wrap -->
					<div class="flex items-center gap-1">
						<label for="wrap-{id}" class="text-xs text-subtle w-12">Wrap:</label>
						<select
							id="wrap-{id}"
							value={ch.wrap ?? 'clamp'}
							onchange={(e) => {
								const target = e.target as HTMLSelectElement;
								const newCh = { ...ch, wrap: target.value as 'repeat' | 'clamp' };
								onChannelChange?.(newCh);
							}}
							class="text-xs flex-1 px-1.5 py-0.5 rounded bg-background border border-border text-foreground cursor-pointer"
						>
							<option value="clamp">Clamp</option>
							<option value="repeat">Repeat</option>
						</select>
					</div>
					<!-- VFlip -->
					<label for="vflip-{id}" class="flex items-center gap-2 text-xs text-subtle cursor-pointer">
						<input
							id="vflip-{id}"
							type="checkbox"
							checked={ch.vflip ?? false}
							onchange={(e) => {
								const target = e.target as HTMLInputElement;
								const newCh = { ...ch, vflip: target.checked };
								onChannelChange?.(newCh);
							}}
							class="w-3 h-3 rounded cursor-pointer"
						/>
						<span>Flip V</span>
					</label>
				</div>
			{/if}

			<!-- Buffer picker -->
			{#if assignableBuffers.length > 0}
				<div class="flex flex-wrap gap-1 px-0.5">
					{#each assignableBuffers as buf (buf.id)}
						{@const isSelected = ch?.type === 'buffer' && ch.bufferId === buf.id}
						<button
							onclick={(e) => { e.stopPropagation(); assignBuffer(id, buf); }}
							title="Use {buf.label}"
							class="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono border transition-colors cursor-pointer
								{isSelected
									? 'bg-cyan-400/15 text-cyan-400 border-cyan-400/60'
									: 'text-subtle border-border hover:text-foreground hover:border-muted/40'}"
						>
							{#if thumbnails[buf.id]}
								<img src={thumbnails[buf.id]} alt="" class="h-3 rounded-sm object-cover" style="width:6px;" />
							{:else}
								<Layers size={9} />
							{/if}
							<span>{buf.label}</span>
						</button>
					{/each}
				</div>
			{/if}

			<input
				bind:this={fileInputs[id]}
				type="file"
				accept={SHADER_FILE_ACCEPT}
				class="sr-only"
				onchange={(e) => handleFile(id, e)}
			/>
		</div>
	{/each}
</div>
