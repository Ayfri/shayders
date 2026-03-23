import { fail, redirect } from '@sveltejs/kit';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase } from '$lib/pocketbase-types';
import type { Actions, PageServerLoad } from './$types';

function readFormField(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

export const load: PageServerLoad = async ({ url }) => {
	return {
		email: url.searchParams.get('email') ?? '',
	};
};

export const actions: Actions = {
	resend: async ({ request }) => {
		const formData = await request.formData();
		const email = readFormField(formData, 'email');

		if (!email) {
			return fail(400, {
				email,
				error: 'Email is required to resend verification.',
			});
		}

		const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

		try {
			await pb.collection('users').requestVerification(email);
		} catch (error) {
			return fail(400, {
				email,
				error: error instanceof Error ? error.message : 'Failed to resend verification email.',
			});
		}

		return {
			email,
			resendSuccess: true,
		};
	},
	verify: async ({ request }) => {
		const formData = await request.formData();
		const token = readFormField(formData, 'token');
		const email = readFormField(formData, 'email');

		if (!token) {
			return fail(400, {
				email,
				error: 'Verification token is required.',
			});
		}

		const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

		try {
			await pb.collection('users').confirmVerification(token);
		} catch (error) {
			return fail(400, {
				email,
				error: error instanceof Error ? error.message : 'Invalid or expired token. Please try again.',
			});
		}

		redirect(303, '/');
	},
};
