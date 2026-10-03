// See https://svelte.dev/docs/kit/types#app.d.ts for information about these interfaces.
/// <reference types="@cloudflare/workers-types" />

import type { UsersResponse } from '#lib/pocketbase-types.js';

declare global {
	namespace App {
		interface Locals {
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
