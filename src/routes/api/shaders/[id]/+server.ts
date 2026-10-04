import { error } from '@sveltejs/kit';
import { env, waitUntil } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { extractStoredAssetKeys } from '#features/shaders/model/shader-content.js';
import { authenticatePocketBaseRequest } from '#lib/server/pocketbase-auth.js';
import { deleteUnreferencedAssets } from '#lib/server/shader-assets.js';

export const DELETE: RequestHandler = async ({ request, params }) => {
	const { pb, user } = await authenticatePocketBaseRequest(request);

	const shader = await pb.collection('shaders')
		.getOne(params.id, { fields: 'user_id,content' })
		.catch(() => error(404, 'Shader not found.'));
	if (shader.user_id !== user.id) error(403, 'Unauthorized.');

	await pb.collection('shaders').delete(params.id);
	waitUntil(deleteUnreferencedAssets(pb, env.ASSETS_STORAGE, user.id, extractStoredAssetKeys(shader.content)).catch((err) => console.error('Failed to delete shader assets from R2:', err)));

	return Response.json({ success: true });
};
