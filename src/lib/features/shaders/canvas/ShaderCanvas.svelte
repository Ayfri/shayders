<script lang="ts">
	import { onMount } from 'svelte';
	import { CircleAlert, Maximize2, Minimize2 } from '@lucide/svelte';
	import ShaderCanvasToolbar from '$features/shaders/canvas/ShaderCanvasToolbar.svelte';
	import ShaderInfoModal from '$features/shaders/editor/ShaderInfoModal.svelte';
	import { FULLSCREEN_TOGGLE_KEY } from '$features/shaders/model/shader-domain';
	import { ShaderCanvasRuntime } from '$features/shaders/canvas/runtime';
	import type { ChannelEntry, ShaderBuffer } from '$features/shaders/model/shader-content';

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
	let canvas: HTMLCanvasElement | null = null;
	let wrapper: HTMLDivElement | null = null;

	const runtime = new ShaderCanvasRuntime({
		getBuffers: () => buffers,
		getCanvas: () => canvas,
		getChannels: () => channels,
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
		return () => runtime.destroy();
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
			{isSavingLocally}
			{onFork}
			onOpenInfo={() => (infosOpen = true)}
			{readonly}
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

