import type { ShaderVisibility } from '#features/shaders/model/shader-visibility.js';

interface ShaderState {
	currentShaderId: string | null;
	description: string;
	isSaving: boolean;
	name: string;
	visiblity: ShaderVisibility;
}

export const shaderState = $state<ShaderState>({
	currentShaderId: null,
	description: '',
	isSaving: false,
	name: '',
	visiblity: 'public',
});
