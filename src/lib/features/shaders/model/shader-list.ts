interface ShaderSortable {
	name: string;
	created: string;
}

const shaderNameCollator = new Intl.Collator('en-US', {
	numeric: true,
	sensitivity: 'base',
});

export const SHADER_SORT_OPTIONS = [
	{ value: 'newest', label: 'Newest', pocketBase: '-created,name' },
	{ value: 'oldest', label: 'Oldest', pocketBase: 'created,name' },
	{ value: 'name-asc', label: 'Name A-Z', pocketBase: 'name,-created' },
	{ value: 'name-desc', label: 'Name Z-A', pocketBase: '-name,-created' },
] as const;

export type ShaderSort = (typeof SHADER_SORT_OPTIONS)[number]['value'];

export const DEFAULT_SHADER_SORT: ShaderSort = 'newest';
export const SHADER_LIST_SORT = getShaderListSort(DEFAULT_SHADER_SORT);

function compareByName(left: ShaderSortable, right: ShaderSortable) {
	return shaderNameCollator.compare(left.name, right.name);
}

export function normalizeShaderSort(value: string | null | undefined): ShaderSort {
	return SHADER_SORT_OPTIONS.some((option) => option.value === value)
		? (value as ShaderSort)
		: DEFAULT_SHADER_SORT;
}

export function getShaderListSort(sort: ShaderSort): string {
	return SHADER_SORT_OPTIONS.find((option) => option.value === sort)?.pocketBase ?? SHADER_LIST_SORT;
}

export function getShaderSortLabel(sort: ShaderSort): string {
	return SHADER_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? 'Newest';
}

export function sortShaders<T extends ShaderSortable>(shaders: readonly T[], sort: ShaderSort): T[] {
	return [...shaders].sort((left, right) => {
		switch (sort) {
			case 'oldest': {
				const byCreated = left.created.localeCompare(right.created);
				return byCreated !== 0 ? byCreated : compareByName(left, right);
			}
			case 'name-asc': {
				const byName = compareByName(left, right);
				return byName !== 0 ? byName : right.created.localeCompare(left.created);
			}
			case 'name-desc': {
				const byName = compareByName(right, left);
				return byName !== 0 ? byName : right.created.localeCompare(left.created);
			}
			case 'newest':
			default: {
				const byCreated = right.created.localeCompare(left.created);
				return byCreated !== 0 ? byCreated : compareByName(left, right);
			}
		}
	});
}

export function sortShadersByName<T extends ShaderSortable>(shaders: readonly T[]): T[] {
	return sortShaders(shaders, 'name-asc');
}
