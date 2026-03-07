import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sumStoredAssetBytes } from '$lib/shader-content';
import {
	SHADER_USER_QUOTA_BYTES,
	createQuotaSummary,
	type UploadUrlRequest,
	type UploadUrlResponse,
	formatBytes,
	getBinaryChannelTypeFromMime,
	validateBinaryAssetMetadata,
} from '$lib/shader-asset-policy';
import { authenticatePocketBaseRequest } from '$lib/server/pocketbase-auth';
import { putR2Asset } from '$lib/server/r2';

export const POST: RequestHandler = async ({ request, platform }) => {
	const bucket = platform?.env.ASSETS_STORAGE;
	if (!bucket) error(503, 'Storage unavailable.');

	const { pb, user } = await authenticatePocketBaseRequest(request);

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return json({ error: 'Invalid upload payload.' }, { status: 400 });
	}

	let body: UploadUrlRequest;
	try {
		body = JSON.parse(formData.get('metadata') as string) as UploadUrlRequest;
	} catch {
		return json({ error: 'Invalid upload metadata.' }, { status: 400 });
	}

	const file = formData.get('file');
	if (!(file instanceof File)) {
		return json({ error: 'Missing file in upload payload.' }, { status: 400 });
	}

	const validationError = validateBinaryAssetMetadata(body);
	if (validationError) {
		return json({ error: validationError }, { status: 400 });
	}

	const kind = getBinaryChannelTypeFromMime(body.mime);
	if (!kind) {
		return json({ error: 'Unsupported asset type.' }, { status: 400 });
	}

	const ignoredKeys = new Set(body.replacingKey ? [body.replacingKey] : []);
	const userShaders = await pb.collection('shaders').getFullList({
		filter: pb.filter('user_id = {:userId}', { userId: user.id }),
	});
	const usedBytes = userShaders.reduce(
		(total, shader) => total + sumStoredAssetBytes(shader.content, ignoredKeys),
		0,
	);

	const nextUsedBytes = usedBytes + body.size;
	if (nextUsedBytes > SHADER_USER_QUOTA_BYTES) {
		return json({
			error: `Storage quota exceeded. Free accounts are limited to ${formatBytes(SHADER_USER_QUOTA_BYTES)}.`,
		}, { status: 400 });
	}

	const { key, publicUrl } = await putR2Asset(bucket, {
		userId: user.id,
		filename: body.filename,
		mime: body.mime,
	}, await file.arrayBuffer());

	const response: UploadUrlResponse = {
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
		quota: createQuotaSummary(nextUsedBytes),
	};

	return json(response);
};
