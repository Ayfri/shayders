// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="@cloudflare/workers-types" />
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
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
