import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ShadersResponse, UsersResponse } from '#lib/pocketbase-types.js';
import { deserializeShaderContent, hydrateChannels } from '#features/shaders/model/shader-content.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	const shader = await locals.pb
		.collection('shaders')
		.getOne<ShadersResponse<unknown, { user_id?: UsersResponse }>>(params.id, { expand: 'user_id' })
		.catch(() => error(404, 'Shader not found'));

	const isOwner = locals.user?.id === shader.user_id;
	const visiblity = shader.visiblity ?? 'public';
	if (visiblity === 'private' && !isOwner) {
		return { isOwner: false, private: true as const };
	}

	return {
		isOwner,
		private: false as const,
		shader: {
			id: shader.id,
			name: shader.name,
			description: shader.description ?? '',
			buffers: deserializeShaderContent(shader.content).buffers,
			channels: hydrateChannels(shader.content),
			visiblity,
			authorId: shader.user_id,
			authorName: shader.expand?.user_id?.name || 'Unknown',
		},
	};
};
