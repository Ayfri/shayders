import { error } from '@sveltejs/kit';
import { SHADER_USER_QUOTA_BYTES, formatBytes } from '#features/shaders/assets/shader-asset-policy.js';
import { extractStoredAssetKeys } from '#features/shaders/model/shader-content.js';
import type { TypedPocketBase } from '#lib/pocketbase-types.js';
import { deleteR2Objects, getUserAssetPrefix, listR2Prefix } from './r2.js';

export interface AssetStorage {
	mediaCount: number;
	/** Unreferenced objects that are safe to delete, they don't count toward `usedBytes`. */
	staleKeys: string[];
	usedBytes: number;
}

/** Editor tabs keep unsaved uploads alive this long before they count as abandoned. */
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

async function listReferencedAssetKeys(pb: TypedPocketBase, userId: string): Promise<Set<string>> {
	const shaders = await pb.collection('shaders').getFullList({
		fields: 'content',
		filter: pb.filter('user_id = {:userId}', { userId }),
	});
	return new Set(shaders.flatMap((shader) => extractStoredAssetKeys(shader.content)));
}

/**
 * Quota usage comes from what R2 actually stores, so uploads never saved into a shader still count.
 * An unreferenced object goes stale once abandoned, or right away when it's the asset the editor just replaced.
 */
export async function readAssetStorage(pb: TypedPocketBase, bucket: R2Bucket, userId: string, replacedKey: string | null = null): Promise<AssetStorage> {
	const [objects, referencedKeys] = await Promise.all([
		listR2Prefix(bucket, getUserAssetPrefix(userId)),
		listReferencedAssetKeys(pb, userId),
	]);

	const abandonedBefore = Date.now() - ORPHAN_TTL_MS;
	const storage: AssetStorage = { mediaCount: 0, staleKeys: [], usedBytes: 0 };
	for (const object of objects) {
		if (!referencedKeys.has(object.key) && (object.key === replacedKey || object.uploaded.getTime() < abandonedBefore)) {
			storage.staleKeys.push(object.key);
			continue;
		}
		storage.mediaCount += 1;
		storage.usedBytes += object.size;
	}
	return storage;
}

export function assertWithinQuota(usedBytes: number): void {
	if (usedBytes > SHADER_USER_QUOTA_BYTES) error(400, `Storage quota exceeded. Free accounts are limited to ${formatBytes(SHADER_USER_QUOTA_BYTES)}.`);
}

/** Runs after the record change, so a key still used by another of the user's shaders is kept. Only keys under the user's prefix are ever deleted. */
export async function deleteUnreferencedAssets(pb: TypedPocketBase, bucket: R2Bucket, userId: string, keys: string[]): Promise<void> {
	const ownedKeys = keys.filter((key) => key.startsWith(getUserAssetPrefix(userId)));
	if (ownedKeys.length === 0) return;

	const referencedKeys = await listReferencedAssetKeys(pb, userId);
	await deleteR2Objects(bucket, ownedKeys.filter((key) => !referencedKeys.has(key)));
}
