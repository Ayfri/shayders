import { pb } from './pocketbase';
import type { UsersResponse } from './pocketbase-types';

function syncUserFromAuthStore() {
	const nextUser = pb.authStore.isValid
		? (pb.authStore.record as UsersResponse | null)
		: null;

	user = nextUser;

	if (!pb.authStore.isValid && (pb.authStore.token || pb.authStore.record)) {
		pb.authStore.clear();
	}
}

let user = $state<UsersResponse | null>(null);

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

export async function login(email: string, password: string) {
	await pb.collection('users').authWithPassword(email, password);
}

export async function signup(
	email: string,
	name: string,
	password: string,
	passwordConfirm: string
): Promise<{ email: string }> {
	await pb.collection('users').create({ email, name, password, passwordConfirm, emailVisibility: false });
	await pb.collection('users').requestVerification(email);
	return { email };
}

export async function requestVerification(email: string): Promise<void> {
	await pb.collection('users').requestVerification(email);
}

export async function confirmVerification(token: string): Promise<void> {
	await pb.collection('users').confirmVerification(token);
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
