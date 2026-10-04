import { error } from '@sveltejs/kit';
import { env, waitUntil } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import type { ShadersVisiblityOptions, TypedPocketBase } from '#lib/pocketbase-types.js';
import {
	type PersistedShaderChannel,
	type ShaderContentDocument,
	buildShaderContentDocument,
	deserializeShaderContent,
	extractStoredAssetKeys,
	isRecord,
} from '#features/shaders/model/shader-content.js';
import { buildShaderAssetUrl } from '#features/shaders/assets/shader-asset-url.js';
import { getBinaryChannelTypeFromMime, validateBinaryAssetMetadata } from '#features/shaders/assets/shader-asset-policy.js';
import { authenticatePocketBaseRequest } from '#lib/server/pocketbase-auth.js';
import { copyR2Asset, deleteR2Objects, getObjectHead, getUserAssetPrefix } from '#lib/server/r2.js';
import { assertWithinQuota, deleteUnreferencedAssets, readAssetStorage } from '#lib/server/shader-assets.js';

type Visibility = keyof typeof ShadersVisiblityOptions;
type BinaryChannel = Extract<PersistedShaderChannel, { key: string }>;

interface SaveBody {
	cleanupKeys: string[];
	content: ShaderContentDocument;
	description: string;
	/** Source shader of a fork, its assets get copied under the forker's prefix instead of being shared. */
	forkOf: string | null;
	name: string;
	shaderId: string | null;
	visiblity: Visibility | null;
}

const VISIBILITIES = ['public', 'unlisted', 'private'] as const satisfies readonly Visibility[];

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseSaveBody(value: unknown): SaveBody {
	if (!isRecord(value)) error(400, 'Invalid shader payload.');

	const name = asString(value.name)?.trim();
	if (!name) error(400, 'Shader name is required.');

	return {
		cleanupKeys: Array.isArray(value.cleanupKeys) ? value.cleanupKeys.filter((key) => typeof key === 'string') : [],
		content: deserializeShaderContent(value.content),
		description: asString(value.description)?.trim() ?? '',
		forkOf: asString(value.forkOf),
		name,
		shaderId: asString(value.shaderId),
		visiblity: VISIBILITIES.find((visibility) => visibility === value.visiblity) ?? null,
	};
}

function isBinaryChannel(channel: PersistedShaderChannel): channel is BinaryChannel {
	return channel.type === 'texture' || channel.type === 'video';
}

function getShader(pb: TypedPocketBase, id: string) {
	return pb.collection('shaders')
		.getOne(id, { fields: 'id,user_id,content,visiblity' })
		.catch(() => error(404, 'Shader not found.'));
}

/** Like deletion, only keys under the owner's prefix are trusted, content may have been written straight to PocketBase. */
function listOwnedAssetKeys(shader: { content: unknown; user_id: string }): Set<string> {
	const prefix = getUserAssetPrefix(shader.user_id);
	return new Set(extractStoredAssetKeys(shader.content).filter((key) => key.startsWith(prefix)));
}

/** Mime, size and URL are re-read from R2 so they never come from the client. */
async function verifyChannel(bucket: R2Bucket, channel: PersistedShaderChannel, userId: string, forkedKeys: Set<string>): Promise<PersistedShaderChannel> {
	if (!isBinaryChannel(channel)) return channel;
	if (!forkedKeys.has(channel.key) && !channel.key.startsWith(getUserAssetPrefix(userId))) error(400, `CH${channel.id}: Invalid asset reference.`);

	const objectHead = await getObjectHead(bucket, channel.key);
	const validationError = validateBinaryAssetMetadata({
		mime: objectHead.mime,
		size: objectHead.size,
		width: channel.width ?? null,
		height: channel.height ?? null,
		durationSeconds: channel.durationSeconds ?? null,
	});
	if (validationError) error(400, `CH${channel.id}: ${validationError}`);

	const resolvedKind = getBinaryChannelTypeFromMime(objectHead.mime);
	if (!resolvedKind) error(400, `CH${channel.id}: Unsupported stored asset type.`);
	if ((resolvedKind === 'image') !== (channel.type === 'texture')) error(400, `CH${channel.id}: Stored asset type does not match the channel type.`);

	return { ...channel, url: objectHead.url, mime: objectHead.mime, size: objectHead.size };
}

/** Copies the fork source's assets once each, after checking they fit in the user's quota. */
async function copyForkedAssets(pb: TypedPocketBase, bucket: R2Bucket, userId: string, channels: BinaryChannel[]): Promise<Map<string, string>> {
	const sizes = new Map(channels.map((channel) => [channel.key, channel.size]));
	const storage = await readAssetStorage(pb, bucket, userId);
	assertWithinQuota(storage.usedBytes + sizes.values().reduce((total, size) => total + size, 0));
	if (storage.staleKeys.length > 0) waitUntil(deleteR2Objects(bucket, storage.staleKeys).catch((err) => console.error('Failed to delete stale assets:', err)));

	return new Map(await Promise.all(sizes.keys().map(async (key) => [key, await copyR2Asset(bucket, key, userId)] as const)));
}

export const POST: RequestHandler = async ({ request }) => {
	const bucket = env.ASSETS_STORAGE;
	const { pb, user } = await authenticatePocketBaseRequest(request);
	const body = parseSaveBody(await request.json().catch(() => null));

	const [previousRecord, forkSource] = await Promise.all([
		body.shaderId ? getShader(pb, body.shaderId) : null,
		!body.shaderId && body.forkOf ? getShader(pb, body.forkOf) : null,
	]);
	if (previousRecord && previousRecord.user_id !== user.id) error(403, 'Unauthorized.');

	const forkedKeys = forkSource ? listOwnedAssetKeys(forkSource) : new Set<string>();
	const verifiedChannels = await Promise.all(body.content.channels.map((channel) => verifyChannel(bucket, channel, user.id, forkedKeys)));

	const channelsToCopy = verifiedChannels.filter((channel): channel is BinaryChannel => isBinaryChannel(channel) && forkedKeys.has(channel.key));
	const copiedKeys = channelsToCopy.length > 0 ? await copyForkedAssets(pb, bucket, user.id, channelsToCopy) : new Map<string, string>();
	const channels = verifiedChannels.map((channel) => {
		const copiedKey = isBinaryChannel(channel) ? copiedKeys.get(channel.key) : undefined;
		return copiedKey ? { ...channel, key: copiedKey, url: buildShaderAssetUrl(copiedKey) } : channel;
	});

	const content = buildShaderContentDocument(body.content.buffers, channels);
	const payload = {
		content,
		name: body.name,
		description: body.description,
		visiblity: body.visiblity ?? previousRecord?.visiblity ?? 'public',
		user_id: user.id,
	};
	const record = previousRecord
		? await pb.collection('shaders').update(previousRecord.id, payload)
		: await pb.collection('shaders').create(payload);

	const nextKeys = new Set(extractStoredAssetKeys(content));
	const replacedKeys = [...(previousRecord ? extractStoredAssetKeys(previousRecord.content) : []), ...body.cleanupKeys].filter((key) => !nextKeys.has(key));
	if (replacedKeys.length > 0) {
		waitUntil(deleteUnreferencedAssets(pb, bucket, user.id, replacedKeys).catch((err) => console.error('Failed to clean up replaced shader assets:', err)));
	}

	return Response.json({ success: true, record });
};
