interface ShaderState {
	currentShaderId: string | null;
	name: string;
	description?: string;
	isSaving: boolean;
}

export const shaderState = $state<ShaderState>({
	currentShaderId: null as string | null,
	name: '',
	description: undefined,
	isSaving: false,
});
