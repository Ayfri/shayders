import ImageUploadWorker from '#lib/workers/image-upload.worker?worker';
import type { OptimizeImageRequest, OptimizeImageResponse } from '#lib/workers/image-upload.worker.js';
import { SHADER_IMAGE_MAX_BYTES, SHADER_IMAGE_MAX_DIMENSION } from './shader-asset-policy.js';

export interface OptimizedImageFile {
	file: File;
	width: number;
	height: number;
}

/** Compresses an image off the main thread with a throwaway worker. */
export function optimizeImageFileInWorker(file: File): Promise<OptimizedImageFile> {
	return new Promise((resolve, reject) => {
		const worker = new ImageUploadWorker();

		worker.onmessage = ({ data }: MessageEvent<OptimizeImageResponse>) => {
			worker.terminate();
			if (data.ok) resolve({ file: data.file, width: data.width, height: data.height });
			else reject(new Error(data.error));
		};

		worker.onerror = () => {
			worker.terminate();
			reject(new Error('Image optimization failed.'));
		};

		worker.postMessage({ file, maxBytes: SHADER_IMAGE_MAX_BYTES, maxDimension: SHADER_IMAGE_MAX_DIMENSION } satisfies OptimizeImageRequest);
	});
}
