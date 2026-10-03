import { toAuthUser } from '#features/auth/auth-shared.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => ({
	pathname: url.pathname,
	sessionUser: toAuthUser(locals.user),
});
