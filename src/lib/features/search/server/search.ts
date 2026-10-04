import { createPocketBase, getAvatarUrl } from '#lib/pocketbase.js';
import type { ShadersResponse, TypedPocketBase, UsersResponse } from '#lib/pocketbase-types.js';
import {
	SEARCH_PAGE_SHADER_LIMIT,
	SEARCH_PAGE_USER_LIMIT,
	normalizeSearchQuery,
	type SearchShaderMatch,
	type SearchUserMatch,
	type SiteSearchResults,
} from '../search.js';
import { deserializeShaderContent, hydrateChannels } from '#features/shaders/model/shader-content.js';
import { getUserProfilePath } from '#lib/site.js';

interface SearchSiteOptions {
	shaderLimit?: number;
	userLimit?: number;
	/** The header preview never shows totals, skipping them saves PocketBase a COUNT query per collection. */
	withTotals?: boolean;
}

type ExpandedShader = ShadersResponse<unknown, { user_id?: Pick<UsersResponse, 'name'> }>;

const SHADER_FIELDS = 'id,name,description,created,user_id,content,expand.user_id.name';
const USER_FIELDS = 'id,name,avatar';

const searchCollator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

function getUserDisplayName(name: string | null | undefined): string {
	return name?.trim() || 'Unknown';
}

/** Lower is better: exact, prefix, word prefix, substring, then no direct match (matched through the author). */
function scoreMatch(value: string, query: string): number {
	const normalizedValue = value.trim().toLocaleLowerCase('en-US');
	if (normalizedValue === query) return 0;
	if (normalizedValue.startsWith(query)) return 1;
	if (normalizedValue.split(/[\s._-]+/).some((part) => part.startsWith(query))) return 2;
	if (normalizedValue.includes(query)) return 3;
	return 4;
}

function rank<T>(items: T[], score: (item: T) => number, tieBreak: (left: T, right: T) => number): T[] {
	return items
		.map((item) => ({ item, score: score(item) }))
		.sort((left, right) => left.score - right.score || tieBreak(left.item, right.item))
		.map(({ item }) => item);
}

function mapUser(user: Pick<UsersResponse, 'avatar' | 'id' | 'name'>): SearchUserMatch {
	return {
		avatarUrl: getAvatarUrl(user),
		displayName: getUserDisplayName(user.name),
		id: user.id,
		profilePath: getUserProfilePath(user.id),
	};
}

function mapShader(shader: ExpandedShader): SearchShaderMatch {
	return {
		authorName: getUserDisplayName(shader.expand?.user_id?.name),
		authorProfilePath: getUserProfilePath(shader.user_id),
		buffers: deserializeShaderContent(shader.content).buffers,
		channels: hydrateChannels(shader.content),
		created: shader.created,
		description: shader.description ?? '',
		id: shader.id,
		name: shader.name,
	};
}

/** Twice the shown count is fetched so the relevance ranking has candidates beyond PocketBase's date order. */
function fetchShaderMatches(pb: TypedPocketBase, query: string, limit: number, withTotals: boolean) {
	return pb.collection('shaders').getList<ExpandedShader>(1, limit * 2, {
		expand: 'user_id',
		fields: SHADER_FIELDS,
		filter: pb.filter('visiblity = "public" && (name ~ {:query} || user_id.name ~ {:query})', { query }),
		skipTotal: !withTotals,
		sort: '-created',
	});
}

function fetchUserMatches(pb: TypedPocketBase, query: string, limit: number, withTotals: boolean) {
	return pb.collection('users').getList(1, limit * 2, {
		fields: USER_FIELDS,
		filter: pb.filter('name ~ {:query}', { query }),
		skipTotal: !withTotals,
		sort: 'name',
	});
}

export async function searchSite(query: string | null | undefined, options: SearchSiteOptions = {}): Promise<SiteSearchResults> {
	const normalizedQuery = normalizeSearchQuery(query);
	if (!normalizedQuery) {
		return { hasQuery: false, query: '', shaders: [], totalShaders: 0, totalUsers: 0, users: [] };
	}

	const pb = createPocketBase();
	const { shaderLimit = SEARCH_PAGE_SHADER_LIMIT, userLimit = SEARCH_PAGE_USER_LIMIT, withTotals = true } = options;
	const rankingQuery = normalizedQuery.toLocaleLowerCase('en-US');

	const [shaderResponse, userResponse] = await Promise.all([
		fetchShaderMatches(pb, normalizedQuery, shaderLimit, withTotals),
		fetchUserMatches(pb, normalizedQuery, userLimit, withTotals),
	]);

	/** Ranked on the raw records so only the shown shaders pay for content deserialization. */
	const shaders = rank(
		shaderResponse.items,
		(shader) => scoreMatch(shader.name, rankingQuery) * 5 + scoreMatch(shader.expand?.user_id?.name ?? '', rankingQuery),
		(left, right) => right.created.localeCompare(left.created) || searchCollator.compare(left.name, right.name),
	).slice(0, shaderLimit).map(mapShader);
	const users = rank(
		userResponse.items.map(mapUser),
		(user) => scoreMatch(user.displayName, rankingQuery),
		(left, right) => searchCollator.compare(left.displayName, right.displayName),
	).slice(0, userLimit);

	return {
		hasQuery: true,
		query: normalizedQuery,
		shaders,
		totalShaders: withTotals ? shaderResponse.totalItems : shaders.length,
		totalUsers: withTotals ? userResponse.totalItems : users.length,
		users,
	};
}
