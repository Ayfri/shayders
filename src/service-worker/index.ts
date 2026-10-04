import { self } from '$app/service-worker';
import { version } from '$app/env';
import { immutable } from '$app/manifest';

const CACHE = `shayders-${version}`;
/** Manifest paths are relative to the base path, which is the service worker scope. `resolve()` only accepts typed route paths. */
const IMMUTABLE = new Set(immutable.map((asset) => new URL(asset.path, self.registration.scope).pathname));
/** Other pages can hold per-user data (profiles, private shaders) that must not outlive a session on a shared device. */
const OFFLINE_PAGES = new Set(['/', '/new']);

/** Runtime caching only: precaching the whole build would download Monaco (~5 MB) for every visitor coming from search. */
async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (response.ok) void cache.put(request, response.clone());
	return response;
}

async function networkFirst(request: Request, key: string): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok && !response.headers.get('cache-control')?.includes('no-store')) void cache.put(key, response.clone());
		return response;
	} catch (error) {
		return (await cache.match(key)) ?? Promise.reject(error);
	}
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		await Promise.all((await caches.keys()).filter((key) => key !== CACHE).map((key) => caches.delete(key)));
		await self.clients.claim();
	})());
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (IMMUTABLE.has(url.pathname)) event.respondWith(cacheFirst(request));
	else if (request.mode === 'navigate' && OFFLINE_PAGES.has(url.pathname)) event.respondWith(networkFirst(request, url.pathname));
});
