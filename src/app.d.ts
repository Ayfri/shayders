// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="@cloudflare/workers-types" />

import type { UsersResponse } from '$lib/pocketbase-types';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: UsersResponse | null;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				ASSETS_STORAGE: R2Bucket;
			};
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
