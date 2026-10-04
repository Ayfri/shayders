import type { Handle } from '@sveltejs/kit/hooks';
import { AUTH_COOKIE_NAME } from '#features/auth/auth-shared.js';
import { clearAuthCookie, setAuthCookie } from '#features/auth/server/auth-session.js';
import { createPocketBase } from '#lib/pocketbase.js';
import type { UsersResponse } from '#lib/pocketbase-types.js';

export const handle: Handle = async ({ event, resolve }) => {
	const pb = createPocketBase();
	event.locals.pb = pb;
	event.locals.user = null;

	/** API routes authenticate their own `Authorization` header and assets are public, refreshing the cookie session there is a wasted PocketBase round trip. */
	const token = event.url.pathname.startsWith('/api/') ? undefined : event.cookies.get(AUTH_COOKIE_NAME);
	if (token) {
		pb.authStore.save(token);

		try {
			const authData = await pb.collection('users').authRefresh<UsersResponse>();
			setAuthCookie(event.cookies, authData.token);
			event.locals.user = authData.record;
		} catch {
			pb.authStore.clear();
			clearAuthCookie(event.cookies);
		}
	}

	return resolve(event);
};
