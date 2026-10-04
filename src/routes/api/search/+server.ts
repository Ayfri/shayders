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

export const GET: RequestHandler = async ({ url }) => {
	const query = normalizeSearchQuery(url.searchParams.get('q'));
	const results: SiteSearchResults = query.length < SEARCH_PREVIEW_MIN_QUERY_LENGTH
		? { hasQuery: query.length > 0, query, shaders: [], totalShaders: 0, totalUsers: 0, users: [] }
		: await searchSite(query, { shaderLimit: SEARCH_PREVIEW_SHADER_LIMIT, userLimit: SEARCH_PREVIEW_USER_LIMIT, withTotals: false });

	return Response.json(results, { headers: CACHE_HEADERS });
};
