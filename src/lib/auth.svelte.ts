import { browser } from '$app/environment';
import { AUTH_COOKIE_NAME, type AuthUser } from './auth-shared';
import { pb } from './pocketbase';
import type { UsersResponse } from './pocketbase-types';

function readAuthCookieToken(): string | null {
	if (!browser) {
		return null;
	}

	const cookie = document.cookie
		.split('; ')
		.find((entry) => entry.startsWith(`${AUTH_COOKIE_NAME}=`));

	return cookie ? decodeURIComponent(cookie.slice(AUTH_COOKIE_NAME.length + 1)) : null;
}

function toAuthUser(record: UsersResponse | AuthUser | null): AuthUser | null {
	if (!record) {
		return null;
	}

	return {
		avatar: record.avatar || null,
		email: record.email,
		id: record.id,
		name: record.name ?? '',
		username: record.username,
		verified: record.verified ?? false,
	};
}

function syncAuthCookieFromStore() {
	if (!browser) {
		return;
	}

	const secure = window.location.protocol === 'https:' ? '; Secure' : '';
	const token = pb.authStore.token;

	document.cookie = token
		? `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; SameSite=Lax${secure}`
		: `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function syncUserFromAuthStore() {
	const nextUser = pb.authStore.isValid
		? toAuthUser(pb.authStore.record as UsersResponse | null)
		: null;

	user = nextUser;

	if (!pb.authStore.isValid && (pb.authStore.token || pb.authStore.record)) {
		pb.authStore.clear();
	}

	syncAuthCookieFromStore();
}

let user = $state<AuthUser | null>(null);

syncUserFromAuthStore();

pb.authStore.onChange(() => {
	syncUserFromAuthStore();
});

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

	if (!browser) {
		return;
	}

	const token = readAuthCookieToken();
	if (token && nextUser) {
		pb.authStore.save(token, nextUser as any);
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

function readApiErrorMessage(payload: unknown, fallback: string): string {
	if (typeof payload !== 'object' || payload === null) {
		return fallback;
	}

	if ('error' in payload && typeof payload.error === 'string') {
		return payload.error;
	}

	if ('message' in payload && typeof payload.message === 'string') {
		return payload.message;
	}

	return fallback;
}

export async function requestVerification(email: string): Promise<void> {
	await pb.collection('users').requestVerification(email);
}

export async function throwIfAuthenticatedApiError(response: Response, fallback: string): Promise<void> {
	if (response.ok) {
		return;
	}

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
