import { error } from '@sveltejs/kit';
import { getAvatarUrl } from '#lib/pocketbase.js';
import { countStoredAssets, deserializeShaderContent, hydrateChannels, sumStoredAssetBytes } from '#features/shaders/model/shader-content.js';
import { getShaderListSort, normalizeShaderSort } from '#features/shaders/model/shader-list.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { pb } = locals;
	const selectedSort = normalizeShaderSort(url.searchParams.get('sort'));
	const profileUser = await pb.collection('users').getOne(params.userId).catch(() => error(404, 'User not found'));
	const isOwner = locals.user?.id === profileUser.id;

	const shaders = await pb.collection('shaders')
		.getList(1, 100, {
			fields: 'id,name,description,created,visiblity,content',
			filter: isOwner
				? pb.filter('user_id = {:userId}', { userId: profileUser.id })
				: pb.filter("user_id = {:userId} && visiblity = 'public'", { userId: profileUser.id }),
			sort: getShaderListSort(selectedSort),
		})
		.then((result) => result.items)
		.catch(() => []);

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
	};
};
