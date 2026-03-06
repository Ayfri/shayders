import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPresignedAssetReadUrl } from '$lib/server/r2';

const PASSTHROUGH_HEADERS = [
	'accept-ranges',
	'cache-control',
	'content-length',
	'content-range',
	'content-type',
	'etag',
	'last-modified',
] as const;

async function proxyAssetRequest(request: Request, key: string, method: 'GET' | 'HEAD') {
	if (!key || !key.startsWith('users/')) {
		error(404, 'Asset not found');
	}

	const signedUrl = await createPresignedAssetReadUrl(key);
	const range = request.headers.get('range');
	const upstream = await fetch(signedUrl, {
		method,
		headers: range ? { Range: range } : undefined,
	});

	if (!upstream.ok && upstream.status !== 206) {
		throw error(upstream.status, 'Asset request failed');
	}

	const headers = new Headers();
	for (const name of PASSTHROUGH_HEADERS) {
		const value = upstream.headers.get(name);
		if (value) {
			headers.set(name, value);
		}
	}

	if (!headers.has('cache-control')) {
		headers.set('cache-control', 'public, max-age=31536000, immutable');
	}

	return new Response(method === 'HEAD' ? null : upstream.body, {
		status: upstream.status,
		headers,
	});
}

export const GET: RequestHandler = async ({ params, request }) => {
	return proxyAssetRequest(request, params.key, 'GET');
};

export const HEAD: RequestHandler = async ({ params, request }) => {
	return proxyAssetRequest(request, params.key, 'HEAD');
};
