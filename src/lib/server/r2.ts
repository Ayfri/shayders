import { error } from '@sveltejs/kit';
import { buildShaderAssetUrl } from '$features/shaders/assets/shader-asset-url';

export interface OwnedObjectHead {
	key: string;
	url: string;
	mime: string;
	size: number;
}

const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

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

export async function streamR2Asset(
	bucket: R2Bucket,
	key: string,
	request: Request,
	method: 'GET' | 'HEAD',
): Promise<Response> {
	if (!key || !key.startsWith('users/')) {
		error(404, 'Asset not found');
	}

	if (method === 'HEAD') {
		const object = await bucket.head(key);
		if (!object) error(404, 'Asset not found');

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set('etag', object.httpEtag);
		headers.set('content-length', String(object.size));
		if (!headers.has('cache-control')) {
			headers.set('cache-control', ASSET_CACHE_CONTROL);
		}

		return new Response(null, { headers });
	}

	const rangeHeader = request.headers.get('range');
	const options: R2GetOptions = rangeHeader ? { range: request.headers } : {};
	const object = await bucket.get(key, options);

	if (!object) {
		error(404, 'Asset not found');
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	if (!headers.has('cache-control')) {
		headers.set('cache-control', ASSET_CACHE_CONTROL);
	}

	if (object.range) {
		const { offset = 0, length } = object.range as { offset?: number; length?: number };
		const end = length !== undefined ? offset + length - 1 : object.size - 1;
		headers.set('content-range', `bytes ${offset}-${end}/${object.size}`);
	}

	const status = rangeHeader ? 206 : 200;
	return new Response(object.body, { status, headers });
}

export async function putR2Asset(
	bucket: R2Bucket,
	params: { userId: string; filename: string; mime: string },
	body: ReadableStream | ArrayBuffer | ArrayBufferView,
): Promise<{ key: string; publicUrl: string }> {
	const key = createUserAssetKey(params.userId, params.filename);
	await bucket.put(key, body, {
		httpMetadata: { contentType: params.mime },
	});

	return { key, publicUrl: getR2PublicUrl(key) };
}

export async function getOwnedObjectHead(
	bucket: R2Bucket,
	key: string,
	userId: string,
): Promise<OwnedObjectHead> {
	assertOwnedAssetKey(key, userId);

	const object = await bucket.head(key);
	if (!object) {
		error(400, 'Referenced asset is missing from storage.');
	}

	const size = object.size;
	if (!Number.isFinite(size) || size <= 0) {
		error(400, 'Stored asset has an invalid size.');
	}

	return {
		key,
		url: getR2PublicUrl(key),
		mime: object.httpMetadata?.contentType ?? 'application/octet-stream',
		size,
	};
}

export async function deleteR2Objects(bucket: R2Bucket, keys: string[]): Promise<void> {
	if (keys.length === 0) {
		return;
	}

	await bucket.delete([...new Set(keys)]);
}

