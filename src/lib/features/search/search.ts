import type { ChannelEntry, ShaderBuffer } from '$features/shaders/model/shader-content';
import { SITE_SEARCH_PATH } from '$lib/site';

export const SEARCH_PAGE_SHADER_LIMIT = 24;
export const SEARCH_PAGE_USER_LIMIT = 12;
export const SEARCH_PREVIEW_MIN_QUERY_LENGTH = 2;
export const SEARCH_PREVIEW_SHADER_LIMIT = 4;
export const SEARCH_PREVIEW_USER_LIMIT = 4;
export const SEARCH_QUERY_MAX_LENGTH = 64;

export interface SearchShaderMatch {
	authorId: string;
	authorName: string;
	authorProfilePath: string;
	authorUsername: string;
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
	username: string;
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

