import { error } from '@sveltejs/kit';
import { env, waitUntil } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { isRecord } from '#features/shaders/model/shader-content.js';
import {
	SHADER_VIDEO_MAX_BYTES,
	createQuotaSummary,
	type UploadUrlRequest,
	type UploadUrlResponse,
	getBinaryChannelTypeFromMime,
	validateBinaryAssetMetadata,
} from '#features/shaders/assets/shader-asset-policy.js';
import { authenticatePocketBaseRequest } from '#lib/server/pocketbase-auth.js';
import { deleteR2Objects, putR2Asset } from '#lib/server/r2.js';
import { assertWithinQuota, readAssetStorage } from '#lib/server/shader-assets.js';

/** The biggest allowed file plus room for the multipart framing and metadata, checked before the body is buffered. */
const MAX_REQUEST_BYTES = SHADER_VIDEO_MAX_BYTES + 64 * 1024;

function asOptionalNumber(value: unknown): number | null {
	return typeof value === 'number' ? value : null;
}

/** The declared size is replaced by the real one, quota checks must never trust client metadata. */
function parseMetadata(value: FormDataEntryValue | null, file: File): UploadUrlRequest {
	let metadata: unknown;
	try {
		metadata = JSON.parse(String(value));
	} catch {
		error(400, 'Invalid upload metadata.');
	}
	if (!isRecord(metadata) || typeof metadata.mime !== 'string') error(400, 'Invalid upload metadata.');

	return {
		durationSeconds: asOptionalNumber(metadata.durationSeconds),
		filename: typeof metadata.filename === 'string' ? metadata.filename : file.name,
		height: asOptionalNumber(metadata.height),
		mime: metadata.mime,
		replacingKey: typeof metadata.replacingKey === 'string' ? metadata.replacingKey : null,
		size: file.size,
		width: asOptionalNumber(metadata.width),
	};
}

export const POST: RequestHandler = async ({ request }) => {
	if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) error(413, 'Upload is too large.');

	const bucket = env.ASSETS_STORAGE;
	const { pb, user } = await authenticatePocketBaseRequest(request);
	const formData = await request.formData().catch(() => error(400, 'Invalid upload payload.'));

	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'Missing file in upload payload.');

	const body = parseMetadata(formData.get('metadata'), file);
	const validationError = validateBinaryAssetMetadata(body);
	if (validationError) error(400, validationError);

	const kind = getBinaryChannelTypeFromMime(body.mime);
	if (!kind) error(400, 'Unsupported asset type.');

	const storage = await readAssetStorage(pb, bucket, user.id, body.replacingKey);
	const usedBytes = storage.usedBytes + body.size;
	assertWithinQuota(usedBytes);

	const { key, publicUrl } = await putR2Asset(bucket, { userId: user.id, filename: body.filename, mime: body.mime }, file);
	if (storage.staleKeys.length > 0) waitUntil(deleteR2Objects(bucket, storage.staleKeys).catch((err) => console.error('Failed to delete stale assets:', err)));

	return Response.json({
		asset: {
			type: kind,
			url: publicUrl,
			name: body.filename,
			mime: body.mime,
			size: body.size,
			storageKey: key,
			width: body.width ?? null,
			height: body.height ?? null,
			durationSeconds: body.durationSeconds ?? null,
		},
		quota: createQuotaSummary(usedBytes),
	} satisfies UploadUrlResponse);
};
