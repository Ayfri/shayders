import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import type { TypedPocketBase } from '$lib/pocketbase-types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const pb = new PocketBase(PUBLIC_POCKETBASE_URL) as TypedPocketBase;

	try {
		await pb.collection('users').confirmVerification(params.token);

		return {
			message: 'Your email has been successfully verified. Redirecting you home...',
			status: 'success' as const,
		};
	} catch (error) {
		return {
			message: error instanceof Error
				? error.message
				: 'Failed to verify email. The link may have expired.',
			status: 'error' as const,
		};
	}
};
