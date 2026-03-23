import type { ShadersVisiblityOptions } from '$lib/pocketbase-types';

interface ShaderState {
	currentShaderId: string | null;
	name: string;
	description?: string;
	visiblity: keyof typeof ShadersVisiblityOptions;
	isSaving: boolean;
}

export const shaderState = $state<ShaderState>({
	currentShaderId: null as string | null,
	name: '',
	description: undefined,
	visiblity: 'public',
	isSaving: false,
});
