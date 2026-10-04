import { type ChannelEntry, type ShaderBuffer, serializeShaderContent } from '#features/shaders/model/shader-content.js';

interface ShaderMutationPayload {
	buffers: ShaderBuffer[];
	channels: ChannelEntry[];
	description: string;
	name: string;
	token: string;
	visiblity: string;
}

interface ForkShaderMutationPayload extends ShaderMutationPayload {
	/** Saved shader being forked, the server copies its assets instead of sharing them. */
	forkOf: string | null;
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

export async function forkShaderRecord(payload: ForkShaderMutationPayload): Promise<Response> {
	return postShaderMutation(payload, {
		forkOf: payload.forkOf,
		name: `Fork of ${payload.name}`,
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
	return postShaderMutation(payload, {
		cleanupKeys: payload.cleanupKeys,
		shaderId: payload.shaderId,
	});
}

function postShaderMutation(payload: ShaderMutationPayload, extra: Record<string, unknown>): Promise<Response> {
	return fetch('/api/shaders', {
		body: JSON.stringify({
			content: serializeShaderContent(payload.buffers, payload.channels),
			description: payload.description,
			name: payload.name,
			visiblity: payload.visiblity,
			...extra,
		}),
		headers: {
			Authorization: `Bearer ${payload.token}`,
			'Content-Type': 'application/json',
		},
		method: 'POST',
	});
}
