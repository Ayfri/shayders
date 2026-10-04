import { toAuthUser } from '#features/auth/auth-shared.js';
import type { LayoutServerLoad } from './$types';

/** Reads no `url`, so client navigations skip this load and only the page's own load runs. */
export const load: LayoutServerLoad = ({ locals }) => ({
	sessionUser: toAuthUser(locals.user),
});
