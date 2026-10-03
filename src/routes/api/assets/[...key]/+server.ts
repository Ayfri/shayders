import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { streamR2Asset } from '#lib/server/r2.js';

export const GET: RequestHandler = ({ params, request }) => streamR2Asset(env.ASSETS_STORAGE, params.key, request, 'GET');

export const HEAD: RequestHandler = ({ params, request }) => streamR2Asset(env.ASSETS_STORAGE, params.key, request, 'HEAD');
