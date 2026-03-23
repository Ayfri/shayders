import type { BinaryChannelType } from '../model/shader-content';

export interface BinaryAssetMetadata {
	mime: string;
	size: number;
	width?: number | null;
	height?: number | null;
	durationSeconds?: number | null;
}

export interface UploadUrlRequest extends BinaryAssetMetadata {
	filename: string;
	replacingKey?: string | null;
}

export interface UploadedChannelAsset {
	type: BinaryChannelType;
	url: string;
	name: string;
	mime: string;
	size: number;
	storageKey: string;
	width?: number | null;
	height?: number | null;
	durationSeconds?: number | null;
}

export interface QuotaSummary {
	usedBytes: number;
	remainingBytes: number;
	totalBytes: number;
	usedPercent: number;
}

export interface UploadUrlResponse {
	asset: UploadedChannelAsset;
	quota: QuotaSummary;
}

export const SHADER_ASSET_LIMITS = {
	imageMaxBytes: 2 * 1024 * 1024,
	imageMaxDimension: 2048,
	videoMaxBytes: 10 * 1024 * 1024,
	videoMaxWidth: 1920,
	videoMaxHeight: 1080,
	videoMaxDurationSeconds: 30,
	userQuotaBytes: 50 * 1024 * 1024,
	uploadUrlTtlSeconds: 60 * 15,
	imageCompressionOutputMime: 'image/webp',
	imageCompressionScaleFactor: 0.85,
	imageCompressionMinDimension: 256,
	imageCompressionQualities: [0.86, 0.78, 0.7, 0.62, 0.54] as const,
} as const;

export const SHADER_IMAGE_MAX_BYTES = SHADER_ASSET_LIMITS.imageMaxBytes;
export const SHADER_IMAGE_MAX_DIMENSION = SHADER_ASSET_LIMITS.imageMaxDimension;
export const SHADER_VIDEO_MAX_BYTES = SHADER_ASSET_LIMITS.videoMaxBytes;
export const SHADER_VIDEO_MAX_WIDTH = SHADER_ASSET_LIMITS.videoMaxWidth;
export const SHADER_VIDEO_MAX_HEIGHT = SHADER_ASSET_LIMITS.videoMaxHeight;
export const SHADER_VIDEO_MAX_DURATION_SECONDS = SHADER_ASSET_LIMITS.videoMaxDurationSeconds;
export const SHADER_USER_QUOTA_BYTES = SHADER_ASSET_LIMITS.userQuotaBytes;
export const SHADER_UPLOAD_URL_TTL_SECONDS = SHADER_ASSET_LIMITS.uploadUrlTtlSeconds;
export const SHADER_FILE_ACCEPT = 'image/*,video/*';

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'image/avif',
]);

export const ALLOWED_VIDEO_MIME_TYPES = new Set([
	'video/mp4',
	'video/webm',
]);

export const SHADER_IMAGE_PASSTHROUGH_MIME_TYPES = new Set([
	'image/gif',
]);

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 1024) {
		return `${Math.max(0, Math.round(bytes))} B`;
	}

	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
	}

export function getBinaryChannelTypeFromMime(mime: string): BinaryChannelType | null {
	if (ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
		return 'image';
	}

	if (ALLOWED_VIDEO_MIME_TYPES.has(mime)) {
		return 'video';
	}

	return null;
	}

export function createQuotaSummary(
	usedBytes: number,
	totalBytes: number = SHADER_USER_QUOTA_BYTES,
): QuotaSummary {
	const normalizedUsedBytes = Math.max(0, usedBytes);
	return {
		usedBytes: normalizedUsedBytes,
		remainingBytes: Math.max(0, totalBytes - normalizedUsedBytes),
		totalBytes,
		usedPercent: totalBytes > 0
			? Math.min(100, (normalizedUsedBytes / totalBytes) * 100)
			: 0,
	};
	}

export function validateBinaryAssetMetadata(metadata: BinaryAssetMetadata): string | null {
	const kind = getBinaryChannelTypeFromMime(metadata.mime);
	if (!kind) {
		return 'Unsupported asset type. Use PNG, JPG, WebP, GIF, AVIF, MP4, or WebM.';
	}

	if (!Number.isFinite(metadata.size) || metadata.size <= 0) {
		return 'Invalid asset size.';
	}

	if (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height)) {
		return kind === 'image' ? 'Could not read image dimensions.' : 'Could not read video dimensions.';
	}

	if (kind === 'image') {
		if (metadata.size > SHADER_IMAGE_MAX_BYTES) {
			return `Images are limited to ${formatBytes(SHADER_IMAGE_MAX_BYTES)}.`;
		}

		if (metadata.width! > SHADER_IMAGE_MAX_DIMENSION || metadata.height! > SHADER_IMAGE_MAX_DIMENSION) {
			return `Images are limited to ${SHADER_IMAGE_MAX_DIMENSION}x${SHADER_IMAGE_MAX_DIMENSION}.`;
		}

		return null;
	}

	if (metadata.size > SHADER_VIDEO_MAX_BYTES) {
		return `Videos are limited to ${formatBytes(SHADER_VIDEO_MAX_BYTES)}.`;
	}

	if (metadata.width! > SHADER_VIDEO_MAX_WIDTH || metadata.height! > SHADER_VIDEO_MAX_HEIGHT) {
		return `Videos are limited to ${SHADER_VIDEO_MAX_WIDTH}x${SHADER_VIDEO_MAX_HEIGHT}.`;
	}

	if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds! <= 0) {
		return 'Could not read video duration.';
	}

	if (metadata.durationSeconds! > SHADER_VIDEO_MAX_DURATION_SECONDS) {
		return `Videos are limited to ${SHADER_VIDEO_MAX_DURATION_SECONDS} seconds.`;
	}

	return null;
	}
