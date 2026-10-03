<script lang="ts">
	import { untrack } from 'svelte';
	import type { ChannelEntry, ShaderBuffer } from '#features/shaders/model/shader-content.js';
	import { ShaderPreviewRenderer } from './preview-renderer.js';

	interface Props {
		buffers: ShaderBuffer[];
		channels?: ChannelEntry[];
		name: string;
	}

	let { buffers, channels = [], name }: Props = $props();

	/** Canvases only exist near the viewport: browsers cap live WebGL contexts (~16 in Chromium) and silently drop the oldest. */
	const VIEWPORT_MARGIN = '200px';

	let inView = $state(false);
	let isHovered = $state(false);
	let renderer: ShaderPreviewRenderer | null = null;

	function observeViewport(element: HTMLElement) {
		const observer = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting), { rootMargin: VIEWPORT_MARGIN });
		observer.observe(element);
		return () => observer.disconnect();
	}

	function attachRenderer(canvas: HTMLCanvasElement) {
		const instance = new ShaderPreviewRenderer(canvas, buffers, channels);
		renderer = instance;
		if (untrack(() => isHovered)) instance.setHovered(true);
		return () => {
			instance.destroy();
			if (renderer === instance) renderer = null;
		};
	}

	function setHovered(hovered: boolean) {
		isHovered = hovered;
		renderer?.setHovered(hovered);
	}

	function handleMouseMove(event: MouseEvent) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		renderer?.setMouse(event.clientX - rect.left, rect.height - (event.clientY - rect.top));
	}
</script>

<div
	{@attach observeViewport}
	class="block h-full w-full cursor-pointer rounded bg-black"
	role="img"
	aria-label={name}
	title={name}
	onmouseenter={() => setHovered(true)}
	onmouseleave={() => setHovered(false)}
	onmousemove={handleMouseMove}
>
	{#if inView}
		<canvas {@attach attachRenderer} class="block h-full w-full rounded"></canvas>
	{/if}
</div>
