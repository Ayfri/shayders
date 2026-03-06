import type { RequestHandler } from '@sveltejs/kit';
import { SITE_NAME, SITE_URL } from '$lib/site';

export const GET: RequestHandler = async () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
	<ShortName>${SITE_NAME} Search</ShortName>
	<Description>Search shaders and creators on ${SITE_NAME}</Description>
	<InputEncoding>UTF-8</InputEncoding>
	<Url type="text/html" method="get" template="${SITE_URL}/search?q={searchTerms}" />
</OpenSearchDescription>`;

	return new Response(xml, {
		headers: {
			'cache-control': 'public, max-age=3600',
			'content-type': 'application/opensearchdescription+xml; charset=utf-8',
		},
	});
};
