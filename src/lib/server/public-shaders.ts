import { createPocketBase } from '#lib/pocketbase.js';
import type { ShadersResponse, UsersResponse } from '#lib/pocketbase-types.js';

export interface PublicShaderEntry {
	authorId: string;
	authorName: string;
	description: string;
	id: string;
	name: string;
	updated: string;
}

/** Every public shader without its content, shared by the sitemap and llms.txt. */
export async function listPublicShaders(): Promise<PublicShaderEntry[]> {
	const shaders = await createPocketBase()
		.collection('shaders')
		.getFullList<ShadersResponse<unknown, { user_id?: UsersResponse }>>({
			expand: 'user_id',
			fields: 'id,name,description,updated,user_id,expand.user_id.name',
			filter: 'visiblity = "public"',
			sort: '-updated',
		});

	return shaders.map((shader) => ({
		authorId: shader.user_id,
		authorName: shader.expand?.user_id?.name || 'Unknown',
		description: shader.description ?? '',
		id: shader.id,
		name: shader.name,
		updated: shader.updated,
	}));
}
