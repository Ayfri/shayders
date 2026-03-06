import { error } from '@sveltejs/kit';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase, UsersResponse } from '$lib/pocketbase-types';

export async function authenticatePocketBaseRequest(request: Request): Promise<{
	pb: TypedPocketBase;
	user: UsersResponse;
}> {
	const authHeader = request.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		error(401, 'Unauthorized');
	}

	const token = authHeader.slice(7).trim();
	if (!token) {
		error(401, 'Unauthorized');
	}

	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
	pb.authStore.save(token);

	try {
		const authData = await pb.collection('users').authRefresh();
		return {
			pb,
			user: authData.record as UsersResponse,
		};
	} catch {
		error(401, 'Invalid session');
	}
	}
