import { dev } from '$app/env';
import { isHttpError } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { streamR2Asset } from '#lib/server/r2.js';
import { buildSiteUrl } from '#lib/site.js';

/**
 * `vite dev` binds R2 to Wrangler's empty local bucket, so in dev a missing asset is read through from production.
 * Read-only on purpose: a `remote = true` binding would also send dev uploads and deletes to the production bucket.
 */
async function serveAsset(key: string, request: Request, method: 'GET' | 'HEAD'): Promise<Response> {
	try {
		return await streamR2Asset(env.ASSETS_STORAGE, key, request, method);
	} catch (err) {
		if (!dev || !isHttpError(err, 404)) throw err;
		const range = request.headers.get('range');
		const response = await fetch(buildSiteUrl(`/api/assets/${key}`), { headers: range ? { range } : {}, method });
		return new Response(response.body, response);
	}
}

export const GET: RequestHandler = ({ params, request }) => serveAsset(params.key, request, 'GET');

export const HEAD: RequestHandler = ({ params, request }) => serveAsset(params.key, request, 'HEAD');
