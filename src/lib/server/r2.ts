import { error } from '@sveltejs/kit';
import { buildShaderAssetUrl } from '#features/shaders/assets/shader-asset-url.js';

export interface StoredObjectHead {
	key: string;
	url: string;
	mime: string;
	size: number;
}

const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** Both `list` and `delete` cap at 1000 keys per call. */
const R2_PAGE_SIZE = 1000;
const UUID_LENGTH = 36;

/** Every upload of a user lives under this prefix, ownership checks and quota usage both hang off it. */
export function getUserAssetPrefix(userId: string): string {
	return `users/${userId}/`;
}

function sanitizeFilename(filename: string): string {
	const trimmed = filename.trim().toLowerCase();
	const dotIndex = trimmed.lastIndexOf('.');
	const ext = dotIndex >= 0 ? trimmed.slice(dotIndex).replace(/[^.a-z0-9]+/g, '') : '';
	const base = (dotIndex >= 0 ? trimmed.slice(0, dotIndex) : trimmed)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	return `${base || 'asset'}${ext}`;
}

function createAssetKey(userId: string, filename: string): string {
	return `${getUserAssetPrefix(userId)}${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
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
	const key = createAssetKey(params.userId, params.filename);
	await bucket.put(key, body, { httpMetadata: { contentType: params.mime } });
	return { key, publicUrl: buildShaderAssetUrl(key) };
}

/** Copies an object under the user's prefix, keeping the original filename after the source's UUID. */
export async function copyR2Asset(bucket: R2Bucket, sourceKey: string, userId: string): Promise<string> {
	const object = await bucket.get(sourceKey);
	if (!object) error(400, 'Referenced asset is missing from storage.');

	const key = createAssetKey(userId, sourceKey.slice(sourceKey.lastIndexOf('/') + 2 + UUID_LENGTH));
	await bucket.put(key, object.body.pipeThrough(new FixedLengthStream(object.size)), { httpMetadata: object.httpMetadata });
	return key;
}

export async function getObjectHead(bucket: R2Bucket, key: string): Promise<StoredObjectHead> {
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

export async function listR2Prefix(bucket: R2Bucket, prefix: string): Promise<R2Object[]> {
	const objects: R2Object[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ cursor, prefix, limit: R2_PAGE_SIZE });
		objects.push(...page.objects);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return objects;
}

export async function deleteR2Objects(bucket: R2Bucket, keys: Iterable<string>): Promise<void> {
	const uniqueKeys = [...new Set(keys)];
	const chunks = Array.from({ length: Math.ceil(uniqueKeys.length / R2_PAGE_SIZE) }, (_, index) => uniqueKeys.slice(index * R2_PAGE_SIZE, (index + 1) * R2_PAGE_SIZE));
	await Promise.all(chunks.map((chunk) => bucket.delete(chunk)));
}

export async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
	await deleteR2Objects(bucket, (await listR2Prefix(bucket, prefix)).map((object) => object.key));
}
