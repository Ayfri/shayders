import { env, waitUntil } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import type { ShadersResponse, ShadersVisiblityOptions } from '#lib/pocketbase-types.js';
import {
	type ChannelEntry,
	type PersistedShaderChannel,
	type ShaderBuffer,
	buildShaderContentDocument,
	extractStoredAssetKeys,
	listUnpersistedBinaryChannels,
	serializeShaderContent,
	sumStoredAssetBytes,
} from '#features/shaders/model/shader-content.js';
import {
	SHADER_USER_QUOTA_BYTES,
	formatBytes,
	getBinaryChannelTypeFromMime,
	validateBinaryAssetMetadata,
} from '#features/shaders/assets/shader-asset-policy.js';
import { authenticatePocketBaseRequest } from '#lib/server/pocketbase-auth.js';
import { deleteR2Objects, getOwnedObjectHead } from '#lib/server/r2.js';

interface SaveBody {
	shaderId?: string;
	name: string;
	description?: string;
	visiblity?: string;
	buffers?: ShaderBuffer[];
	channels?: ChannelEntry[];
	cleanupKeys?: string[];
}

const VISIBILITIES = ['public', 'unlisted', 'private'] as const satisfies readonly (keyof typeof ShadersVisiblityOptions)[];

function normalizeVisibility(value: string | undefined): keyof typeof ShadersVisiblityOptions {
	return VISIBILITIES.find((visibility) => visibility === value) ?? 'public';
}

function errorResponse(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

async function verifyPersistedChannels(
	channels: PersistedShaderChannel[],
	userId: string,
	bucket: R2Bucket,
): Promise<PersistedShaderChannel[]> {
	return Promise.all(channels.map(async (channel) => {
		if (channel.type === 'buffer' || channel.type === 'webcam') return channel;

		const objectHead = await getOwnedObjectHead(bucket, channel.key, userId);
		const validationError = validateBinaryAssetMetadata({
			mime: objectHead.mime,
			size: objectHead.size,
			width: channel.width ?? null,
			height: channel.height ?? null,
			durationSeconds: channel.durationSeconds ?? null,
		});
		if (validationError) throw new Error(`CH${channel.id}: ${validationError}`);

		const resolvedKind = getBinaryChannelTypeFromMime(objectHead.mime);
		if (!resolvedKind) throw new Error(`CH${channel.id}: Unsupported stored asset type.`);
		if ((resolvedKind === 'image') !== (channel.type === 'texture')) {
			throw new Error(`CH${channel.id}: Stored asset type does not match the channel type.`);
		}

		return { ...channel, url: objectHead.url, mime: objectHead.mime, size: objectHead.size };
	}));
}

export const POST: RequestHandler = async ({ request }) => {
	const bucket = env.ASSETS_STORAGE;
	const { pb, user } = await authenticatePocketBaseRequest(request);

	let body: SaveBody;
	try {
		body = (await request.json()) as SaveBody;
	} catch {
		return errorResponse('Invalid shader payload.', 400);
	}

	const name = body.name?.trim();
	if (!name) return errorResponse('Shader name is required.', 400);

	const buffers = Array.isArray(body.buffers) ? body.buffers : [];
	const channels = Array.isArray(body.channels) ? body.channels : [];
	const localChannelIds = listUnpersistedBinaryChannels(channels);
	if (localChannelIds.length > 0) {
		return errorResponse(`Upload channel assets before saving: ${localChannelIds.map((id) => `CH${id}`).join(', ')}.`, 400);
	}

	let previousRecord: ShadersResponse | null = null;
	if (body.shaderId) {
		const record = await pb.collection('shaders').getOne(body.shaderId).catch(() => null);
		if (!record) return errorResponse('Shader not found.', 404);
		if (record.user_id !== user.id) return errorResponse('Unauthorized.', 403);
		previousRecord = record;
	}

	let verifiedChannels: PersistedShaderChannel[];
	try {
		verifiedChannels = await verifyPersistedChannels(serializeShaderContent(buffers, channels).channels, user.id, bucket);
	} catch (err) {
		return errorResponse(err instanceof Error ? err.message : 'Failed to verify uploaded assets.', 400);
	}

	const content = buildShaderContentDocument(buffers, verifiedChannels);
	const userShaders = await pb.collection('shaders').getFullList({
		fields: 'id,content',
		filter: pb.filter('user_id = {:userId}', { userId: user.id }),
	});
	const currentShaderBytes = verifiedChannels.reduce(
		(total, channel) => total + (channel.type === 'buffer' || channel.type === 'webcam' ? 0 : channel.size),
		0,
	);
	const otherShaderBytes = userShaders.reduce(
		(total, shader) => (shader.id === previousRecord?.id ? total : total + sumStoredAssetBytes(shader.content)),
		0,
	);
	if (otherShaderBytes + currentShaderBytes > SHADER_USER_QUOTA_BYTES) {
		return errorResponse(`Storage quota exceeded. Free accounts are limited to ${formatBytes(SHADER_USER_QUOTA_BYTES)}.`, 400);
	}

	const payload = {
		content,
		name,
		description: body.description?.trim() ?? '',
		visiblity: normalizeVisibility(body.visiblity),
		user_id: user.id,
	};
	const record = previousRecord
		? await pb.collection('shaders').update(previousRecord.id, payload)
		: await pb.collection('shaders').create(payload);

	const nextKeys = new Set(extractStoredAssetKeys(content));
	const removedKeys = previousRecord ? extractStoredAssetKeys(previousRecord.content).filter((key) => !nextKeys.has(key)) : [];
	const ownedPrefix = `users/${user.id}/`;
	const cleanupKeys = Array.isArray(body.cleanupKeys)
		? body.cleanupKeys.filter((key): key is string => typeof key === 'string' && key.startsWith(ownedPrefix) && !nextKeys.has(key))
		: [];
	const keysToDelete = [...new Set([...removedKeys, ...cleanupKeys])];
	if (keysToDelete.length > 0) {
		waitUntil(deleteR2Objects(bucket, keysToDelete).catch((err) => console.error('Failed to clean up replaced shader assets:', err)));
	}

	return Response.json({ success: true, record });
};
