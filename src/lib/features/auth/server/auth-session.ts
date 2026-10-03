import { dev } from '$app/env';
import type { Cookies } from '@sveltejs/kit';
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME } from '../auth-shared.js';

export function clearAuthCookie(cookies: Cookies): void {
	cookies.delete(AUTH_COOKIE_NAME, { path: '/' });
}

export function setAuthCookie(cookies: Cookies, token: string): void {
	cookies.set(AUTH_COOKIE_NAME, token, {
		httpOnly: false,
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
		path: '/',
		sameSite: 'lax',
		secure: !dev,
	});
}

export function readFormField(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value.trim() : '';
}
