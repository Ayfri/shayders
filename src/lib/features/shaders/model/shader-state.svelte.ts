import { createContext } from 'svelte';
import type { ShaderVisibility } from '#features/shaders/model/shader-visibility.js';

/** Metadata of the shader open in the editor, one instance per editor so SSR renders the real name and requests never share it. */
export class ShaderState {
	public currentShaderId = $state<string | null>(null);
	public description = $state('');
	public isSaving = $state(false);
	public name = $state('');
	public visiblity = $state<ShaderVisibility>('public');

	public constructor(init: { description?: string; id?: string; name?: string; visiblity?: ShaderVisibility }) {
		this.currentShaderId = init.id ?? null;
		this.description = init.description ?? '';
		this.name = init.name ?? 'Untitled Shader';
		this.visiblity = init.visiblity ?? 'public';
	}

	/** Changes whenever a saved field changes, compared against a snapshot to detect unsaved edits. */
	public get metaKey(): string {
		return `${this.name}\n${this.description}\n${this.visiblity}`;
	}
}

export const [getShaderState, setShaderState] = createContext<ShaderState>();
