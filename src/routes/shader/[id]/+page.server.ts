import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase, ShadersResponse } from '$lib/pocketbase-types';
import { deserializeShaderContent, hydrateChannels } from '$lib/shader-content';

export const load: PageServerLoad = async ({ locals, params }) => {
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

	let shader: ShadersResponse;
	try {
		shader = await pb.collection('shaders').getOne(params.id, { expand: 'user_id' });
	} catch {
		error(404, 'Shader not found');
	}

	const content = deserializeShaderContent(shader.content);
	const isOwner = locals.user?.id === shader.user_id;
	const isPrivate = (shader.visiblity ?? 'public') === 'private';

	if (isPrivate && !isOwner) {
		return {
			isOwner: false,
			private: true as const,
		};
	}

	return {
		isOwner,
		private: false as const,
		shader: {
			id: shader.id,
			name: shader.name,
			description: shader.description ?? '',
			buffers: content.buffers,
			channels: hydrateChannels(shader.content),
			user_id: shader.user_id,
			visiblity: shader.visiblity ?? 'public',
			authorId: shader.user_id,
			authorName: ((shader.expand as any)?.user_id as any)?.name ?? 'Unknown',
		},
	};
};
