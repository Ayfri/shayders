import { fail, redirect } from '@sveltejs/kit';
import { readFormField } from '#features/auth/server/auth-session.js';
import { createPocketBase } from '#lib/pocketbase.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const email = readFormField(formData, 'email');
		const name = readFormField(formData, 'name');
		const password = readFormField(formData, 'password');
		const passwordConfirm = readFormField(formData, 'passwordConfirm');

		if (!email || !name || !password || !passwordConfirm) return fail(400, { email, error: 'All fields are required.', name });
		if (password !== passwordConfirm) return fail(400, { email, error: 'Passwords do not match.', name });

		const users = createPocketBase().collection('users');
		try {
			await users.create({ email, emailVisibility: false, name, password, passwordConfirm });
			await users.requestVerification(email);
		} catch (error) {
			return fail(400, { email, error: error instanceof Error ? error.message : 'Sign up failed. Please try again.', name });
		}

		redirect(303, `/verify-email?${new URLSearchParams({ email })}`);
	},
};
