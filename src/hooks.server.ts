import type { Handle } from '@sveltejs/kit/hooks';
import { AUTH_COOKIE_NAME } from '#features/auth/auth-shared.js';
import { clearAuthCookie, setAuthCookie } from '#features/auth/server/auth-session.js';
import { createPocketBase } from '#lib/pocketbase.js';
import type { UsersResponse } from '#lib/pocketbase-types.js';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const token = event.cookies.get(AUTH_COOKIE_NAME);
	if (token) {
		const pb = createPocketBase();
		pb.authStore.save(token);

		try {
			const authData = await pb.collection('users').authRefresh<UsersResponse>();
			setAuthCookie(event.cookies, authData.token);
			event.locals.user = authData.record;
		} catch {
			clearAuthCookie(event.cookies);
		}
	}

	return resolve(event);
};
