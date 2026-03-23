import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		alias: {
			$components: 'src/lib/components',
			$features: 'src/lib/features',
			$layout: 'src/lib/components/layout',
			$ui: 'src/lib/components/ui',
		},
	},
};

export default config;
