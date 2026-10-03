import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { sumStoredAssetBytes } from '#features/shaders/model/shader-content.js';
import {
	SHADER_USER_QUOTA_BYTES,
	createQuotaSummary,
	type UploadUrlRequest,
	type UploadUrlResponse,
	formatBytes,
	getBinaryChannelTypeFromMime,
	validateBinaryAssetMetadata,
} from '#features/shaders/assets/shader-asset-policy.js';
import { authenticatePocketBaseRequest } from '#lib/server/pocketbase-auth.js';
import { putR2Asset } from '#lib/server/r2.js';

function errorResponse(message: string): Response {
	return Response.json({ error: message }, { status: 400 });
}

export const POST: RequestHandler = async ({ request }) => {
	const { pb, user } = await authenticatePocketBaseRequest(request);

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return errorResponse('Invalid upload payload.');
	}

	const file = formData.get('file');
	if (!(file instanceof File)) return errorResponse('Missing file in upload payload.');

	let body: UploadUrlRequest;
	try {
		/** The declared size is replaced by the real one, quota checks must never trust client metadata. */
		body = { ...(JSON.parse(String(formData.get('metadata'))) as UploadUrlRequest), size: file.size };
	} catch {
		return errorResponse('Invalid upload metadata.');
	}

	const validationError = validateBinaryAssetMetadata(body);
	if (validationError) return errorResponse(validationError);

	const kind = getBinaryChannelTypeFromMime(body.mime);
	if (!kind) return errorResponse('Unsupported asset type.');

	const ignoredKeys = new Set(body.replacingKey ? [body.replacingKey] : []);
	const userShaders = await pb.collection('shaders').getFullList({
		fields: 'content',
		filter: pb.filter('user_id = {:userId}', { userId: user.id }),
	});
	const nextUsedBytes = userShaders.reduce((total, shader) => total + sumStoredAssetBytes(shader.content, ignoredKeys), body.size);
	if (nextUsedBytes > SHADER_USER_QUOTA_BYTES) {
		return errorResponse(`Storage quota exceeded. Free accounts are limited to ${formatBytes(SHADER_USER_QUOTA_BYTES)}.`);
	}

	const { key, publicUrl } = await putR2Asset(env.ASSETS_STORAGE, { userId: user.id, filename: body.filename, mime: body.mime }, file);

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
		quota: createQuotaSummary(nextUsedBytes),
	} satisfies UploadUrlResponse);
};
