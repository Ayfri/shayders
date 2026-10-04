import { error } from '@sveltejs/kit';
import { buildShaderAssetUrl } from '#features/shaders/assets/shader-asset-url.js';

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
		.replace(/^-|-$/g, '');

	return `${base || 'asset'}${ext}`;
}

function objectHeaders(object: R2Object): Headers {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	if (!headers.has('cache-control')) headers.set('cache-control', ASSET_CACHE_CONTROL);
	return headers;
}

export async function streamR2Asset(bucket: R2Bucket, key: string, request: Request, method: 'GET' | 'HEAD'): Promise<Response> {
	if (!key.startsWith('users/')) error(404, 'Asset not found');

	if (method === 'HEAD') {
		const object = await bucket.head(key);
		if (!object) error(404, 'Asset not found');
		const headers = objectHeaders(object);
		headers.set('content-length', String(object.size));
		return new Response(null, { headers });
	}

	const isRangeRequest = request.headers.has('range');
	const object = await bucket.get(key, isRangeRequest ? { range: request.headers } : {});
	if (!object) error(404, 'Asset not found');

	const headers = objectHeaders(object);
	if (object.range && !('suffix' in object.range)) {
		const { offset = 0, length } = object.range;
		const end = length !== undefined ? offset + length - 1 : object.size - 1;
		headers.set('content-range', `bytes ${offset}-${end}/${object.size}`);
	}

	return new Response(object.body, { status: isRangeRequest ? 206 : 200, headers });
}

export async function putR2Asset(
	bucket: R2Bucket,
	params: { userId: string; filename: string; mime: string },
	body: Blob | ArrayBuffer | ArrayBufferView,
): Promise<{ key: string; publicUrl: string }> {
	const key = `users/${params.userId}/${crypto.randomUUID()}-${sanitizeFilename(params.filename)}`;
	await bucket.put(key, body, { httpMetadata: { contentType: params.mime } });
	return { key, publicUrl: buildShaderAssetUrl(key) };
}

export async function getOwnedObjectHead(bucket: R2Bucket, key: string, userId: string): Promise<OwnedObjectHead> {
	if (!key.startsWith(`users/${userId}/`)) error(400, 'Invalid asset reference.');

	const object = await bucket.head(key);
	if (!object) error(400, 'Referenced asset is missing from storage.');
	if (!Number.isFinite(object.size) || object.size <= 0) error(400, 'Stored asset has an invalid size.');

	return {
		key,
		url: buildShaderAssetUrl(key),
		mime: object.httpMetadata?.contentType ?? 'application/octet-stream',
		size: object.size,
	};
}

export async function deleteR2Objects(bucket: R2Bucket, keys: string[]): Promise<void> {
	if (keys.length > 0) await bucket.delete([...new Set(keys)]);
}

/** `list` and `delete` both cap at 1000 keys, so the prefix is drained page by page. */
export async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ cursor, prefix });
		await deleteR2Objects(bucket, page.objects.map((object) => object.key));
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
}
