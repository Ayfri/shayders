import type { ChannelEntry, ShaderBuffer } from '$features/shaders/model/shader-content';

interface ShaderMutationPayload {
	buffers: ShaderBuffer[];
	channels: ChannelEntry[];
	description: string;
	name: string;
	token: string;
	visiblity: string;
}

interface SaveShaderMutationPayload extends ShaderMutationPayload {
	cleanupKeys: string[];
	shaderId: string | null;
}

interface ShaderMutationResponse {
	record?: {
		id: string;
	};
}

interface ShaderDraftData {
	buffers: ShaderBuffer[];
	description: string;
	name: string;
	visiblity: string;
}

export async function forkShaderRecord(payload: ShaderMutationPayload): Promise<Response> {
	return postShaderMutation(payload.token, {
		buffers: payload.buffers,
		channels: payload.channels,
		description: payload.description,
		name: `Fork of ${payload.name}`,
		visiblity: payload.visiblity,
	});
}

export async function readShaderMutationId(response: Response): Promise<string | null> {
	return ((await response.json()) as ShaderMutationResponse).record?.id ?? null;
}

export function saveShaderDraft(data: ShaderDraftData): boolean {
	try {
		localStorage.setItem('shayders_draft', JSON.stringify({
			...data,
			savedAt: new Date().toISOString(),
		}));
		return true;
	} catch (error) {
		console.error('Error during local save', error);
		return false;
	}
}

export async function saveShaderRecord(payload: SaveShaderMutationPayload): Promise<Response> {
	return postShaderMutation(payload.token, {
		buffers: payload.buffers,
		channels: payload.channels,
		cleanupKeys: payload.cleanupKeys,
		description: payload.description,
		name: payload.name,
		shaderId: payload.shaderId,
		visiblity: payload.visiblity,
	});
}

function postShaderMutation(token: string, body: Record<string, unknown>): Promise<Response> {
	return fetch('/api/shaders', {
		body: JSON.stringify(body),
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		method: 'POST',
	});
}

