import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractStoredAssetKeys } from '$lib/shader-content';
import { authenticatePocketBaseRequest } from '$lib/server/pocketbase-auth';
import { deleteR2Objects } from '$lib/server/r2';

export const DELETE: RequestHandler = async ({ request, params }) => {
	const { pb, user } = await authenticatePocketBaseRequest(request);

	let shader;
	try {
		shader = await pb.collection('shaders').getOne(params.id);
	} catch {
		return json({ error: 'Shader not found.' }, { status: 404 });
	}

	if (shader.user_id !== user.id) {
		return json({ error: 'Unauthorized.' }, { status: 403 });
	}

	const assetKeys = extractStoredAssetKeys(shader.content);
	await pb.collection('shaders').delete(params.id);

	deleteR2Objects(assetKeys).catch((err) => {
		console.error('Failed to delete shader assets from R2:', err);
	});

	return json({ success: true });
	};
