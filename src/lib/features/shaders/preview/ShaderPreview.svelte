<script lang="ts">
	import { untrack } from 'svelte';
	import type { ChannelEntry, ShaderBuffer } from '#features/shaders/model/shader-content.js';
	import { renderPreviewSnapshot, ShaderPreviewRenderer } from './preview-renderer.js';

	interface Props {
		buffers: ShaderBuffer[];
		channels?: ChannelEntry[];
		name: string;
	}

	let { buffers, channels = [], name }: Props = $props();

	let isHovered = $state(false);
	let live = $state(false);
	let renderer: ShaderPreviewRenderer | null = null;
	let stillCanvas: HTMLCanvasElement;
	let time = 0;

	function showStill(bitmap: ImageBitmap) {
		stillCanvas.getContext('bitmaprenderer')?.transferFromImageBitmap(bitmap);
	}

	/** Every card gets a still frame whatever its scroll position, only the hovered card holds a live WebGL context. */
	function snapshot(element: HTMLElement) {
		const controller = new AbortController();
		const { height, width } = element.getBoundingClientRect();
		renderPreviewSnapshot(buffers, channels, width, height, controller.signal).then(showStill, () => {});
		return () => controller.abort();
	}

	function attachRenderer(canvas: HTMLCanvasElement) {
		const instance = new ShaderPreviewRenderer(canvas, buffers, channels, canvas.clientWidth, canvas.clientHeight, time);
		renderer = instance;
		if (untrack(() => isHovered)) instance.setHovered(true);
		return () => {
			time = instance.time;
			instance.destroy();
			if (renderer === instance) renderer = null;
		};
	}

	/** On leave the live frame is frozen into the still canvas, then the live context is released. */
	function setHovered(hovered: boolean) {
		isHovered = hovered;
		if (hovered) live = true;
		const current = renderer;
		if (!current) return;
		current.setHovered(hovered);
		if (hovered) return;
		current.captureFrame(0).then((bitmap) => {
			if (isHovered || renderer !== current) return bitmap.close();
			showStill(bitmap);
			live = false;
		}, () => {});
	}

	function handlePointerMove(event: PointerEvent) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		renderer?.setMouse(event.clientX - rect.left, rect.height - (event.clientY - rect.top));
	}
</script>

<div
	{@attach snapshot}
	class="relative block h-full w-full rounded bg-black"
	role="img"
	aria-label={name}
	title={name}
	onpointerenter={() => setHovered(true)}
	onpointerleave={() => setHovered(false)}
	onpointermove={handlePointerMove}
>
	<canvas bind:this={stillCanvas} class="block h-full w-full rounded"></canvas>
	{#if live}
		<canvas {@attach attachRenderer} class="absolute inset-0 block h-full w-full rounded"></canvas>
	{/if}
</div>
