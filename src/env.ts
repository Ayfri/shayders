import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({ PUBLIC_POCKETBASE_URL: { public: true, static: true } });
