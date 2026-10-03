import { error } from '@sveltejs/kit';
import { createPocketBase } from '#lib/pocketbase.js';
import type { TypedPocketBase, UsersResponse } from '#lib/pocketbase-types.js';

/** Authenticates an API request from its `Authorization: Bearer <token>` header, throws a 401 otherwise. */
export async function authenticatePocketBaseRequest(request: Request): Promise<{ pb: TypedPocketBase; user: UsersResponse }> {
	const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)/)?.[1];
	if (!token) error(401, 'Unauthorized');

	const pb = createPocketBase();
	pb.authStore.save(token);

	try {
		const authData = await pb.collection('users').authRefresh<UsersResponse>();
		return { pb, user: authData.record };
	} catch {
		error(401, 'Invalid session');
	}
}
