import { env, waitUntil } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { extractStoredAssetKeys } from '#features/shaders/model/shader-content.js';
import type { ShadersResponse } from '#lib/pocketbase-types.js';
import { authenticatePocketBaseRequest } from '#lib/server/pocketbase-auth.js';
import { deleteR2Objects } from '#lib/server/r2.js';

export const DELETE: RequestHandler = async ({ request, params }) => {
	const { pb, user } = await authenticatePocketBaseRequest(request);

	let shader: ShadersResponse;
	try {
		shader = await pb.collection('shaders').getOne(params.id);
	} catch {
		return Response.json({ error: 'Shader not found.' }, { status: 404 });
	}

	if (shader.user_id !== user.id) {
		return Response.json({ error: 'Unauthorized.' }, { status: 403 });
	}

	const assetKeys = extractStoredAssetKeys(shader.content);
	await pb.collection('shaders').delete(params.id);
	waitUntil(deleteR2Objects(env.ASSETS_STORAGE, assetKeys).catch((err) => console.error('Failed to delete shader assets from R2:', err)));

	return Response.json({ success: true });
};
