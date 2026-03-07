import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import { AUTH_COOKIE_NAME, type AuthUser } from '$lib/auth-shared';
import type { UsersResponse } from '$lib/pocketbase-types';

const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

export function toAuthUser(user: UsersResponse | null): AuthUser | null {
	if (!user) {
		return null;
	}

	return {
		avatar: user.avatar || null,
		email: user.email,
		id: user.id,
		name: user.name ?? '',
		username: user.username,
		verified: user.verified ?? false,
	};
}
