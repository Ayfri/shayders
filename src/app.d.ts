// See https://svelte.dev/docs/kit/types#app.d.ts for information about these interfaces.
/// <reference types="@cloudflare/workers-types" />

import type { TypedPocketBase, UsersResponse } from '#lib/pocketbase-types.js';

declare global {
	namespace App {
		interface Locals {
			/** Per-request client carrying the visitor's session, so PocketBase API rules apply to them. */
			pb: TypedPocketBase;
			user: UsersResponse | null;
		}
	}

	/** Bindings from wrangler.toml, read through `import { env } from 'cloudflare:workers'`. */
	namespace Cloudflare {
		interface Env {
			ASSETS_STORAGE: R2Bucket;
		}
	}
}

export {};
