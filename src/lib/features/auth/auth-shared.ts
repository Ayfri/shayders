import type { UsersResponse } from '#lib/pocketbase-types.js';

export const AUTH_COOKIE_NAME = 'shayders_auth';
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface AuthUser {
	avatar: string | null;
	email: string;
	id: string;
	name: string;
	username: string;
	verified: boolean;
}

type AuthUserSource = Pick<UsersResponse, 'email' | 'id' | 'username'> & {
	avatar?: string | null;
	name?: string;
	verified?: boolean;
};

export function toAuthUser(record: AuthUserSource | null): AuthUser | null {
	return record && {
		avatar: record.avatar || null,
		email: record.email,
		id: record.id,
		name: record.name ?? '',
		username: record.username,
		verified: record.verified ?? false,
	};
}
