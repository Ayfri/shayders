import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase, ShadersResponse } from '$lib/pocketbase-types';

export const load: PageServerLoad = async ({ params }) => {
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

	let shader: ShadersResponse;
	try {
		shader = await pb.collection('shaders').getOne(params.id, { expand: 'user_id' });
	} catch {
		error(404, 'Shader not found');
	}

	return {
		shader: {
			id: shader.id,
			name: shader.name,
			description: shader.description ?? '',
			content: shader.content,
			user_id: shader.user_id,
			visiblity: shader.visiblity ?? 'public',
			authorId: shader.user_id,
			authorName: ((shader.expand as any)?.user_id as any)?.name ?? 'Unknown',
		},
	};
};
