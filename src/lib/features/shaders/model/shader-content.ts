import { buildShaderAssetUrl } from '../assets/shader-asset-url';

export interface ShaderBuffer {
	id: string;
	label: string;
	code: string;
}

export type ChannelFilter = 'linear' | 'nearest' | 'linear-mipmap';
export type ChannelWrap = 'repeat' | 'clamp';
export type BinaryChannelType = 'image' | 'video';

export interface ChannelEntry {
	id: number;
	type: BinaryChannelType | 'webcam' | 'buffer' | null;
	url: string | null;
	name: string | null;
	bufferId?: string | null;
	filter?: ChannelFilter;
	wrap?: ChannelWrap;
	vflip?: boolean;
	mime?: string | null;
	size?: number | null;
	storageKey?: string | null;
	width?: number | null;
	height?: number | null;
	durationSeconds?: number | null;
}

export type PersistedShaderChannel =
	| {
			id: number;
			type: 'buffer';
			name: string | null;
			bufferId: string;
			filter?: ChannelFilter;
			wrap?: ChannelWrap;
			vflip?: boolean;
	  }
	| {
			id: number;
			type: 'texture' | 'video';
			url: string;
			key: string;
			name: string;
			mime: string;
			size: number;
			width?: number;
			height?: number;
			durationSeconds?: number;
			filter?: ChannelFilter;
			wrap?: ChannelWrap;
			vflip?: boolean;
	  }
	| {
			id: number;
			type: 'webcam';
			filter?: ChannelFilter;
			wrap?: ChannelWrap;
			vflip?: boolean;
	  };

export interface ShaderContentDocument {
	version: 2;
	buffers: ShaderBuffer[];
	channels: PersistedShaderChannel[];
}

export interface StoredShaderAsset {
	channelId: number;
	key: string;
	url: string;
	mime: string;
	size: number;
	type: 'texture' | 'video';
}

export const CHANNEL_SLOT_IDS = [0, 1, 2, 3] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShaderBuffer(value: unknown): value is ShaderBuffer {
	return isRecord(value)
		&& typeof value.id === 'string'
		&& typeof value.label === 'string'
		&& typeof value.code === 'string';
}

function isChannelIndex(value: unknown): value is number {
	return typeof value === 'number'
		&& Number.isInteger(value)
		&& value >= 0
		&& value < CHANNEL_SLOT_IDS.length;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function asFilter(value: unknown): ChannelFilter | undefined {
	return value === 'linear' || value === 'nearest' || value === 'linear-mipmap' ? value : undefined;
}

function asWrap(value: unknown): ChannelWrap | undefined {
	return value === 'repeat' || value === 'clamp' ? value : undefined;
}

function toStoredChannel(entry: unknown): PersistedShaderChannel | null {
	if (!isRecord(entry) || !isChannelIndex(entry.id) || typeof entry.type !== 'string') {
		return null;
	}

	if (entry.type === 'buffer') {
		if (typeof entry.bufferId !== 'string' || entry.bufferId.length === 0) {
			return null;
		}

		return {
			id: entry.id,
			type: 'buffer',
			name: typeof entry.name === 'string' ? entry.name : null,
			bufferId: entry.bufferId,
			filter: asFilter(entry.filter),
			wrap: asWrap(entry.wrap),
			vflip: asBoolean(entry.vflip),
		};
	}

	if (entry.type === 'webcam') {
		return {
			id: entry.id,
			type: 'webcam',
			filter: asFilter(entry.filter),
			wrap: asWrap(entry.wrap),
			vflip: asBoolean(entry.vflip),
		};
	}

	if (entry.type !== 'texture' && entry.type !== 'video') {
		return null;
	}

	if (
		typeof entry.url !== 'string'
		|| typeof entry.key !== 'string'
		|| typeof entry.name !== 'string'
		|| typeof entry.mime !== 'string'
		|| typeof entry.size !== 'number'
	) {
		return null;
	}

	return {
		id: entry.id,
		type: entry.type,
		url: entry.url,
		key: entry.key,
		name: entry.name,
		mime: entry.mime,
		size: entry.size,
		width: asNumber(entry.width),
		height: asNumber(entry.height),
		durationSeconds: asNumber(entry.durationSeconds),
		filter: asFilter(entry.filter),
		wrap: asWrap(entry.wrap),
		vflip: asBoolean(entry.vflip),
	};
}

export function createEmptyChannels(): ChannelEntry[] {
	return CHANNEL_SLOT_IDS.map((id) => ({
		id,
		type: null,
		url: null,
		name: null,
		bufferId: null,
		mime: null,
		size: null,
		storageKey: null,
		width: null,
		height: null,
		durationSeconds: null,
	}));
}

export function buildShaderContentDocument(
	buffers: ShaderBuffer[],
	channels: PersistedShaderChannel[]
): ShaderContentDocument {
	return {
		version: 2,
		buffers,
		channels,
	};
}

export function serializeShaderContent(
	buffers: ShaderBuffer[],
	channels: ChannelEntry[]
): ShaderContentDocument {
	const persistedChannels = channels.flatMap<PersistedShaderChannel>((channel) => {
		if (channel.type === 'buffer' && channel.bufferId) {
			return [{
				id: channel.id,
				type: 'buffer',
				name: channel.name,
				bufferId: channel.bufferId,
				filter: channel.filter,
				wrap: channel.wrap,
				vflip: channel.vflip,
			}];
		}

		if (channel.type === 'webcam') {
			return [{
				id: channel.id,
				type: 'webcam',
				filter: channel.filter,
				wrap: channel.wrap,
				vflip: channel.vflip,
			}];
		}

		if (
			(channel.type === 'image' || channel.type === 'video')
			&& channel.url
			&& channel.storageKey
			&& channel.mime
			&& typeof channel.size === 'number'
		) {
			return [{
				id: channel.id,
				type: channel.type === 'image' ? 'texture' : 'video',
				url: buildShaderAssetUrl(channel.storageKey),
				key: channel.storageKey,
				name: channel.name ?? `Channel ${channel.id}`,
				mime: channel.mime,
				size: channel.size,
				width: channel.width ?? undefined,
				height: channel.height ?? undefined,
				durationSeconds: channel.durationSeconds ?? undefined,
				filter: channel.filter,
				wrap: channel.wrap,
				vflip: channel.vflip,
			}];
		}

		return [];
	});

	return buildShaderContentDocument(buffers, persistedChannels);
}

export function deserializeShaderContent(content: unknown): ShaderContentDocument {
	const buffers = Array.isArray(content)
		? content.filter(isShaderBuffer)
		: isRecord(content) && Array.isArray(content.buffers)
			? content.buffers.filter(isShaderBuffer)
			: [];

	const channels = isRecord(content) && Array.isArray(content.channels)
		? content.channels.map(toStoredChannel).filter((entry): entry is PersistedShaderChannel => entry !== null)
		: [];

	return buildShaderContentDocument(buffers, channels);
}

export function hydrateChannels(content: unknown): ChannelEntry[] {
	const channels = createEmptyChannels();
	for (const entry of deserializeShaderContent(content).channels) {
		if (entry.type === 'buffer') {
			channels[entry.id] = {
				...channels[entry.id],
				type: 'buffer',
				name: entry.name,
				bufferId: entry.bufferId,
				filter: entry.filter,
				wrap: entry.wrap,
				vflip: entry.vflip,
			};
			continue;
		}

		if (entry.type === 'webcam') {
			channels[entry.id] = {
				...channels[entry.id],
				type: 'webcam',
				url: 'webcam',
				filter: entry.filter,
				wrap: entry.wrap,
				vflip: entry.vflip,
			};
			continue;
		}

		channels[entry.id] = {
			...channels[entry.id],
			type: entry.type === 'texture' ? 'image' : 'video',
			url: buildShaderAssetUrl(entry.key),
			name: entry.name,
			bufferId: null,
			filter: entry.filter,
			wrap: entry.wrap,
			vflip: entry.vflip,
			mime: entry.mime,
			size: entry.size,
			storageKey: entry.key,
			width: entry.width ?? null,
			height: entry.height ?? null,
			durationSeconds: entry.durationSeconds ?? null,
		};
	}

	return channels;
}

export function extractStoredAssets(content: unknown): StoredShaderAsset[] {
	return deserializeShaderContent(content).channels.flatMap((entry) => {
		if (entry.type === 'buffer' || entry.type === 'webcam') {
			return [];
		}

		return [{
			channelId: entry.id,
			key: entry.key,
			url: buildShaderAssetUrl(entry.key),
			mime: entry.mime,
			size: entry.size,
			type: entry.type,
		}];
	});
}

export function extractStoredAssetKeys(content: unknown): string[] {
	return extractStoredAssets(content).map((asset) => asset.key);
}

export function countStoredAssets(content: unknown, ignoredKeys: Set<string> = new Set()): number {
	return extractStoredAssets(content)
		.filter((asset) => !ignoredKeys.has(asset.key))
		.length;
}

export function sumStoredAssetBytes(content: unknown, ignoredKeys: Set<string> = new Set()): number {
	return extractStoredAssets(content)
		.filter((asset) => !ignoredKeys.has(asset.key))
		.reduce((total, asset) => total + asset.size, 0);
}

export function listUnpersistedBinaryChannels(channels: ChannelEntry[]): number[] {
	return channels
		.filter((channel) => (
			(channel.type === 'image' || channel.type === 'video')
			&& channel.url
			&& (!channel.storageKey || !channel.mime || typeof channel.size !== 'number')
		))
		.map((channel) => channel.id);
}
