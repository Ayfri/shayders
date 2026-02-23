interface ShaderState {
	currentShaderId: string | null;
	name: string;
	description?: string;
	visiblity: 'public' | 'unlisted' | 'private';
	isSaving: boolean;
}

export const shaderState = $state<ShaderState>({
	currentShaderId: null as string | null,
	name: '',
	description: undefined,
	visiblity: 'public',
	isSaving: false,
});
