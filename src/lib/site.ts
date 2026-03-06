export const SITE_NAME = 'Shayders';
export const SITE_URL = 'https://shayders.ayfri.com';
export const SITE_SEARCH_PATH = '/search';
export const SITE_SEARCH_URL_TEMPLATE = `${SITE_URL}${SITE_SEARCH_PATH}?q={search_term_string}`;

export function buildSiteUrl(pathOrUrl: string): string {
	if (/^https?:\/\//i.test(pathOrUrl)) {
		return pathOrUrl;
	}

	const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
	return new URL(path, SITE_URL).toString();
}

export function getUserProfilePath(userId: string): string {
	return `/users/${userId}`;
}
