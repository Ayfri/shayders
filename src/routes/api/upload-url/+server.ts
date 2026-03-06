import { json } from '@sveltejs/kit';
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
import { createPresignedUploadUrl } from '$lib/server/r2';

export const POST: RequestHandler = async ({ request }) => {
	const { pb, user } = await authenticatePocketBaseRequest(request);

	let body: UploadUrlRequest;
	try {
		body = (await request.json()) as UploadUrlRequest;
	} catch {
		return json({ error: 'Invalid upload payload.' }, { status: 400 });
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

	const signedUpload = await createPresignedUploadUrl({
		userId: user.id,
		filename: body.filename,
		mime: body.mime,
	});

	const response: UploadUrlResponse = {
		uploadUrl: signedUpload.uploadUrl,
		headers: signedUpload.headers,
		asset: {
			type: kind,
			url: signedUpload.publicUrl,
			name: body.filename,
			mime: body.mime,
			size: body.size,
			storageKey: signedUpload.key,
			width: body.width ?? null,
			height: body.height ?? null,
			durationSeconds: body.durationSeconds ?? null,
		},
		quota: createQuotaSummary(nextUsedBytes),
	};

	return json(response);
	};
