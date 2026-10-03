import type { RequestHandler } from '@sveltejs/kit';
import { SITE_URL } from '#lib/site.js';

/** Search and answer-engine crawlers are listed explicitly so the opt-in stays visible, they share the default rules. */
const CRAWLERS = [
	'*',
	'Googlebot',
	'Bingbot',
	'GPTBot',
	'OAI-SearchBot',
	'ChatGPT-User',
	'ClaudeBot',
	'Claude-SearchBot',
	'Claude-User',
	'PerplexityBot',
	'Perplexity-User',
	'Google-Extended',
	'Applebot-Extended',
];

export const GET: RequestHandler = () => {
	const body = [
		...CRAWLERS.map((crawler) => `User-agent: ${crawler}`),
		'Allow: /',
		'Disallow: /api/',
		'Disallow: /login',
		'Disallow: /signup',
		'Disallow: /verify-email',
		'',
		`Sitemap: ${SITE_URL}/sitemap.xml`,
		'',
	].join('\n');

	return new Response(body, {
		headers: {
			'cache-control': 'public, max-age=86400',
			'content-type': 'text/plain; charset=utf-8',
		},
	});
};
