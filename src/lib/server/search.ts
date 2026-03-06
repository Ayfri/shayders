import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { ShadersResponse, TypedPocketBase, UsersResponse } from '$lib/pocketbase-types';
import {
	SEARCH_PAGE_SHADER_LIMIT,
	SEARCH_PAGE_USER_LIMIT,
	normalizeSearchQuery,
	type SearchShaderMatch,
	type SearchUserMatch,
	type SiteSearchResults,
} from '$lib/search';
import { deserializeShaderContent, hydrateChannels } from '$lib/shader-content';
import { getUserProfilePath } from '$lib/site';
import PocketBase from 'pocketbase';

interface SearchSiteOptions {
	shaderLimit?: number;
	userLimit?: number;
}

type ExpandedShader = ShadersResponse<unknown, { user_id?: UsersResponse }>;

const searchCollator = new Intl.Collator('en-US', {
	numeric: true,
	sensitivity: 'base',
});

function createPocketBaseClient(): TypedPocketBase {
	return new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
}

function createEmptySearchResults(query: string | null | undefined): SiteSearchResults {
	const normalized = normalizeSearchQuery(query);

	return {
		hasQuery: normalized.length > 0,
		query: normalized,
		shaders: [],
		totalShaders: 0,
		totalUsers: 0,
		users: [],
	};
}

function getUserDisplayName(user: Pick<UsersResponse, 'name' | 'username'> | null | undefined): string {
	const name = user?.name?.trim();
	if (name) {
		return name;
	}

	const username = user?.username?.trim();
	if (username) {
		return username;
	}

	return 'Unknown';
}

function getUserAvatarUrl(pb: TypedPocketBase, user: Pick<UsersResponse, 'avatar' | 'id'>): string | null {
	return user.avatar ? `${pb.baseURL}/api/files/users/${user.id}/${user.avatar}` : null;
}

function normalizeForRanking(value: string): string {
	return value.trim().toLocaleLowerCase('en-US');
}

function scoreMatch(value: string, query: string): number {
	const normalizedValue = normalizeForRanking(value);
	if (!normalizedValue) {
		return Number.POSITIVE_INFINITY;
	}

	if (normalizedValue === query) {
		return 0;
	}

	if (normalizedValue.startsWith(query)) {
		return 1;
	}

	if (normalizedValue.split(/[\s._-]+/).some((part) => part.startsWith(query))) {
		return 2;
	}

	if (normalizedValue.includes(query)) {
		return 3;
	}

	return 4;
}

function compareUsers(left: SearchUserMatch, right: SearchUserMatch, normalizedQuery: string): number {
	const leftScore = Math.min(
		scoreMatch(left.displayName, normalizedQuery),
		scoreMatch(left.username, normalizedQuery),
	);
	const rightScore = Math.min(
		scoreMatch(right.displayName, normalizedQuery),
		scoreMatch(right.username, normalizedQuery),
	);
	if (leftScore !== rightScore) {
		return leftScore - rightScore;
	}

	const byDisplayName = searchCollator.compare(left.displayName, right.displayName);
	if (byDisplayName !== 0) {
		return byDisplayName;
	}

	return searchCollator.compare(left.username, right.username);
}

function compareShaders(left: SearchShaderMatch, right: SearchShaderMatch, normalizedQuery: string): number {
	const leftNameScore = scoreMatch(left.name, normalizedQuery);
	const rightNameScore = scoreMatch(right.name, normalizedQuery);
	if (leftNameScore !== rightNameScore) {
		return leftNameScore - rightNameScore;
	}

	const leftAuthorScore = Math.min(
		scoreMatch(left.authorName, normalizedQuery),
		scoreMatch(left.authorUsername, normalizedQuery),
	);
	const rightAuthorScore = Math.min(
		scoreMatch(right.authorName, normalizedQuery),
		scoreMatch(right.authorUsername, normalizedQuery),
	);
	if (leftAuthorScore !== rightAuthorScore) {
		return leftAuthorScore - rightAuthorScore;
	}

	const byCreated = right.created.localeCompare(left.created);
	if (byCreated !== 0) {
		return byCreated;
	}

	return searchCollator.compare(left.name, right.name);
}

function mapUser(pb: TypedPocketBase, user: UsersResponse): SearchUserMatch {
	return {
		avatarUrl: getUserAvatarUrl(pb, user),
		displayName: getUserDisplayName(user),
		id: user.id,
		profilePath: getUserProfilePath(user.id),
		username: user.username?.trim() ?? '',
	};
}

function mapShader(pb: TypedPocketBase, shader: ExpandedShader): SearchShaderMatch {
	const author = shader.expand?.user_id;
	const content = deserializeShaderContent(shader.content);

	return {
		authorId: shader.user_id,
		authorName: getUserDisplayName(author),
		authorProfilePath: getUserProfilePath(shader.user_id),
		authorUsername: author?.username?.trim() ?? '',
		buffers: content.buffers,
		channels: hydrateChannels(shader.content),
		created: shader.created,
		description: shader.description ?? '',
		id: shader.id,
		name: shader.name,
	};
}

async function fetchUserMatches(pb: TypedPocketBase, query: string, limit: number) {
	const fetchLimit = Math.max(limit * 3, 12);

	return pb.collection('users').getList(1, fetchLimit, {
		filter: pb.filter('name ~ {:query}', { query }),
		sort: 'name',
	});
}

async function fetchShaderMatches(pb: TypedPocketBase, query: string, limit: number) {
	const fetchLimit = Math.max(limit * 3, 24);

	return pb.collection('shaders').getList(1, fetchLimit, {
		expand: 'user_id',
		filter: pb.filter(
			'visiblity = "public" && (name ~ {:query} || user_id.name ~ {:query})',
			{ query },
		),
		sort: '-created,name',
	});
}

export async function searchSite(
	query: string | null | undefined,
	options: SearchSiteOptions = {},
): Promise<SiteSearchResults> {
	const normalizedQuery = normalizeSearchQuery(query);
	if (!normalizedQuery) {
		return createEmptySearchResults(query);
	}

	const pb = createPocketBaseClient();
	const shaderLimit = options.shaderLimit ?? SEARCH_PAGE_SHADER_LIMIT;
	const userLimit = options.userLimit ?? SEARCH_PAGE_USER_LIMIT;
	const rankingQuery = normalizeForRanking(normalizedQuery);

	const [shaderResponse, userResponse] = await Promise.all([
		fetchShaderMatches(pb, normalizedQuery, shaderLimit),
		fetchUserMatches(pb, normalizedQuery, userLimit),
	]);

	const shaders = shaderResponse.items
		.map((shader) => mapShader(pb, shader as ExpandedShader))
		.sort((left, right) => compareShaders(left, right, rankingQuery))
		.slice(0, shaderLimit);

	const users = userResponse.items
		.map((user) => mapUser(pb, user))
		.sort((left, right) => compareUsers(left, right, rankingQuery))
		.slice(0, userLimit);

	return {
		hasQuery: true,
		query: normalizedQuery,
		shaders,
		totalShaders: shaderResponse.totalItems,
		totalUsers: userResponse.totalItems,
		users,
	};
}
