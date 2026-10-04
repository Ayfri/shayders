<script lang="ts">
	import { onMount } from 'svelte';
	import { CircleAlert, Maximize2, Minimize2 } from '@lucide/svelte';
	import ShaderCanvasToolbar from '#features/shaders/canvas/ShaderCanvasToolbar.svelte';
	import { editorSettings } from '#features/shaders/editor/editor-settings.svelte.js';
	import ShaderInfoModal from '#features/shaders/editor/ShaderInfoModal.svelte';
	import { FULLSCREEN_TOGGLE_KEY } from '#features/shaders/model/shader-domain.js';
	import { CanvasRecorder, captureFileName, downloadBlob } from '#features/shaders/canvas/canvas-capture.svelte.js';
	import { ShaderCanvasRuntime } from '#features/shaders/canvas/runtime.js';
	import { shaderState } from '#features/shaders/model/shader-state.svelte.js';
	import type { ChannelEntry, ShaderBuffer } from '#features/shaders/model/shader-content.js';

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
	/** Resolved on mount, SSR has no MediaRecorder to ask. */
	let canRecordVideo = $state(false);
	let infosOpen = $state(false);
	let isFullscreen = $state(false);
	let isHovered = $state(false);
	let canvas: HTMLCanvasElement | null = null;
	let wrapper: HTMLDivElement | null = null;

	const recorder = new CanvasRecorder();

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

	async function captureScreenshot(): Promise<void> {
		const blob = await runtime.captureFrame('image/webp', 0.95);
		if (blob) downloadBlob(blob, captureFileName(shaderState.name, blob.type === 'image/webp' ? 'webp' : 'png'));
	}

	function toggleRecording(): void {
		if (recorder.isRecording) recorder.stop();
		else if (canvas) recorder.start(canvas, (blob, extension) => downloadBlob(blob, captureFileName(shaderState.name, extension)));
	}

	function handleDocumentKeydown(event: KeyboardEvent): void {
		if (event.key.toLowerCase() !== FULLSCREEN_TOGGLE_KEY || isEditingField(document.activeElement)) return;
		event.preventDefault();
		void toggleFullscreen();
	}

	function handleFullscreenChange(): void {
		isFullscreen = !!document.fullscreenElement;
	}

	function handlePointerMove(event: PointerEvent): void {
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

	export function run(resetTime = true, sourceBuffers = buffers): void {
		runtime.run(resetTime, sourceBuffers);
	}

	export function hotUpdate(nextBuffers: ShaderBuffer[]): boolean {
		return runtime.hotUpdate(nextBuffers);
	}

	$effect(() => {
		void channels;
		runtime.syncChannels();
	});

	onMount(() => {
		if (!canvas) return;
		canRecordVideo = CanvasRecorder.mimeType !== undefined;
		runtime.mount(canvas);
		return () => {
			recorder.stop(false);
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
			{recorder}
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
			class="block h-full w-full touch-none"
			height={600}
			width={800}
			onpointerdown={(event) => { handlePointerMove(event); runtime.setMouseDown(true); }}
			onpointermove={handlePointerMove}
			onpointerup={() => runtime.setMouseDown(false)}
			onpointercancel={() => runtime.setMouseDown(false)}
			onpointerleave={() => runtime.setMouseDown(false)}
		></canvas>

		<button
			onclick={toggleFullscreen}
			class="absolute bottom-3 right-3 rounded p-1.5 text-white transition-opacity duration-200 pointer-coarse:opacity-60!"
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
		<div class="absolute bottom-0 left-0 right-0 flex max-h-1/2 items-start gap-2 overflow-y-auto border-t border-red-500 bg-red-950 px-4 py-1.5 bg-opacity-15">
			<CircleAlert size={11} class="mt-1 shrink-0 text-red-400" />
			<pre class="m-0 whitespace-pre-wrap font-mono text-xs leading-normal text-red-400">{error}</pre>
		</div>
	{/if}
</div>

<ShaderInfoModal bind:open={infosOpen} readonly={viewOnly} />
