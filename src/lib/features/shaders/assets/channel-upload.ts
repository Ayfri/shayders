import { throwIfAuthenticatedApiError } from '$features/auth/auth-client.svelte';
import type { BinaryChannelType, ChannelEntry } from '../model/shader-content';
import { optimizeImageFileInWorker } from './image-optimizer';
import {
	getBinaryChannelTypeFromMime,
	validateBinaryAssetMetadata,
	type UploadUrlRequest,
	type UploadUrlResponse,
} from './shader-asset-policy';

export interface PreparedChannelUpload {
	file: File;
	kind: BinaryChannelType;
	request: UploadUrlRequest;
}

function copyChannelDisplaySettings(existing: ChannelEntry | undefined) {
	return {
		filter: existing?.filter,
		wrap: existing?.wrap,
		vflip: existing?.vflip,
	};
}

function loadVideoMetadata(file: File): Promise<{ width: number; height: number; durationSeconds: number }> {
	const url = URL.createObjectURL(file);

	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		const cleanup = () => {
			video.pause();
			video.removeAttribute('src');
			video.load();
			URL.revokeObjectURL(url);
		};

		video.preload = 'metadata';
		video.onloadedmetadata = () => {
			const metadata = {
				width: video.videoWidth,
				height: video.videoHeight,
				durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
			};
			cleanup();
			resolve(metadata);
		};
		video.onerror = () => {
			cleanup();
			reject(new Error('Could not read video metadata.'));
		};
		video.src = url;
	});
}

export function getPreparationStatusLabel(file: File): string {
	const kind = getBinaryChannelTypeFromMime(file.type);
	return kind === 'image' ? 'Optimizing image...' : 'Inspecting video...';
}

export function getUploadStatusLabel(prepared: PreparedChannelUpload): string {
	return prepared.kind === 'image' ? 'Uploading optimized image...' : 'Uploading video...';
}

export async function prepareChannelUpload(file: File): Promise<PreparedChannelUpload> {
	const kind = getBinaryChannelTypeFromMime(file.type);
	if (!kind) {
		throw new Error('Unsupported asset type. Use PNG, JPG, WebP, GIF, AVIF, MP4, or WebM.');
	}

	if (kind === 'image') {
		const optimized = await optimizeImageFileInWorker(file);
		const request: UploadUrlRequest = {
			filename: optimized.file.name,
			mime: optimized.file.type,
			size: optimized.file.size,
			width: optimized.width,
			height: optimized.height,
		};
		const validationError = validateBinaryAssetMetadata(request);
		if (validationError) {
			throw new Error(validationError);
		}

		return {
			file: optimized.file,
			kind,
			request,
		};
	}

	const metadata = await loadVideoMetadata(file);
	const request: UploadUrlRequest = {
		filename: file.name,
		mime: file.type,
		size: file.size,
		width: metadata.width,
		height: metadata.height,
		durationSeconds: metadata.durationSeconds,
	};
	const validationError = validateBinaryAssetMetadata(request);
	if (validationError) {
		throw new Error(validationError);
	}

	return {
		file,
		kind,
		request,
	};
}

export async function uploadPreparedChannelAsset(
	token: string,
	prepared: PreparedChannelUpload,
	replacingKey?: string | null,
): Promise<UploadUrlResponse> {
	const formData = new FormData();
	formData.append('file', prepared.file);
	formData.append('metadata', JSON.stringify({
		...prepared.request,
		replacingKey: replacingKey ?? null,
	}));

	const response = await fetch('/api/upload-url', {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}` },
		body: formData,
	});
	await throwIfAuthenticatedApiError(response, `Upload failed with HTTP ${response.status}.`);

	return (await response.json()) as UploadUrlResponse;
}

export function createLocalChannelEntry(
	id: number,
	existing: ChannelEntry | undefined,
	prepared: PreparedChannelUpload,
	url: string,
): ChannelEntry {
	return {
		id,
		type: prepared.kind,
		url,
		name: prepared.request.filename,
		bufferId: null,
		...copyChannelDisplaySettings(existing),
		mime: prepared.request.mime,
		size: prepared.request.size,
		storageKey: null,
		width: prepared.request.width ?? null,
		height: prepared.request.height ?? null,
		durationSeconds: prepared.request.durationSeconds ?? null,
	};
}

export function createUploadedChannelEntry(
	id: number,
	existing: ChannelEntry | undefined,
	upload: UploadUrlResponse,
): ChannelEntry {
	return {
		id,
		type: upload.asset.type,
		url: upload.asset.url,
		name: upload.asset.name,
		bufferId: null,
		...copyChannelDisplaySettings(existing),
		mime: upload.asset.mime,
		size: upload.asset.size,
		storageKey: upload.asset.storageKey,
		width: upload.asset.width ?? null,
		height: upload.asset.height ?? null,
		durationSeconds: upload.asset.durationSeconds ?? null,
	};
}

