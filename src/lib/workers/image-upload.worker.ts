/// <reference lib="webworker" />

import { SHADER_ASSET_LIMITS, SHADER_IMAGE_PASSTHROUGH_MIME_TYPES } from '#features/shaders/assets/shader-asset-policy.js';

declare const self: DedicatedWorkerGlobalScope;

export interface OptimizeImageRequest {
	file: File;
	maxBytes: number;
	maxDimension: number;
}

interface OptimizeImageSuccess {
	ok: true;
	file: File;
	width: number;
	height: number;
}

export type OptimizeImageResponse = OptimizeImageSuccess | { ok: false; error: string };

function fitDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
	if (width <= maxDimension && height <= maxDimension) return { width, height };

	const scale = Math.min(maxDimension / width, maxDimension / height);
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function createCanvas(bitmap: ImageBitmap, width: number, height: number): OffscreenCanvas {
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d', { alpha: true });
	if (!context) throw new Error('Could not prepare image compression canvas.');
	context.drawImage(bitmap, 0, 0, width, height);
	return canvas;
}

function toWebpFile(blob: Blob, file: File): File {
	const dotIndex = file.name.lastIndexOf('.');
	const base = dotIndex >= 0 ? file.name.slice(0, dotIndex) : file.name;
	return new File([blob], `${base}.webp`, { type: blob.type, lastModified: file.lastModified });
}

/** Re-encodes to WebP with decreasing quality, then decreasing size, until the file fits `maxBytes`, keeping the smallest attempt otherwise. */
async function optimizeImage({ file, maxBytes, maxDimension }: OptimizeImageRequest): Promise<OptimizeImageSuccess> {
	const bitmap = await createImageBitmap(file);
	try {
		if (SHADER_IMAGE_PASSTHROUGH_MIME_TYPES.has(file.type)) {
			return { ok: true, file, width: bitmap.width, height: bitmap.height };
		}

		const { imageCompressionMinDimension: minDimension, imageCompressionScaleFactor: scaleFactor } = SHADER_ASSET_LIMITS;
		let { width, height } = fitDimensions(bitmap.width, bitmap.height, maxDimension);
		let best: { blob: Blob; width: number; height: number } | null = null;

		while (true) {
			const canvas = createCanvas(bitmap, width, height);
			for (const quality of SHADER_ASSET_LIMITS.imageCompressionQualities) {
				const blob = await canvas.convertToBlob({ type: SHADER_ASSET_LIMITS.imageCompressionOutputMime, quality });
				if (!best || blob.size < best.blob.size) best = { blob, width, height };
				if (blob.size <= maxBytes) return { ok: true, file: toWebpFile(blob, file), width, height };
			}

			if (width <= minDimension || height <= minDimension) break;
			const nextWidth = Math.max(minDimension, Math.round(width * scaleFactor));
			const nextHeight = Math.max(minDimension, Math.round(height * scaleFactor));
			if (nextWidth === width && nextHeight === height) break;
			width = nextWidth;
			height = nextHeight;
		}

		if (!best) throw new Error('Image optimization did not produce an output file.');
		return { ok: true, file: toWebpFile(best.blob, file), width: best.width, height: best.height };
	} finally {
		bitmap.close();
	}
}

self.onmessage = async (event: MessageEvent<OptimizeImageRequest>) => {
	try {
		self.postMessage((await optimizeImage(event.data)) satisfies OptimizeImageResponse);
	} catch (error) {
		self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Image optimization failed.' } satisfies OptimizeImageResponse);
	}
};
