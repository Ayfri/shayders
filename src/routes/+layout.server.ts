import { toAuthUser } from '$lib/server/auth-session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	return {
		pathname: url.pathname,
		sessionUser: toAuthUser(locals.user),
	};
};
