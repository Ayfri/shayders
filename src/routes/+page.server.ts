import type { PageServerLoad } from './$types.js';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase } from '$lib/pocketbase-types';
import { deserializeShaderContent } from '$lib/shader-content';
import { SHADER_LIST_SORT } from '$lib/shader-list';

export const load: PageServerLoad = async () => {
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

	try {
		const result = await pb.collection('shaders').getList(1, 20, {
			filter: 'visiblity = "public"',
			sort: SHADER_LIST_SORT,
			expand: 'user_id',
		});

		return {
			shaders: result.items.map((s) => {
				const content = deserializeShaderContent(s.content);

				return {
					id: s.id,
					name: s.name,
					description: s.description ?? '',
					created: s.created,
					buffers: content.buffers,
					authorId: s.user_id,
					authorName: ((s.expand as any)?.user_id as any)?.name ?? 'Unknown',
				};
			}),
		};
	} catch (err) {
		console.error('Failed to load public shaders:', err);
		return {
			shaders: [],
		};
	}
};
