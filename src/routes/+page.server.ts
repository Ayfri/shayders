import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase } from '$lib/pocketbase-types';
import { getShaderListSort, normalizeShaderSort } from '$lib/shader-list';
import { deserializeShaderContent, hydrateChannels } from '$lib/shader-content';
import PocketBase from 'pocketbase';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
	const selectedSort = normalizeShaderSort(url.searchParams.get('sort'));

	try {
		const result = await pb.collection('shaders').getList(1, 24, {
			filter: 'visiblity = "public"',
			sort: getShaderListSort(selectedSort),
			expand: 'user_id',
		});

		return {
			selectedSort,
			totalShaders: result.totalItems,
			shaders: result.items.map((s) => {
				const content = deserializeShaderContent(s.content);

				return {
					id: s.id,
					name: s.name,
					description: s.description ?? '',
					created: s.created,
					buffers: content.buffers,
					channels: hydrateChannels(s.content),
					authorId: s.user_id,
					authorName: ((s.expand as any)?.user_id as any)?.name ?? 'Unknown',
				};
			}),
		};
	} catch (err) {
		console.error('Failed to load public shaders:', err);
		return {
			selectedSort,
			shaders: [],
			totalShaders: 0,
		};
	}
};
