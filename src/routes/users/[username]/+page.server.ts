import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase, ShadersResponse, UsersResponse } from '$lib/pocketbase-types';
import { countStoredAssets, deserializeShaderContent, hydrateChannels } from '$lib/shader-content';
import { SHADER_LIST_SORT } from '$lib/shader-list';

export const load: PageServerLoad = async ({ params }) => {
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

	let profileUser: UsersResponse;
	try {
		profileUser = await pb.collection('users').getOne(params.username);
	} catch {
		error(404, 'User not found');
	}

	let shaders: ShadersResponse[] = [];
	try {
		const result = await pb.collection('shaders').getList(1, 100, {
			filter: pb.filter("user_id = {:userId} && visiblity = 'public'", { userId: profileUser.id }),
			sort: SHADER_LIST_SORT,
		});
		shaders = result.items;
	} catch {
		shaders = [];
	}

	return {
		profileUser: {
			id: profileUser.id,
			name: profileUser.name ?? '',
		},
		shaders: shaders.map((s) => {
			const content = deserializeShaderContent(s.content);

			return {
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
