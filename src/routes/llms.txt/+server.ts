import type { RequestHandler } from '@sveltejs/kit';
import { UNIFORM_DOCS } from '#lib/glsl/builtins.js';
import { listPublicShaders } from '#lib/server/public-shaders.js';
import { buildSiteUrl, getShaderPath, SITE_DESCRIPTION, SITE_NAME, SITE_REPOSITORY_URL, SITE_URL, truncateText } from '#lib/site.js';

const MAX_LISTED_SHADERS = 50;

/** Markdown index for LLMs and answer engines, following https://llmstxt.org. */
export const GET: RequestHandler = async () => {
	const shaders = await listPublicShaders().catch(() => []);

	const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

Shaders are GLSL ES 1.00 fragment shaders running on WebGL 1. Each shader has an Image pass, an optional Common block prepended to every pass, and up to 4 offscreen buffers sampled as \`uBufferA\`, \`uBufferB\`... Four texture channels (\`uChannel0\` to \`uChannel3\`) accept images, videos, the webcam or another buffer.

## Pages

- [Shader gallery](${SITE_URL}/): public shaders from the community, sorted by date or name
- [New shader](${SITE_URL}/new): open the editor with a starter shader, no account needed to experiment
- [Search](${SITE_URL}/search): find shaders and creators by name
- [Source code](${SITE_REPOSITORY_URL}): the GPL-3.0 SvelteKit project behind ${SITE_NAME}

## Built-in uniforms

${Object.values(UNIFORM_DOCS).map(({ description, signature }) => `- \`${signature}\`: ${description}`).join('\n')}

## Latest public shaders

${shaders.slice(0, MAX_LISTED_SHADERS).map((shader) => `- [${shader.name}](${buildSiteUrl(getShaderPath(shader.id))}): by ${shader.authorName}${shader.description ? `, ${truncateText(shader.description, 140)}` : ''}`).join('\n')}

## Optional

- [Sitemap](${SITE_URL}/sitemap.xml): every public shader and creator profile
`;

	return new Response(body, {
		headers: {
			'cache-control': 'public, max-age=3600',
			'content-type': 'text/markdown; charset=utf-8',
		},
	});
};
