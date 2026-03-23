import { error } from '@sveltejs/kit';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase, ShadersResponse, UsersResponse } from '$lib/pocketbase-types';
import { countStoredAssets, deserializeShaderContent, hydrateChannels, sumStoredAssetBytes } from '$features/shaders/model/shader-content';
import { getShaderListSort, normalizeShaderSort } from '$features/shaders/model/shader-list';
import PocketBase from 'pocketbase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
	const selectedSort = normalizeShaderSort(url.searchParams.get('sort'));

	let profileUser: UsersResponse;
	try {
		profileUser = await pb.collection('users').getOne(params.userId);
	} catch {
		error(404, 'User not found');
	}

	const isOwner = locals.user?.id === profileUser.id;
	let shaders: ShadersResponse[] = [];
	try {
		const result = await pb.collection('shaders').getList(1, 100, {
			filter: isOwner
				? pb.filter('user_id = {:userId}', { userId: profileUser.id })
				: pb.filter("user_id = {:userId} && visiblity = 'public'", { userId: profileUser.id }),
			sort: getShaderListSort(selectedSort),
		});
		shaders = result.items;
	} catch {
		shaders = [];
	}

	return {
		isOwner,
		profileUser: {
			avatarUrl: profileUser.avatar
				? `${pb.baseURL}/api/files/users/${profileUser.id}/${profileUser.avatar}`
				: null,
			id: profileUser.id,
			name: profileUser.name ?? '',
			verified: profileUser.verified ?? false,
		},
		selectedSort,
		shaders: shaders.map((s) => {
			const content = deserializeShaderContent(s.content);

			return {
				assetBytes: sumStoredAssetBytes(s.content),
				id: s.id,
				name: s.name,
				description: s.description ?? '',
				created: s.created,
				visiblity: s.visiblity ?? 'public',
				mediaCount: countStoredAssets(s.content),
				buffers: content.buffers,
				channels: hydrateChannels(s.content),
			};
		}),
	};
};
