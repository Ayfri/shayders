import { pb } from './pocketbase';
import type { UsersResponse } from './pocketbase-types';

let user = $state<UsersResponse | null>(pb.authStore.record as UsersResponse | null);

pb.authStore.onChange(() => {
	user = pb.authStore.record as UsersResponse | null;
});

export const auth = {
	get user() {
		return user;
	},
	get isLoggedIn() {
		return !!user;
	},
};

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

export function logout() {
	pb.authStore.clear();
}
