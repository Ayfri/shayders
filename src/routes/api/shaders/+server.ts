import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ShadersVisiblityOptions } from '$lib/pocketbase-types';
import {
	type ChannelEntry,
	type PersistedShaderChannel,
	type ShaderBuffer,
	buildShaderContentDocument,
	extractStoredAssetKeys,
	listUnpersistedBinaryChannels,
	serializeShaderContent,
	sumStoredAssetBytes,
	} from '$lib/shader-content';
import {
	SHADER_USER_QUOTA_BYTES,
	formatBytes,
	getBinaryChannelTypeFromMime,
	validateBinaryAssetMetadata,
} from '$lib/shader-asset-policy';
import { authenticatePocketBaseRequest } from '$lib/server/pocketbase-auth';
import { deleteR2Objects, getOwnedObjectHead } from '$lib/server/r2';

interface SaveBody {
	shaderId?: string;
	name: string;
	description?: string;
	visiblity?: string;
	buffers?: ShaderBuffer[];
	channels?: ChannelEntry[];
	cleanupKeys?: string[];
}

function normalizeVisibility(value: string | undefined): keyof typeof ShadersVisiblityOptions {
	if (value === 'public' || value === 'unlisted' || value === 'private') {
		return value;
	}

	return 'public';
}

async function verifyPersistedChannels(
	channels: PersistedShaderChannel[],
	userId: string,
	bucket: R2Bucket,
): Promise<PersistedShaderChannel[]> {
	const verified: PersistedShaderChannel[] = [];

	for (const channel of channels) {
		if (channel.type === 'buffer' || channel.type === 'webcam') {
			verified.push(channel);
			continue;
		}

		const objectHead = await getOwnedObjectHead(bucket, channel.key, userId);
		const validationError = validateBinaryAssetMetadata({
			mime: objectHead.mime,
			size: objectHead.size,
			width: channel.width ?? null,
			height: channel.height ?? null,
			durationSeconds: channel.durationSeconds ?? null,
		});
		if (validationError) {
			throw new Error(`CH${channel.id}: ${validationError}`);
		}

		const resolvedKind = getBinaryChannelTypeFromMime(objectHead.mime);
		if (!resolvedKind) {
			throw new Error(`CH${channel.id}: Unsupported stored asset type.`);
		}

		if (
			(resolvedKind === 'image' && channel.type !== 'texture')
			|| (resolvedKind === 'video' && channel.type !== 'video')
		) {
			throw new Error(`CH${channel.id}: Stored asset type does not match the channel type.`);
		}

		verified.push({
			...channel,
			url: objectHead.url,
			mime: objectHead.mime,
			size: objectHead.size,
		});
	}

	return verified;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const bucket = platform?.env.ASSETS_STORAGE;
	if (!bucket) return json({ error: 'Storage unavailable.' }, { status: 503 });

	const { pb, user } = await authenticatePocketBaseRequest(request);

	let body: SaveBody;
	try {
		body = (await request.json()) as SaveBody;
	} catch {
		return json({ error: 'Invalid shader payload.' }, { status: 400 });
	}

	const name = body.name?.trim();
	if (!name) {
		return json({ error: 'Shader name is required.' }, { status: 400 });
	}

	const buffers = Array.isArray(body.buffers) ? body.buffers : [];
	const channels = Array.isArray(body.channels) ? body.channels : [];
	const localChannelIds = listUnpersistedBinaryChannels(channels);
	if (localChannelIds.length > 0) {
		return json({
			error: `Upload channel assets before saving: ${localChannelIds.map((id) => `CH${id}`).join(', ')}.`,
		}, { status: 400 });
	}

	let previousRecord: { id: string; user_id: string; content: unknown } | null = null;
	if (body.shaderId) {
		try {
			previousRecord = await pb.collection('shaders').getOne(body.shaderId);
		} catch {
			return json({ error: 'Shader not found.' }, { status: 404 });
		}

		if (!previousRecord || previousRecord.user_id !== user.id) {
			return json({ error: 'Unauthorized.' }, { status: 403 });
		}
	}

	let verifiedChannels: PersistedShaderChannel[];
	try {
		const serialized = serializeShaderContent(buffers, channels);
		verifiedChannels = await verifyPersistedChannels(serialized.channels, user.id, bucket);
	} catch (err) {
		return json({
			error: err instanceof Error ? err.message : 'Failed to verify uploaded assets.',
		}, { status: 400 });
	}

	const content = buildShaderContentDocument(buffers, verifiedChannels);
	const userShaders = await pb.collection('shaders').getFullList({
		filter: pb.filter('user_id = {:userId}', { userId: user.id }),
	});
	const currentShaderBytes = verifiedChannels.reduce(
		(total, channel) => total + (channel.type === 'buffer' || channel.type === 'webcam' ? 0 : channel.size),
		0,
	);
	const otherShaderBytes = userShaders.reduce((total, shader) => {
		if (previousRecord && shader.id === previousRecord.id) {
			return total;
		}

		return total + sumStoredAssetBytes(shader.content);
	}, 0);

	if (otherShaderBytes + currentShaderBytes > SHADER_USER_QUOTA_BYTES) {
		return json({
			error: `Storage quota exceeded. Free accounts are limited to ${formatBytes(SHADER_USER_QUOTA_BYTES)}.`,
		}, { status: 400 });
	}

	const payload = {
		content,
		name,
		description: body.description?.trim() ?? '',
		visiblity: normalizeVisibility(body.visiblity),
		user_id: user.id,
	};

	let record;
	if (previousRecord) {
		record = await pb.collection('shaders').update(previousRecord.id, payload);
	} else {
		record = await pb.collection('shaders').create(payload);
	}

	const nextKeys = new Set(extractStoredAssetKeys(content));
	const removedKeys = previousRecord
		? extractStoredAssetKeys(previousRecord.content).filter((key) => !nextKeys.has(key))
		: [];
	const cleanupKeys = Array.isArray(body.cleanupKeys)
		? body.cleanupKeys.filter((key): key is string => typeof key === 'string' && !nextKeys.has(key))
		: [];
	const keysToDelete = [...new Set([...removedKeys, ...cleanupKeys])];

	if (keysToDelete.length > 0) {
		deleteR2Objects(bucket, keysToDelete).catch((err) => {
			console.error('Failed to clean up replaced shader assets:', err);
		});
	}

	return json({ success: true, record });
	};
