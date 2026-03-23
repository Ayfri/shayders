export const AUTH_COOKIE_NAME = 'shayders_auth';

export interface AuthUser {
	avatar: string | null;
	email: string;
	id: string;
	name: string;
	username: string;
	verified: boolean;
}
