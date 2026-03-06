import { json } from '@sveltejs/kit';
import {
	SEARCH_PREVIEW_MIN_QUERY_LENGTH,
	SEARCH_PREVIEW_SHADER_LIMIT,
	SEARCH_PREVIEW_USER_LIMIT,
	normalizeSearchQuery,
} from '$lib/search';
import { searchSite } from '$lib/server/search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const query = normalizeSearchQuery(url.searchParams.get('q'));
	if (query.length < SEARCH_PREVIEW_MIN_QUERY_LENGTH) {
		return json({
			hasQuery: query.length > 0,
			query,
			shaders: [],
			totalShaders: 0,
			totalUsers: 0,
			users: [],
		}, {
			headers: {
				'cache-control': 'public, max-age=60',
			},
		});
	}

	const results = await searchSite(query, {
		shaderLimit: SEARCH_PREVIEW_SHADER_LIMIT,
		userLimit: SEARCH_PREVIEW_USER_LIMIT,
	});

	return json(results, {
		headers: {
			'cache-control': 'public, max-age=60',
		},
	});
};
