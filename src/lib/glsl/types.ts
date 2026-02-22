export interface GlslTypeDoc {
	description: string;
	/** Shown as "struct equivalent" in hover */
	struct: string;
	/** Component sets for swizzle generation. Each inner array is one component
	 *  written as [xyzw-alias, rgba-alias, stpq-alias]. */
	components?: readonly (readonly [string, string, string])[];
}

export const TYPE_DOCS: Record<string, GlslTypeDoc> = {
	// Scalars
	float: {
		description: '32-bit floating-point scalar.',
		struct: 'float',
	},
	int: {
		description: '32-bit signed integer scalar.',
		struct: 'int',
	},
	uint: {
		description: '32-bit unsigned integer scalar.',
		struct: 'uint',
	},
	bool: {
		description: 'Boolean scalar (`true` / `false`).',
		struct: 'bool',
	},
	void: {
		description: 'No value (used as function return type).',
		struct: 'void',
	},

	// Float vectors
	vec2: {
		description: '2-component floating-point vector.',
		struct: 'struct vec2 {\n  float x, y;  // or .r .g / .s .t\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't']],
	},
	vec3: {
		description: '3-component floating-point vector.',
		struct: 'struct vec3 {\n  float x, y, z;  // or .r .g .b / .s .t .p\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't'], ['z', 'b', 'p']],
	},
	vec4: {
		description: '4-component floating-point vector.',
		struct: 'struct vec4 {\n  float x, y, z, w;  // or .r .g .b .a / .s .t .p .q\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't'], ['z', 'b', 'p'], ['w', 'a', 'q']],
	},

	// Integer vectors
	ivec2: {
		description: '2-component signed integer vector.',
		struct: 'struct ivec2 {\n  int x, y;\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't']],
	},
	ivec3: {
		description: '3-component signed integer vector.',
		struct: 'struct ivec3 {\n  int x, y, z;\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't'], ['z', 'b', 'p']],
	},
	ivec4: {
		description: '4-component signed integer vector.',
		struct: 'struct ivec4 {\n  int x, y, z, w;\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't'], ['z', 'b', 'p'], ['w', 'a', 'q']],
	},

	// Unsigned integer vectors
	uvec2: {
		description: '2-component unsigned integer vector.',
		struct: 'struct uvec2 {\n  uint x, y;\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't']],
	},
	uvec3: {
		description: '3-component unsigned integer vector.',
		struct: 'struct uvec3 {\n  uint x, y, z;\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't'], ['z', 'b', 'p']],
	},
	uvec4: {
		description: '4-component unsigned integer vector.',
		struct: 'struct uvec4 {\n  uint x, y, z, w;\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't'], ['z', 'b', 'p'], ['w', 'a', 'q']],
	},

	// Boolean vectors
	bvec2: {
		description: '2-component boolean vector.',
		struct: 'struct bvec2 {\n  bool x, y;\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't']],
	},
	bvec3: {
		description: '3-component boolean vector.',
		struct: 'struct bvec3 {\n  bool x, y, z;\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't'], ['z', 'b', 'p']],
	},
	bvec4: {
		description: '4-component boolean vector.',
		struct: 'struct bvec4 {\n  bool x, y, z, w;\n}',
		components: [['x', 'r', 's'], ['y', 'g', 't'], ['z', 'b', 'p'], ['w', 'a', 'q']],
	},

	// Matrices (column-major)
	mat2: {
		description: '2×2 column-major floating-point matrix.',
		struct: 'struct mat2 {\n  vec2 col0, col1;\n  // Access: m[col][row]\n}',
	},
	mat3: {
		description: '3×3 column-major floating-point matrix.',
		struct: 'struct mat3 {\n  vec3 col0, col1, col2;\n  // Access: m[col][row]\n}',
	},
	mat4: {
		description: '4×4 column-major floating-point matrix.',
		struct: 'struct mat4 {\n  vec4 col0, col1, col2, col3;\n  // Access: m[col][row]\n}',
	},
	mat2x2: { description: '2 columns × 2 rows matrix.', struct: 'mat2x2' },
	mat2x3: { description: '2 columns × 3 rows matrix.', struct: 'mat2x3' },
	mat2x4: { description: '2 columns × 4 rows matrix.', struct: 'mat2x4' },
	mat3x2: { description: '3 columns × 2 rows matrix.', struct: 'mat3x2' },
	mat3x3: { description: '3 columns × 3 rows matrix.', struct: 'mat3x3' },
	mat3x4: { description: '3 columns × 4 rows matrix.', struct: 'mat3x4' },
	mat4x2: { description: '4 columns × 2 rows matrix.', struct: 'mat4x2' },
	mat4x3: { description: '4 columns × 3 rows matrix.', struct: 'mat4x3' },
	mat4x4: { description: '4 columns × 4 rows matrix.', struct: 'mat4x4' },

	// Samplers
	sampler2D:       { description: 'Handle to a 2D texture unit.', struct: 'sampler2D' },
	sampler3D:       { description: 'Handle to a 3D texture unit.', struct: 'sampler3D' },
	samplerCube:     { description: 'Handle to a cube-map texture unit.', struct: 'samplerCube' },
	sampler2DShadow: { description: 'Handle to a 2D depth/shadow texture.', struct: 'sampler2DShadow' },
	samplerCubeShadow:{ description: 'Handle to a cube-map shadow texture.', struct: 'samplerCubeShadow' },
};

export const GLSL_TYPES = Object.keys(TYPE_DOCS);

// Swizzle generation

/**
 * Returns all valid swizzle strings for the given GLSL vector type.
 * Results are ordered: single-component first, then multi, using xyzw set
 * primarily, with rgba / stpq aliases appended.
 */
export function getSwizzles(type: string): string[] {
	const doc = TYPE_DOCS[type];
	if (!doc?.components) return [];
	const comps = doc.components;
	const n = comps.length; // 2, 3, or 4

	const result: string[] = [];

	for (let setIdx = 0; setIdx < 3; setIdx++) {
		const set = comps.map((c) => c[setIdx]);

		// 1-component
		for (const c of set) result.push(c);

		// 2-component
		for (const a of set) {
			for (const b of set) {
				result.push(a + b);
			}
		}

		// 3-component (only if source has ≥ 3 components)
		if (n >= 3) {
			for (const a of set) {
				for (const b of set) {
					for (const c of set) {
						result.push(a + b + c);
					}
				}
			}
		}

		// 4-component (only if source has ≥ 4 components)
		if (n >= 4) {
			for (const a of set) {
				for (const b of set) {
					for (const c of set) {
						for (const d of set) {
							result.push(a + b + c + d);
						}
					}
				}
			}
		}
	}

	// Deduplicate
	return [...new Set(result)];
}
