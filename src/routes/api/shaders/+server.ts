import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase } from '$lib/pocketbase-types';

interface SaveBody {
	shaderId?: string;
	name: string;
	description?: string;
	userId: string;
	buffers: { id: string; label: string; code: string }[];
}

export const POST: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const token = authHeader.slice(7);
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
	pb.authStore.save(token);

	try {
		const body = (await request.json()) as SaveBody;

		const userId = body.userId;
		if (!userId) {
			return json({ error: 'Missing userId' }, { status: 400 });
		}

		const payload = {
			content: body.buffers,
			name: body.name,
			description: body.description ?? '',
			user_id: userId,
		};

		let record;
		if (body.shaderId) {
			record = await pb.collection('shaders').update(body.shaderId, payload);
		} else {
			record = await pb.collection('shaders').create(payload);
		}

		return json({ success: true, record });
	} catch (err) {
		console.error('Erreur API shaders :', err);
		return json({ error: 'Failed to save shader' }, { status: 500 });
	}
};
