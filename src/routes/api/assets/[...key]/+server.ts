import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { streamR2Asset } from '$lib/server/r2';

function getBucket(platform: App.Platform | undefined) {
	const bucket = platform?.env.ASSETS_STORAGE;
	if (!bucket) error(503, 'Storage unavailable.');
	return bucket;
}

export const GET: RequestHandler = async ({ params, request, platform }) => {
	return streamR2Asset(getBucket(platform), params.key, request, 'GET');
};

export const HEAD: RequestHandler = async ({ params, request, platform }) => {
	return streamR2Asset(getBucket(platform), params.key, request, 'HEAD');
};
