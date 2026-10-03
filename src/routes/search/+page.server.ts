import { SEARCH_PAGE_SHADER_LIMIT, SEARCH_PAGE_USER_LIMIT } from '#features/search/search.js';
import { searchSite } from '#features/search/server/search.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
	return searchSite(url.searchParams.get('q'), {
		shaderLimit: SEARCH_PAGE_SHADER_LIMIT,
		userLimit: SEARCH_PAGE_USER_LIMIT,
	});
};

