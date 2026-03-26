<script lang="ts">
	import { onMount } from 'svelte';
	import { CircleAlert, Maximize2, Minimize2 } from '@lucide/svelte';
	import ShaderCanvasToolbar from '$features/shaders/canvas/ShaderCanvasToolbar.svelte';
	import { loadSettings } from '$features/shaders/editor/editor-settings';
	import ShaderInfoModal from '$features/shaders/editor/ShaderInfoModal.svelte';
	import { FULLSCREEN_TOGGLE_KEY } from '$features/shaders/model/shader-domain';
	import { ShaderCanvasRuntime } from '$features/shaders/canvas/runtime';
	import { shaderState } from '$features/shaders/model/shader-state.svelte';
	import type { ChannelEntry, ShaderBuffer } from '$features/shaders/model/shader-content';

	const MAX_BITRATE = 48_000_000;
	const MAX_RECORDING_DURATION_MS = 5 * 60 * 1000;
	const RECORDING_FPS = 60;

	const canRecordVideo =
		typeof MediaRecorder !== 'undefined'
		&& typeof HTMLCanvasElement !== 'undefined'
		&& typeof HTMLCanvasElement.prototype.captureStream === 'function'
		&& !!pickRecordingMimeType();

	interface Props {
		authorId?: string;
		authorName?: string;
		buffers: ShaderBuffer[];
		channels?: ChannelEntry[];
		error?: string;
		isSavingLocally?: boolean;
		onFork?: () => void;
		readonly?: boolean;
		thumbnails?: Record<string, string>;
		uniformValues?: Record<string, string>;
		viewOnly?: boolean;
	}

	let {
		authorId = undefined,
		authorName = undefined,
		buffers,
		channels = [],
		error = $bindable(''),
		isSavingLocally = false,
		onFork = undefined,
		readonly = false,
		thumbnails = $bindable({}),
		uniformValues = $bindable({}),
		viewOnly = false,
	}: Props = $props();

	let buildTime = $state(0);
	let infosOpen = $state(false);
	let isFullscreen = $state(false);
	let isHovered = $state(false);
	let isRecording = $state(false);
	let recordingElapsedMs = $state(0);
	let canvas: HTMLCanvasElement | null = null;
	let wrapper: HTMLDivElement | null = null;

	let recordingRecorder: MediaRecorder | null = null;
	let recordingStream: MediaStream | null = null;
	let recordingTimerId: ReturnType<typeof setInterval> | null = null;
	let recordingTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let recordingChunks: BlobPart[] = [];
	let recordingStartedAt = 0;
	let recordingShouldDownload = false;
	let recordingMimeType = '';
	let editorSettings = $state(loadSettings());

	const runtime = new ShaderCanvasRuntime({
		getBuffers: () => buffers,
		getCanvas: () => canvas,
		getChannels: () => channels,
		getBufferPreviewsEnabled: () => editorSettings.bufferPreviews,
		updateBuildTime: (value) => (buildTime = value),
		updateError: (value) => (error = value),
		updateThumbnails: (value) => (thumbnails = value),
		updateUniformValues: (value) => (uniformValues = value),
	});

	$effect(() => {
		editorSettings = loadSettings();
	});

	function isEditingField(element: Element | null): boolean {
		return element instanceof HTMLElement
			&& (
				element.tagName === 'INPUT'
				|| element.tagName === 'TEXTAREA'
				|| element.getAttribute('contenteditable') === 'true'
				|| element.classList.contains('monaco-editor')
				|| element.closest('.monaco-editor') !== null
			);
	}

	function clearRecordingTimers(): void {
		if (recordingTimerId) {
			clearInterval(recordingTimerId);
			recordingTimerId = null;
		}

		if (recordingTimeoutId) {
			clearTimeout(recordingTimeoutId);
			recordingTimeoutId = null;
		}
	}

	function createDownloadFileName(extension: string): string {
		const safeName = (shaderState.name || 'shader')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'shader';
		const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
		return `${safeName}-${stamp}.${extension}`;
	}

	function downloadBlob(blob: Blob, fileName: string): void {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		link.rel = 'noopener';
		link.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function pickRecordingMimeType(): string | undefined {
		if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
			return undefined;
		}

		const mimeTypes = [
			'video/webm;codecs=vp8,opus',
			'video/webm;codecs=vp9,opus',
			'video/webm;codecs=vp9',
			'video/webm;codecs=vp8',
			'video/webm',
		];

		return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
	}

	async function captureScreenshot(): Promise<void> {
		const targetCanvas = canvas;
		if (!targetCanvas) return;

		const webpBlob = await new Promise<Blob | null>((resolve) => {
			targetCanvas.toBlob((blob) => resolve(blob), 'image/webp', 0.95);
		});

		if (webpBlob) {
			downloadBlob(webpBlob, createDownloadFileName('webp'));
			return;
		}

		const pngBlob = await new Promise<Blob | null>((resolve) => {
			targetCanvas.toBlob((blob) => resolve(blob), 'image/png');
		});

		if (pngBlob) {
			downloadBlob(pngBlob, createDownloadFileName('png'));
		}
	}

	function completeRecording(): void {
		const shouldDownload = recordingShouldDownload;
		const chunks = recordingChunks;
		const mimeType = recordingRecorder?.mimeType || recordingMimeType || 'video/webm';
		const stream = recordingStream;

		recordingShouldDownload = false;
		recordingRecorder = null;
		recordingStream = null;
		recordingChunks = [];
		recordingMimeType = '';
		recordingStartedAt = 0;
		recordingElapsedMs = 0;
		isRecording = false;
		clearRecordingTimers();

		if (stream) {
			for (const track of stream.getTracks()) {
				track.stop();
			}
		}

		if (!shouldDownload || chunks.length === 0) {
			return;
		}

		downloadBlob(new Blob(chunks, { type: mimeType }), createDownloadFileName('webm'));
	}

	function stopRecording(download = true): void {
		if (!recordingRecorder) return;

		recordingShouldDownload = download;
		clearRecordingTimers();
		recordingElapsedMs = Date.now() - recordingStartedAt;
		isRecording = false;

		if (recordingRecorder.state === 'inactive') {
			completeRecording();
			return;
		}

		try {
			recordingRecorder.stop();
		} catch {
			completeRecording();
		}
	}

	function startRecording(): void {
		if (!canvas || !canRecordVideo || isRecording) return;

		const stream = canvas.captureStream(RECORDING_FPS);
		const mimeType = pickRecordingMimeType();
		const recorder = mimeType
			? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: MAX_BITRATE })
			: new MediaRecorder(stream, { videoBitsPerSecond: MAX_BITRATE });

		recordingChunks = [];
		recordingMimeType = recorder.mimeType || mimeType || 'video/webm';
		recordingStream = stream;
		recordingRecorder = recorder;
		recordingShouldDownload = true;
		recordingStartedAt = Date.now();
		recordingElapsedMs = 0;
		isRecording = true;

		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				recordingChunks.push(event.data);
			}
		};

		recorder.onstop = () => completeRecording();

		recordingTimerId = setInterval(() => {
			recordingElapsedMs = Date.now() - recordingStartedAt;
		}, 250);

		recordingTimeoutId = setTimeout(() => {
			stopRecording(true);
		}, MAX_RECORDING_DURATION_MS);

		recorder.start(1000);
	}

	function toggleRecording(): void {
		if (isRecording) {
			stopRecording(true);
			return;
		}

		startRecording();
	}

	function handleDocumentKeydown(event: KeyboardEvent): void {
		if (event.key.toLowerCase() !== FULLSCREEN_TOGGLE_KEY || isEditingField(document.activeElement)) return;
		event.preventDefault();
		void toggleFullscreen();
	}

	function handleFullscreenChange(): void {
		isFullscreen = !!document.fullscreenElement;
	}

	function handleMouseMove(event: MouseEvent): void {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		runtime.setMouse({
			x: event.clientX - rect.left,
			y: rect.height - (event.clientY - rect.top),
		});
	}

	async function toggleFullscreen(): Promise<void> {
		if (!wrapper) return;
		if (!document.fullscreenElement) await wrapper.requestFullscreen();
		else await document.exitFullscreen();
	}

	export function run(resetTime = true): void {
		runtime.run(resetTime);
	}

	$effect(() => {
		void channels;
		runtime.syncChannels();
	});

	onMount(() => {
		if (!canvas) return;
		runtime.mount(canvas);
		return () => {
			stopRecording(false);
			runtime.destroy();
		};
	});
</script>

<svelte:document onfullscreenchange={handleFullscreenChange} onkeydown={handleDocumentKeydown} />

<div
	bind:this={wrapper}
	role="application"
	class="relative flex h-full min-w-0 w-full flex-col bg-black outline-none"
	onmouseenter={() => (isHovered = true)}
	onmouseleave={() => (isHovered = false)}
>
	{#if !isFullscreen}
		<ShaderCanvasToolbar
			{authorId}
			{authorName}
			{buildTime}
			{canRecordVideo}
			{captureScreenshot}
			{isSavingLocally}
			{isRecording}
			{recordingElapsedMs}
			recordingLimitMs={MAX_RECORDING_DURATION_MS}
			{onFork}
			onOpenInfo={() => (infosOpen = true)}
			{readonly}
			{toggleRecording}
			{viewOnly}
		/>
	{/if}

	<div class="relative flex-1 min-h-0 min-w-0 overflow-hidden">
		<canvas
			bind:this={canvas}
			class="block h-full w-full"
			height={600}
			width={800}
			onmousedown={() => runtime.setMouseDown(true)}
			onmousemove={handleMouseMove}
			onmouseup={() => runtime.setMouseDown(false)}
			onmouseleave={() => runtime.setMouseDown(false)}
		></canvas>

		<button
			onclick={toggleFullscreen}
			class="absolute bottom-3 right-3 rounded p-1.5 text-white transition-opacity duration-200"
			style="filter: drop-shadow(0 1px 4px rgba(0,0,0,0.95)); opacity: {isHovered ? 0.5 : 0.1};"
			title={isFullscreen ? 'Quit fullscreen (F)' : 'Fullscreen (F)'}
		>
			{#if isFullscreen}
				<Minimize2 size={18} />
			{:else}
				<Maximize2 size={18} />
			{/if}
		</button>
	</div>

	{#if error}
		<div class="absolute bottom-0 left-0 right-0 flex items-start gap-2 border-t border-red-500 bg-red-950 px-4 py-1.5 bg-opacity-15">
			<CircleAlert size={11} class="mt-1 shrink-0 text-red-400" />
			<pre class="m-0 whitespace-pre-wrap font-mono text-xs leading-normal text-red-400">{error}</pre>
		</div>
	{/if}
</div>

<ShaderInfoModal bind:open={infosOpen} readonly={viewOnly} />
