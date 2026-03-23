export function buildShaderAssetUrl(key: string): string {
	const normalizedKey = key.replace(/^\/+|\/+$/g, '');
	return `/api/assets/${normalizedKey.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
}
