import type { PageServerLoad } from './$types.js';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase } from '$lib/pocketbase-types';

export const load: PageServerLoad = async () => {
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

	try {
		const result = await pb.collection('shaders').getList(1, 50, {
			filter: 'visiblity = "public"',
			sort: '-created',
		});

		const allShaders = result.items;

		if (allShaders.length === 0) {
			console.warn('No public shaders found in database');
		}

		const shuffled = [...allShaders].sort(() => Math.random() - 0.5);
		const randomShaders = shuffled.slice(0, 20);

		return {
			shaders: randomShaders.map((s) => ({
				id: s.id,
				name: s.name,
				description: s.description ?? '',
				created: s.created,
				updated: s.updated,
				visiblity: s.visiblity ?? 'public',
				buffers: Array.isArray(s.content) ? (s.content as any[]) : [],
				userId: s.user_id,
			})),
		};
	} catch (err) {
		console.error('Failed to load public shaders:', err);
		return {
			shaders: [],
		};
	}
};
