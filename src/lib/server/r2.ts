import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SHADER_UPLOAD_URL_TTL_SECONDS } from '$lib/shader-asset-policy';
import { buildShaderAssetUrl } from '$lib/shader-asset-url';

interface R2Settings {
	bucketName: string;
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
}

export interface OwnedObjectHead {
	key: string;
	url: string;
	mime: string;
	size: number;
}

let client: S3Client | null = null;

function requiredEnv(name: string): string {
	const value = env[name];
	if (!value) {
		error(500, `Missing ${name} environment variable.`);
	}

	return value;
}

function getR2Settings(): R2Settings {
	const bucketName = requiredEnv('R2_BUCKET_NAME');
	const endpoint = env.R2_S3_ENDPOINT
		? env.R2_S3_ENDPOINT.replace(/\/+$/, '')
		: `https://${requiredEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;

	return {
		bucketName,
		endpoint,
		accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
		secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
	};
}

function getR2Client(): S3Client {
	if (client) {
		return client;
	}

	const settings = getR2Settings();
	client = new S3Client({
		region: 'auto',
		endpoint: settings.endpoint,
		forcePathStyle: true,
		credentials: {
			accessKeyId: settings.accessKeyId,
			secretAccessKey: settings.secretAccessKey,
		},
	});

	return client;
}

function sanitizeFilename(filename: string): string {
	const trimmed = filename.trim().toLowerCase();
	const dotIndex = trimmed.lastIndexOf('.');
	const ext = dotIndex >= 0 ? trimmed.slice(dotIndex).replace(/[^.a-z0-9]+/g, '') : '';
	const base = (dotIndex >= 0 ? trimmed.slice(0, dotIndex) : trimmed)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	return `${base || 'asset'}${ext}`;
}

export function createUserAssetKey(userId: string, filename: string): string {
	return `users/${userId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
}

export function assertOwnedAssetKey(key: string, userId: string): void {
	if (!key.startsWith(`users/${userId}/`)) {
		error(400, 'Invalid asset reference.');
	}
}

export function getR2PublicUrl(key: string): string {
	return buildShaderAssetUrl(key);
}

export async function createPresignedAssetReadUrl(key: string): Promise<string> {
	const { bucketName } = getR2Settings();
	const command = new GetObjectCommand({
		Bucket: bucketName,
		Key: key,
	});

	return getSignedUrl(getR2Client(), command, {
		expiresIn: SHADER_UPLOAD_URL_TTL_SECONDS,
	});
}

export async function createPresignedUploadUrl(params: {
	userId: string;
	filename: string;
	mime: string;
}): Promise<{
	key: string;
	publicUrl: string;
	uploadUrl: string;
	headers: Record<string, string>;
}> {
	const key = createUserAssetKey(params.userId, params.filename);
	const { bucketName } = getR2Settings();
	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: key,
		ContentType: params.mime,
	});
	const uploadUrl = await getSignedUrl(getR2Client(), command, {
		expiresIn: SHADER_UPLOAD_URL_TTL_SECONDS,
		signableHeaders: new Set(['content-type']),
	});

	return {
		key,
		publicUrl: getR2PublicUrl(key),
		uploadUrl,
		headers: {
			'Content-Type': params.mime,
		},
	};
	}

export async function getOwnedObjectHead(key: string, userId: string): Promise<OwnedObjectHead> {
	assertOwnedAssetKey(key, userId);
	const { bucketName } = getR2Settings();

	try {
		const response = await getR2Client().send(new HeadObjectCommand({
			Bucket: bucketName,
			Key: key,
		}));
		const size = Number(response.ContentLength ?? 0);
		if (!Number.isFinite(size) || size <= 0) {
			error(400, 'Stored asset has an invalid size.');
		}

		return {
			key,
			url: getR2PublicUrl(key),
			mime: response.ContentType ?? 'application/octet-stream',
			size,
		};
	} catch {
		error(400, 'Referenced asset is missing from storage.');
	}
	}

export async function deleteR2Objects(keys: string[]): Promise<void> {
	if (keys.length === 0) {
		return;
	}

	const uniqueKeys = [...new Set(keys)];
	const { bucketName } = getR2Settings();
	await getR2Client().send(new DeleteObjectsCommand({
		Bucket: bucketName,
		Delete: {
			Objects: uniqueKeys.map((key) => ({ Key: key })),
			Quiet: true,
		},
	}));
	}
