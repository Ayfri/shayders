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
) {
	await pb.collection('users').create({ email, name, password, passwordConfirm, emailVisibility: false });
	await login(email, password);
}

export function logout() {
	pb.authStore.clear();
}
