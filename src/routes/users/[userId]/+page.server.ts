import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getAvatarUrl } from '#lib/pocketbase.js';
import { readAssetStorage } from '#lib/server/shader-assets.js';
import { countStoredAssets, deserializeShaderContent, hydrateChannels, sumStoredAssetBytes } from '#features/shaders/model/shader-content.js';
import { getShaderListSort, normalizeShaderSort } from '#features/shaders/model/shader-list.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { pb } = locals;
	const selectedSort = normalizeShaderSort(url.searchParams.get('sort'));
	const profileUser = await pb.collection('users').getOne(params.userId).catch(() => error(404, 'User not found'));
	const isOwner = locals.user?.id === profileUser.id;

	const [shaders, storage] = await Promise.all([
		pb.collection('shaders')
			.getList(1, 100, {
				fields: 'id,name,description,created,visiblity,content',
				filter: isOwner
					? pb.filter('user_id = {:userId}', { userId: profileUser.id })
					: pb.filter("user_id = {:userId} && visiblity = 'public'", { userId: profileUser.id }),
				sort: getShaderListSort(selectedSort),
			})
			.then((result) => result.items)
			.catch(() => []),
		/** Read from R2 like the upload quota, so the owner sees the same usage the server enforces. */
		isOwner
			? readAssetStorage(pb, env.ASSETS_STORAGE, profileUser.id).then(({ mediaCount, usedBytes }) => ({ mediaCount, usedBytes }))
			: null,
	]);

	return {
		isOwner,
		profileUser: {
			avatarUrl: getAvatarUrl(profileUser),
			created: profileUser.created,
			id: profileUser.id,
			name: profileUser.name ?? '',
			verified: profileUser.verified ?? false,
		},
		selectedSort,
		shaders: shaders.map((shader) => ({
			assetBytes: sumStoredAssetBytes(shader.content),
			id: shader.id,
			name: shader.name,
			description: shader.description ?? '',
			created: shader.created,
			visiblity: shader.visiblity ?? 'public',
			mediaCount: countStoredAssets(shader.content),
			buffers: deserializeShaderContent(shader.content).buffers,
			channels: hydrateChannels(shader.content),
		})),
		storage,
	};
};
