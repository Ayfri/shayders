import { fail, redirect } from '@sveltejs/kit';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
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
	default: async ({ request }) => {
		const formData = await request.formData();
		const email = readFormField(formData, 'email');
		const name = readFormField(formData, 'name');
		const password = readFormField(formData, 'password');
		const passwordConfirm = readFormField(formData, 'passwordConfirm');

		if (!email || !name || !password || !passwordConfirm) {
			return fail(400, {
				email,
				error: 'All fields are required.',
				name,
			});
		}

		if (password !== passwordConfirm) {
			return fail(400, {
				email,
				error: 'Passwords do not match.',
				name,
			});
		}

		const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

		try {
			await pb.collection('users').create({
				email,
				emailVisibility: false,
				name,
				password,
				passwordConfirm,
			});
			await pb.collection('users').requestVerification(email);
		} catch (error) {
			return fail(400, {
				email,
				error: error instanceof Error ? error.message : 'Sign up failed. Please try again.',
				name,
			});
		}

		const params = new URLSearchParams({ email });
		redirect(303, `/verify-email?${params}`);
	},
};
