import type { RequestHandler } from '@sveltejs/kit';
import { listPublicShaders } from '#lib/server/public-shaders.js';
import { buildSiteUrl, getShaderPath, getUserProfilePath, toIsoDate } from '#lib/site.js';

const STATIC_PATHS = ['/', '/new', '/search', '/legal'];

function escapeXml(text: string): string {
	return text.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

export const GET: RequestHandler = async () => {
	const shaders = await listPublicShaders().catch((error: unknown) => {
		console.error('Failed to list shaders for the sitemap:', error);
		return [];
	});

	/** Shaders come sorted by `-updated`, so the first one seen per author is their latest activity. */
	const authors = new Map<string, string>();
	for (const shader of shaders) if (!authors.has(shader.authorId)) authors.set(shader.authorId, shader.updated);

	const entries = [
		...STATIC_PATHS.map((path) => ({ lastmod: shaders[0]?.updated, loc: buildSiteUrl(path) })),
		...shaders.map((shader) => ({ lastmod: shader.updated, loc: buildSiteUrl(getShaderPath(shader.id)) })),
		...Array.from(authors, ([authorId, lastmod]) => ({ lastmod, loc: buildSiteUrl(getUserProfilePath(authorId)) })),
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(({ lastmod, loc }) => `\t<url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${toIsoDate(lastmod)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'cache-control': 'public, max-age=3600',
			'content-type': 'application/xml; charset=utf-8',
		},
	});
};
