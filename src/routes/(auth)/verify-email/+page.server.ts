import { fail, redirect } from '@sveltejs/kit';
import { readFormField } from '#features/auth/server/auth-session.js';
import { createPocketBase } from '#lib/pocketbase.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({ email: url.searchParams.get('email') ?? '' });

export const actions: Actions = {
	resend: async ({ request }) => {
		const email = readFormField(await request.formData(), 'email');
		if (!email) return fail(400, { email, error: 'Email is required to resend verification.' });

		try {
			await createPocketBase().collection('users').requestVerification(email);
		} catch (error) {
			return fail(400, { email, error: error instanceof Error ? error.message : 'Failed to resend verification email.' });
		}

		return { email, resendSuccess: true };
	},
	verify: async ({ request }) => {
		const formData = await request.formData();
		const token = readFormField(formData, 'token');
		const email = readFormField(formData, 'email');
		if (!token) return fail(400, { email, error: 'Verification token is required.' });

		try {
			await createPocketBase().collection('users').confirmVerification(token);
		} catch (error) {
			return fail(400, { email, error: error instanceof Error ? error.message : 'Invalid or expired token. Please try again.' });
		}

		redirect(303, '/');
	},
};
