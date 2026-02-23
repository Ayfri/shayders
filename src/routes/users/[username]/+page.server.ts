	import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase, ShadersResponse, UsersResponse } from '$lib/pocketbase-types';

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
			sort: '-created',
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
		shaders: shaders.map((s) => ({
			id: s.id,
			name: s.name,
			description: s.description ?? '',
			created: s.created,
			updated: s.updated,
			visiblity: s.visiblity ?? 'public',
		})),
	};
};
