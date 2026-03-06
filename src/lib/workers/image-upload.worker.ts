/// <reference lib="webworker" />

import {
	SHADER_ASSET_LIMITS,
	SHADER_IMAGE_PASSTHROUGH_MIME_TYPES,
} from '$lib/shader-asset-policy';

declare const self: DedicatedWorkerGlobalScope;

interface OptimizeImageRequest {
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

interface OptimizeImageFailure {
	ok: false;
	error: string;
}

type OptimizeImageResponse = OptimizeImageSuccess | OptimizeImageFailure;

function replaceExtension(filename: string, extension: string): string {
	const dotIndex = filename.lastIndexOf('.');
	const base = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
	return `${base}${extension}`;
	}

function fitDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
	if (width <= maxDimension && height <= maxDimension) {
		return { width, height };
	}

	const scale = Math.min(maxDimension / width, maxDimension / height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
	}

function createCanvas(bitmap: ImageBitmap, width: number, height: number): OffscreenCanvas {
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d', { alpha: true });
	if (!context) {
		throw new Error('Could not prepare image compression canvas.');
	}

	context.clearRect(0, 0, width, height);
	context.drawImage(bitmap, 0, 0, width, height);
	return canvas;
	}

function toFile(blob: Blob, file: File): File {
	return new File(
		[blob],
		replaceExtension(file.name, '.webp'),
		{ type: blob.type, lastModified: file.lastModified },
	);
	}

async function optimizeImage(
	file: File,
	maxBytes: number,
	maxDimension: number,
): Promise<OptimizeImageSuccess> {
	const bitmap = await createImageBitmap(file);
	try {
		if (SHADER_IMAGE_PASSTHROUGH_MIME_TYPES.has(file.type)) {
			return {
				ok: true,
				file,
				width: bitmap.width,
				height: bitmap.height,
			};
		}

		let { width, height } = fitDimensions(bitmap.width, bitmap.height, maxDimension);
		let bestCandidate: { blob: Blob; width: number; height: number } | null = null;

		while (true) {
			const canvas = createCanvas(bitmap, width, height);
			for (const quality of SHADER_ASSET_LIMITS.imageCompressionQualities) {
				const blob = await canvas.convertToBlob({
					type: SHADER_ASSET_LIMITS.imageCompressionOutputMime,
					quality,
				});

				if (!bestCandidate || blob.size < bestCandidate.blob.size) {
					bestCandidate = { blob, width, height };
				}

				if (blob.size <= maxBytes) {
					return {
						ok: true,
						file: toFile(blob, file),
						width,
						height,
					};
				}
			}

			if (
				width <= SHADER_ASSET_LIMITS.imageCompressionMinDimension
				|| height <= SHADER_ASSET_LIMITS.imageCompressionMinDimension
			) {
				break;
			}

			const nextWidth = Math.max(
				SHADER_ASSET_LIMITS.imageCompressionMinDimension,
				Math.round(width * SHADER_ASSET_LIMITS.imageCompressionScaleFactor),
			);
			const nextHeight = Math.max(
				SHADER_ASSET_LIMITS.imageCompressionMinDimension,
				Math.round(height * SHADER_ASSET_LIMITS.imageCompressionScaleFactor),
			);

			if (nextWidth === width && nextHeight === height) {
				break;
			}

			width = nextWidth;
			height = nextHeight;
		}

		if (!bestCandidate) {
			throw new Error('Image optimization did not produce an output file.');
		}

		return {
			ok: true,
			file: toFile(bestCandidate.blob, file),
			width: bestCandidate.width,
			height: bestCandidate.height,
		};
	} finally {
		bitmap.close();
	}
	}

self.onmessage = async (event: MessageEvent<OptimizeImageRequest>) => {
	try {
		const result = await optimizeImage(
			event.data.file,
			event.data.maxBytes,
			event.data.maxDimension,
		);
		self.postMessage(result satisfies OptimizeImageResponse);
	} catch (error) {
		self.postMessage({
			ok: false,
			error: error instanceof Error ? error.message : 'Image optimization failed.',
		} satisfies OptimizeImageResponse);
	}
	};

export {};
