import type { Handle } from '@sveltejs/kit';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import { AUTH_COOKIE_NAME } from '$features/auth/auth-shared';
import { setAuthCookie } from '$features/auth/server/auth-session';
import type { TypedPocketBase, UsersResponse } from '$lib/pocketbase-types';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const token = event.cookies.get(AUTH_COOKIE_NAME);
	if (token) {
		const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
		pb.authStore.save(token);

		try {
			const authData = await pb.collection('users').authRefresh();
			setAuthCookie(event.cookies, authData.token);
			event.locals.user = authData.record as UsersResponse;
		} catch {
			event.cookies.delete(AUTH_COOKIE_NAME, { path: '/' });
		}
	}

	return resolve(event);
};
