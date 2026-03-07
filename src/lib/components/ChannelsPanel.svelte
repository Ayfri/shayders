<script lang="ts">
	import { auth, SessionExpiredError } from '$lib/auth.svelte';
	import {
		createLocalChannelEntry,
		createUploadedChannelEntry,
		getPreparationStatusLabel,
		getUploadStatusLabel,
		prepareChannelUpload,
		type PreparedChannelUpload,
		uploadPreparedChannelAsset,
	} from '$lib/channel-upload';
	import ChannelSlot from '$lib/components/ChannelSlot.svelte';
	import { pb } from '$lib/pocketbase';
	import { CHANNEL_SLOT_IDS, type ChannelEntry, type ShaderBuffer } from '$lib/shader-content';
	import {
		formatBytes,
		SHADER_FILE_ACCEPT,
	} from '$lib/shader-asset-policy';

	interface Props {
		buffers?: ShaderBuffer[];
		channels: ChannelEntry[];
		onChannelChange?: (ch: ChannelEntry) => void;
		thumbnails?: Record<string, string>;
	}

	let { channels, onChannelChange, buffers = [], thumbnails = {} }: Props = $props();

	const assignableBuffers = $derived.by(() => buffers.filter((buffer) => buffer.id !== 'common' && buffer.id !== 'image'));
	const channelMap = $derived.by(() => new Map(channels.map((channel) => [channel.id, channel] as const)));

	let fileInputs = $state<(HTMLInputElement | null)[]>(CHANNEL_SLOT_IDS.map(() => null));
	let webcamVideos = $state<(HTMLVideoElement | null)[]>(CHANNEL_SLOT_IDS.map(() => null));
	let webcamStreams = $state<(MediaStream | null)[]>(CHANNEL_SLOT_IDS.map(() => null));
	let uploadErrors = $state.raw<Record<number, string>>({});
	let uploadStatus = $state.raw<Record<number, string>>({});

	const EMPTY_BINARY_ASSET_FIELDS = {
		durationSeconds: null,
		height: null,
		mime: null,
		size: null,
		storageKey: null,
		width: null,
	} as const satisfies Pick<ChannelEntry, 'durationSeconds' | 'height' | 'mime' | 'size' | 'storageKey' | 'width'>;

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

	function clearUploadError(id: number) {
		uploadErrors = omitStatusEntry(uploadErrors, id);
	}

	function clearUploadStatus(id: number) {
		uploadStatus = omitStatusEntry(uploadStatus, id);
	}

	function expireUploadStatus(id: number, delay = 2500) {
		window.setTimeout(() => clearUploadStatus(id), delay);
	}

	function getChannel(id: number): ChannelEntry | undefined {
		return channelMap.get(id);
	}

	function omitStatusEntry(source: Record<number, string>, id: number): Record<number, string> {
		const next = { ...source };
		delete next[id];
		return next;
	}

	function resetChannelUi(id: number) {
		clearUploadError(id);
		clearUploadStatus(id);
	}

	function setUploadError(id: number, message: string) {
		clearUploadStatus(id);
		uploadErrors = { ...uploadErrors, [id]: message };
	}

	function setUploadStatus(id: number, message: string) {
		clearUploadError(id);
		uploadStatus = { ...uploadStatus, [id]: message };
	}

	function stopWebcam(id: number) {
		webcamStreams[id]?.getTracks().forEach((track) => track.stop());
		webcamStreams[id] = null;
	}

	$effect(() => {
		for (const id of CHANNEL_SLOT_IDS) {
			if (getChannel(id)?.type === 'webcam' && !webcamStreams[id]) {
				navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
					.then((stream) => { webcamStreams[id] = stream; })
					.catch((error) => console.error('Webcam access denied:', error));
			}
		}
	});

	$effect(() => {
		for (const id of CHANNEL_SLOT_IDS) {
			const video = webcamVideos[id];
			const stream = webcamStreams[id];
			if (video && stream && video.srcObject !== stream) {
				video.srcObject = stream;
				video.play().catch(() => {});
			}
		}
	});

	function startWebcam(id: number) {
		const existing = getChannel(id);
		stopWebcam(id);
		revokeObjectUrl(existing?.url);
		resetChannelUi(id);
		onChannelChange?.({
			...EMPTY_BINARY_ASSET_FIELDS,
			...keepChannelSettings(existing),
			type: 'webcam',
			bufferId: null,
			id,
			name: 'Webcam',
			url: 'webcam',
		});
	}

	async function handleFile(id: number, e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const existing = getChannel(id);
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
		const existing = getChannel(id);
		revokeObjectUrl(existing?.url);
		resetChannelUi(id);
		onChannelChange?.({
			...EMPTY_BINARY_ASSET_FIELDS,
			...keepChannelSettings(existing),
			type: 'buffer',
			bufferId: buf.id,
			id,
			name: buf.label,
			url: null,
		});
	}

	function clearChannel(id: number) {
		const ch = getChannel(id);
		revokeObjectUrl(ch?.url);
		stopWebcam(id);
		resetChannelUi(id);
		onChannelChange?.({
			...EMPTY_BINARY_ASSET_FIELDS,
			bufferId: null,
			id,
			name: null,
			type: null,
			url: null,
		});
	}
</script>

<div class="grid grid-cols-2 gap-2 p-3 bg-panel border-b border-border shrink-0 max-h-96 overflow-y-auto">
	{#if !auth.isLoggedIn}
		<div class="col-span-2 rounded border border-border bg-background/60 px-2 py-1.5 text-[10px] leading-relaxed text-muted">
			Images are still optimized in a worker, but uploads stay local until you log in. Buffer and webcam channels still work normally.
		</div>
	{/if}
	{#each CHANNEL_SLOT_IDS as id (id)}
		<ChannelSlot
			accept={SHADER_FILE_ACCEPT}
			assignableBuffers={assignableBuffers}
			channel={getChannel(id) ?? null}
			bind:fileInput={fileInputs[id]}
			bind:webcamVideo={webcamVideos[id]}
			{id}
			onAssignBuffer={(buffer) => assignBuffer(id, buffer)}
			onClear={() => clearChannel(id)}
			onFileChange={(event) => handleFile(id, event)}
			onOpenFilePicker={() => fileInputs[id]?.click()}
			onStartWebcam={() => startWebcam(id)}
			onUpdateChannel={(channel) => onChannelChange?.(channel)}
			{thumbnails}
			uploadError={uploadErrors[id]}
			uploadStatus={uploadStatus[id]}
		/>
	{/each}
</div>
