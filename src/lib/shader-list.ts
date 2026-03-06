interface ShaderNameSortable {
	name: string;
	created: string;
}

const shaderNameCollator = new Intl.Collator('en-US', {
	numeric: true,
	sensitivity: 'base',
});

export const SHADER_LIST_SORT = 'name,-created';

export function sortShadersByName<T extends ShaderNameSortable>(shaders: readonly T[]): T[] {
	return [...shaders].sort((left, right) => {
		const byName = shaderNameCollator.compare(left.name, right.name);
		return byName !== 0 ? byName : right.created.localeCompare(left.created);
	});
}
