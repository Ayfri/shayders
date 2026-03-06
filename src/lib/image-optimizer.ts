import ImageUploadWorker from '$lib/workers/image-upload.worker?worker';
import {
	SHADER_IMAGE_MAX_BYTES,
	SHADER_IMAGE_MAX_DIMENSION,
} from '$lib/shader-asset-policy';

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

export interface OptimizedImageFile {
	file: File;
	width: number;
	height: number;
}

export function optimizeImageFileInWorker(file: File): Promise<OptimizedImageFile> {
	return new Promise((resolve, reject) => {
		const worker = new ImageUploadWorker();
		const cleanup = () => worker.terminate();

		worker.onmessage = (event: MessageEvent<OptimizeImageResponse>) => {
			cleanup();
			if (!event.data.ok) {
				reject(new Error(event.data.error));
				return;
			}

			resolve({
				file: event.data.file,
				width: event.data.width,
				height: event.data.height,
			});
		};

		worker.onerror = () => {
			cleanup();
			reject(new Error('Image optimization failed.'));
		};

		const request: OptimizeImageRequest = {
			file,
			maxBytes: SHADER_IMAGE_MAX_BYTES,
			maxDimension: SHADER_IMAGE_MAX_DIMENSION,
		};
		worker.postMessage(request);
	});
	}
