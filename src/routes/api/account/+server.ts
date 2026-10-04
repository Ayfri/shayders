import { env, waitUntil } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { authenticatePocketBaseRequest } from '#lib/server/pocketbase-auth.js';
import { deleteR2Prefix } from '#lib/server/r2.js';

/** `shaders.user_id` doesn't cascade, so the shaders go first, then the user, then every asset under the user's R2 prefix. */
export const DELETE: RequestHandler = async ({ request }) => {
	const { pb, user } = await authenticatePocketBaseRequest(request);

	const shaders = await pb.collection('shaders').getFullList({
		fields: 'id',
		filter: pb.filter('user_id = {:userId}', { userId: user.id }),
	});
	await Promise.all(shaders.map((shader) => pb.collection('shaders').delete(shader.id)));
	await pb.collection('users').delete(user.id);
	waitUntil(deleteR2Prefix(env.ASSETS_STORAGE, `users/${user.id}/`).catch((err) => console.error('Failed to delete account assets from R2:', err)));

	return Response.json({ success: true });
};
