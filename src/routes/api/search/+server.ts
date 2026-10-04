import { waitUntil } from 'cloudflare:workers';
import {
	SEARCH_PREVIEW_MIN_QUERY_LENGTH,
	SEARCH_PREVIEW_SHADER_LIMIT,
	SEARCH_PREVIEW_USER_LIMIT,
	normalizeSearchQuery,
	type SiteSearchResults,
} from '#features/search/search.js';
import { searchSite } from '#features/search/server/search.js';
import type { RequestHandler } from './$types';

const CACHE_HEADERS = { 'cache-control': 'public, max-age=60' };

/** Edge-cached on the normalized query, so every spelling of the same search shares one entry per colo. */
export const GET: RequestHandler = async ({ url }) => {
	const query = normalizeSearchQuery(url.searchParams.get('q'));
	if (query.length < SEARCH_PREVIEW_MIN_QUERY_LENGTH) {
		const results: SiteSearchResults = { hasQuery: query.length > 0, query, shaders: [], totalShaders: 0, totalUsers: 0, users: [] };
		return Response.json(results, { headers: CACHE_HEADERS });
	}

	const cacheKey = new Request(`${url.origin}${url.pathname}?${new URLSearchParams({ q: query })}`);
	const cache = await caches.open('search');
	const cached = await cache.match(cacheKey);
	if (cached) return new Response(cached.body, cached);

	const results = await searchSite(query, { shaderLimit: SEARCH_PREVIEW_SHADER_LIMIT, userLimit: SEARCH_PREVIEW_USER_LIMIT, withTotals: false });
	const response = Response.json(results, { headers: CACHE_HEADERS });
	waitUntil(cache.put(cacheKey, response.clone()));
	return response;
};
