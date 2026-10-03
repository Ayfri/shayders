interface ShaderSortable {
	name: string;
	created: string;
}

const shaderNameCollator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

export const SHADER_SORT_OPTIONS = [
	{ value: 'newest', label: 'Newest', pocketBase: '-created,name' },
	{ value: 'oldest', label: 'Oldest', pocketBase: 'created,name' },
	{ value: 'name-asc', label: 'Name A-Z', pocketBase: 'name,-created' },
	{ value: 'name-desc', label: 'Name Z-A', pocketBase: '-name,-created' },
] as const;

export type ShaderSort = (typeof SHADER_SORT_OPTIONS)[number]['value'];

function getSortOption(sort: ShaderSort) {
	return SHADER_SORT_OPTIONS.find((option) => option.value === sort) ?? SHADER_SORT_OPTIONS[0];
}

export function normalizeShaderSort(value: string | null | undefined): ShaderSort {
	return SHADER_SORT_OPTIONS.find((option) => option.value === value)?.value ?? SHADER_SORT_OPTIONS[0].value;
}

export function getShaderListSort(sort: ShaderSort): string {
	return getSortOption(sort).pocketBase;
}

export function getShaderSortLabel(sort: ShaderSort): string {
	return getSortOption(sort).label;
}

/** Re-sorts a server page with a numeric, case-insensitive collation that PocketBase's SQL ordering lacks. */
export function sortShaders<T extends ShaderSortable>(shaders: readonly T[], sort: ShaderSort): T[] {
	const byName = (left: T, right: T) => shaderNameCollator.compare(left.name, right.name);
	const byCreated = (left: T, right: T) => left.created.localeCompare(right.created);

	return shaders.toSorted((left, right) => {
		switch (sort) {
			case 'oldest':
				return byCreated(left, right) || byName(left, right);
			case 'name-asc':
				return byName(left, right) || byCreated(right, left);
			case 'name-desc':
				return byName(right, left) || byCreated(right, left);
			case 'newest':
				return byCreated(right, left) || byName(left, right);
		}
	});
}
