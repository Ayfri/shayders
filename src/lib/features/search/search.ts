import type { ChannelEntry, ShaderBuffer } from '#features/shaders/model/shader-content.js';
import { SITE_SEARCH_PATH } from '#lib/site.js';

export const SEARCH_PAGE_SHADER_LIMIT = 24;
export const SEARCH_PAGE_USER_LIMIT = 12;
export const SEARCH_PREVIEW_MIN_QUERY_LENGTH = 2;
export const SEARCH_PREVIEW_SHADER_LIMIT = 4;
export const SEARCH_PREVIEW_USER_LIMIT = 4;
export const SEARCH_QUERY_MAX_LENGTH = 64;

export interface SearchShaderMatch {
	authorName: string;
	authorProfilePath: string;
	buffers: ShaderBuffer[];
	channels: ChannelEntry[];
	created: string;
	description: string;
	id: string;
	name: string;
}

export interface SearchUserMatch {
	avatarUrl: string | null;
	displayName: string;
	id: string;
	profilePath: string;
}

export interface SiteSearchResults {
	hasQuery: boolean;
	query: string;
	shaders: SearchShaderMatch[];
	totalShaders: number;
	totalUsers: number;
	users: SearchUserMatch[];
}

export function normalizeSearchQuery(value: string | null | undefined): string {
	return (value ?? '')
		.trim()
		.replace(/\s+/g, ' ')
		.slice(0, SEARCH_QUERY_MAX_LENGTH);
}

export function buildSearchHref(query: string): string {
	const normalized = normalizeSearchQuery(query);
	if (!normalized) {
		return SITE_SEARCH_PATH;
	}

	const params = new URLSearchParams({ q: normalized });
	return `${SITE_SEARCH_PATH}?${params}`;
}

/**
 * Splits text around the case-insensitive matches of `query` so the UI can highlight them.
 * @example splitMatches('Water Noise', 'no') === [{ match: false, text: 'Water ' }, { match: true, text: 'No' }, { match: false, text: 'ise' }]
 */
export function splitMatches(text: string, query: string): { match: boolean; text: string }[] {
	const needle = query.toLocaleLowerCase('en-US');
	if (!needle) return [{ match: false, text }];

	const haystack = text.toLocaleLowerCase('en-US');
	const parts: { match: boolean; text: string }[] = [];
	let cursor = 0;
	for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, cursor)) {
		if (index > cursor) parts.push({ match: false, text: text.slice(cursor, index) });
		parts.push({ match: true, text: text.slice(index, index + needle.length) });
		cursor = index + needle.length;
	}
	if (cursor < text.length) parts.push({ match: false, text: text.slice(cursor) });
	return parts;
}
