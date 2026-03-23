import { fail, redirect } from '@sveltejs/kit';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import { setAuthCookie } from '$features/auth/server/auth-session';
import type { TypedPocketBase } from '$lib/pocketbase-types';
import type { Actions, PageServerLoad } from './$types';

function readFormField(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, '/');
	}
};

export const actions: Actions = {
	default: async ({ cookies, request }) => {
		const formData = await request.formData();
		const email = readFormField(formData, 'email');
		const password = readFormField(formData, 'password');

		if (!email || !password) {
			return fail(400, {
				email,
				error: 'Email and password are required.',
			});
		}

		const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

		try {
			const authData = await pb.collection('users').authWithPassword(email, password);
			setAuthCookie(cookies, authData.token);
		} catch (error) {
			return fail(400, {
				email,
				error: error instanceof Error ? error.message : 'Login failed. Please try again.',
			});
		}

		redirect(303, '/');
	},
};

