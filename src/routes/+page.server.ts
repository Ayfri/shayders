import { createPocketBase } from '#lib/pocketbase.js';
import type { ShadersResponse, UsersResponse } from '#lib/pocketbase-types.js';
import { getShaderListSort, normalizeShaderSort } from '#features/shaders/model/shader-list.js';
import { deserializeShaderContent, hydrateChannels } from '#features/shaders/model/shader-content.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
	const pb = createPocketBase();
	const selectedSort = normalizeShaderSort(url.searchParams.get('sort'));

	try {
		const result = await pb.collection('shaders').getList<ShadersResponse<unknown, { user_id?: UsersResponse }>>(1, 24, {
			filter: 'visiblity = "public"',
			sort: getShaderListSort(selectedSort),
			expand: 'user_id',
		});

		return {
			selectedSort,
			totalShaders: result.totalItems,
			shaders: result.items.map((shader) => ({
				id: shader.id,
				name: shader.name,
				description: shader.description ?? '',
				created: shader.created,
				buffers: deserializeShaderContent(shader.content).buffers,
				channels: hydrateChannels(shader.content),
				authorId: shader.user_id,
				authorName: shader.expand?.user_id?.name || 'Unknown',
			})),
		};
	} catch (err) {
		console.error('Failed to load public shaders:', err);
		return { selectedSort, shaders: [], totalShaders: 0 };
	}
};
