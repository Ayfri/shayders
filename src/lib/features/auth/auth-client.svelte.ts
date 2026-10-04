import { browser } from '$app/env';
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME, type AuthUser, toAuthUser } from './auth-shared.js';
import { pb } from '#lib/pocketbase.js';
import type { UsersResponse } from '#lib/pocketbase-types.js';

function readAuthCookieToken(): string | null {
	const cookie = document.cookie.split('; ').find((entry) => entry.startsWith(`${AUTH_COOKIE_NAME}=`));
	return cookie ? decodeURIComponent(cookie.slice(AUTH_COOKIE_NAME.length + 1)) : null;
}

function syncAuthCookieFromStore() {
	const secure = window.location.protocol === 'https:' ? '; Secure' : '';
	const token = pb.authStore.token;

	document.cookie = token
		? `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
		: `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

let hasHydratedAuth = false;
let user = $state<AuthUser | null>(null);

function syncUserFromAuthStore() {
	user = pb.authStore.isValid ? toAuthUser(pb.authStore.record as UsersResponse | null) : null;
	if (!hasHydratedAuth) return;

	if (!pb.authStore.isValid && (pb.authStore.token || pb.authStore.record)) {
		pb.authStore.clear();
	}

	syncAuthCookieFromStore();
}

syncUserFromAuthStore();
pb.authStore.onChange(syncUserFromAuthStore);

export const auth = {
	get user() {
		return user;
	},
	get isLoggedIn() {
		return !!user;
	},
};

export function hydrateAuth(nextUser: AuthUser | null): void {
	user = nextUser;
	if (!browser) return;

	hasHydratedAuth = true;
	const token = readAuthCookieToken();
	if (token && nextUser) {
		pb.authStore.save(token, { ...nextUser, collectionId: '_pb_users_auth_', collectionName: 'users' });
		return;
	}

	pb.authStore.clear();
}

export class SessionExpiredError extends Error {
	constructor(message = 'Session expired. You have been logged out. Log in again to continue.') {
		super(message);
		this.name = 'SessionExpiredError';
	}
}

/** API routes fail through SvelteKit's `error()`, whose JSON body is `{ message }`. */
function readApiErrorMessage(payload: unknown, fallback: string): string {
	return typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string' ? payload.message : fallback;
}

export async function requestVerification(email: string): Promise<void> {
	await pb.collection('users').requestVerification(email);
}

export async function throwIfAuthenticatedApiError(response: Response, fallback: string): Promise<void> {
	if (response.ok) return;

	const payload = await response.json().catch(() => null);
	if (response.status === 401) {
		logout();
		throw new SessionExpiredError();
	}

	throw new Error(readApiErrorMessage(payload, fallback));
}

export function logout() {
	pb.authStore.clear();
}
