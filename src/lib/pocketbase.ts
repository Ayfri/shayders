import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import type { TypedPocketBase } from './pocketbase-types.js';

/** Fresh anonymous client, server code creates one per request so auth state never leaks between users. */
export function createPocketBase(): TypedPocketBase {
	return new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;
}

/** Browser client holding the logged-in session. */
export const pb = createPocketBase();

export function getAvatarUrl(user: { avatar?: string | null; id: string }): string | null {
	return user.avatar ? pb.buildURL(`/api/files/users/${user.id}/${user.avatar}`) : null;
}
