import { env, waitUntil } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { authenticatePocketBaseRequest } from '#lib/server/pocketbase-auth.js';
import { deleteR2Prefix, getUserAssetPrefix } from '#lib/server/r2.js';

/** `shaders.user_id` cascades in PocketBase, so the user and their shaders go in one transaction, then every asset under their R2 prefix. */
export const DELETE: RequestHandler = async ({ request }) => {
	const { pb, user } = await authenticatePocketBaseRequest(request);

	await pb.collection('users').delete(user.id);
	waitUntil(deleteR2Prefix(env.ASSETS_STORAGE, getUserAssetPrefix(user.id)).catch((err) => console.error('Failed to delete account assets from R2:', err)));

	return Response.json({ success: true });
};
