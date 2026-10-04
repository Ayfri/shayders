<script lang="ts">
	import { auth, SessionExpiredError } from '#features/auth/auth-client.svelte.js';
	import {
		createLocalChannelEntry,
		createUploadedChannelEntry,
		getPreparationStatusLabel,
		getUploadStatusLabel,
		prepareChannelUpload,
		type PreparedChannelUpload,
		uploadPreparedChannelAsset,
	} from '#features/shaders/assets/channel-upload.js';
	import { formatBytes, SHADER_FILE_ACCEPT } from '#features/shaders/assets/shader-asset-policy.js';
	import ChannelSlot from '#features/shaders/editor/ChannelSlot.svelte';
	import { CHANNEL_SLOT_IDS, type ChannelEntry, type ShaderBuffer } from '#features/shaders/model/shader-content.js';
	import { pb } from '#lib/pocketbase.js';

	interface Props {
		buffers?: ShaderBuffer[];
		channels: ChannelEntry[];
		onChannelChange?: (channel: ChannelEntry) => void;
		thumbnails?: Record<string, string>;
	}

	let { buffers = [], channels, onChannelChange, thumbnails = {} }: Props = $props();

	const EMPTY_BINARY_ASSET_FIELDS = {
		durationSeconds: null,
		height: null,
		mime: null,
		size: null,
		storageKey: null,
		width: null,
	} as const satisfies Pick<ChannelEntry, 'durationSeconds' | 'height' | 'mime' | 'size' | 'storageKey' | 'width'>;

	const assignableBuffers = $derived(buffers.filter((buffer) => buffer.id !== 'common' && buffer.id !== 'image'));
	const channelMap = $derived(new Map(channels.map((channel) => [channel.id, channel] as const)));

	let webcamStreams = $state<(MediaStream | null)[]>(CHANNEL_SLOT_IDS.map(() => null));
	/** One message per slot, an upload status and an error never show together. */
	let slotMessages = $state.raw<Record<number, { error: boolean; text: string }>>({});

	/** Slots with a `getUserMedia` call in flight, the stream only lands once it resolves and a rerun in between would open a second one. */
	const pendingWebcams = new Set<number>();
	let destroyed = false;

	function setMessage(id: number, text: string | null, error = false) {
		const { [id]: _previous, ...rest } = slotMessages;
		slotMessages = text ? { ...rest, [id]: { error, text } } : rest;
	}

	/** Clears a status after a delay, unless another message replaced it meanwhile. */
	function expireMessage(id: number, delay = 2500) {
		const message = slotMessages[id];
		window.setTimeout(() => slotMessages[id] === message && setMessage(id, null), delay);
	}

	function revokeObjectUrl(url: string | null | undefined) {
		if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
	}

	function stopWebcam(id: number) {
		webcamStreams[id]?.getTracks().forEach((track) => track.stop());
		webcamStreams[id] = null;
	}

	/** Swaps a slot's channel, releasing the previous blob URL and webcam, sampler settings survive unless the slot is cleared. */
	function replaceChannel(id: number, next: Pick<ChannelEntry, 'bufferId' | 'name' | 'type' | 'url'>) {
		const existing = channelMap.get(id);
		revokeObjectUrl(existing?.url);
		stopWebcam(id);
		setMessage(id, null);
		const settings = next.type ? { filter: existing?.filter, vflip: existing?.vflip, wrap: existing?.wrap } : {};
		onChannelChange?.({ ...EMPTY_BINARY_ASSET_FIELDS, ...settings, ...next, id });
	}

	function keepLocalPreview(id: number, existing: ChannelEntry | undefined, prepared: PreparedChannelUpload, message: string, delay: number) {
		revokeObjectUrl(existing?.url);
		onChannelChange?.(createLocalChannelEntry(id, existing, prepared, URL.createObjectURL(prepared.file)));
		setMessage(id, message);
		expireMessage(id, delay);
	}

	$effect(() => {
		for (const id of CHANNEL_SLOT_IDS) {
			if (channelMap.get(id)?.type !== 'webcam' || webcamStreams[id] || pendingWebcams.has(id)) continue;
			pendingWebcams.add(id);
			navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user' } })
				.then((stream) => {
					if (destroyed || channelMap.get(id)?.type !== 'webcam') stream.getTracks().forEach((track) => track.stop());
					else webcamStreams[id] = stream;
				})
				.catch((error) => console.error('Webcam access denied:', error))
				.finally(() => pendingWebcams.delete(id));
		}
	});

	$effect(() => () => {
		destroyed = true;
		CHANNEL_SLOT_IDS.forEach(stopWebcam);
	});

	async function handleFile(id: number, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const existing = channelMap.get(id);
		let prepared: PreparedChannelUpload | null = null;

		try {
			setMessage(id, getPreparationStatusLabel(file));
			prepared = await prepareChannelUpload(file);
			if (!auth.isLoggedIn) {
				keepLocalPreview(id, existing, prepared, 'Local preview only. Log in to persist assets.', 4000);
				return;
			}

			setMessage(id, getUploadStatusLabel(prepared));
			const upload = await uploadPreparedChannelAsset(pb.authStore.token, prepared, existing?.storageKey);
			revokeObjectUrl(existing?.url);
			onChannelChange?.(createUploadedChannelEntry(id, existing, upload));
			setMessage(id, `Uploaded ${formatBytes(upload.asset.size)}. ${formatBytes(upload.quota.usedBytes)} / ${formatBytes(upload.quota.totalBytes)} used.`);
			expireMessage(id);
		} catch (err) {
			if (err instanceof SessionExpiredError && prepared) {
				keepLocalPreview(id, existing, prepared, 'Session expired. Logged out. Asset kept as local preview only. Log in again to persist it.', 5000);
			} else {
				setMessage(id, err instanceof Error ? err.message : 'Failed to process asset.', true);
			}
		} finally {
			input.value = '';
		}
	}
</script>

<div class="grid max-h-96 shrink-0 grid-cols-2 gap-2 overflow-y-auto border-b border-border bg-panel p-3">
	{#if !auth.isLoggedIn}
		<div class="col-span-2 rounded border border-border bg-background/60 px-2 py-1.5 text-10 leading-relaxed text-muted">
			Images are still optimized in a worker, but uploads stay local until you log in. Buffer and webcam channels still work normally.
		</div>
	{/if}
	{#each CHANNEL_SLOT_IDS as id (id)}
		{@const message = slotMessages[id]}
		<ChannelSlot
			accept={SHADER_FILE_ACCEPT}
			{assignableBuffers}
			channel={channelMap.get(id) ?? null}
			webcamStream={webcamStreams[id]}
			{id}
			onAssignBuffer={(buffer) => replaceChannel(id, { bufferId: buffer.id, name: buffer.label, type: 'buffer', url: null })}
			onClear={() => replaceChannel(id, { bufferId: null, name: null, type: null, url: null })}
			onFileChange={(event) => handleFile(id, event)}
			onStartWebcam={() => replaceChannel(id, { bufferId: null, name: 'Webcam', type: 'webcam', url: 'webcam' })}
			onUpdateChannel={(channel) => onChannelChange?.(channel)}
			{thumbnails}
			uploadError={message?.error ? message.text : ''}
			uploadStatus={message && !message.error ? message.text : ''}
		/>
	{/each}
</div>
