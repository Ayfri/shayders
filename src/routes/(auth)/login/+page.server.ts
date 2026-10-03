import { fail, redirect } from '@sveltejs/kit';
import { readFormField, setAuthCookie } from '#features/auth/server/auth-session.js';
import { createPocketBase } from '#lib/pocketbase.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ cookies, request }) => {
		const formData = await request.formData();
		const email = readFormField(formData, 'email');
		const password = readFormField(formData, 'password');
		if (!email || !password) return fail(400, { email, error: 'Email and password are required.' });

		try {
			const authData = await createPocketBase().collection('users').authWithPassword(email, password);
			setAuthCookie(cookies, authData.token);
		} catch (error) {
			return fail(400, { email, error: error instanceof Error ? error.message : 'Login failed. Please try again.' });
		}

		redirect(303, '/');
	},
};
