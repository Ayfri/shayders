export const LITERAL_UNIFORM = '_shyLit';

/** Groups: 1 comment, 2 preprocessor line, 3 float literal, 4 any other token. Whitespace is skipped by `matchAll`. */
const TOKEN_PATTERN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(^[ \t]*#(?:[^\n\\]|\\[\s\S])*)|(\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)|(0[xX][\da-fA-F]+|\d+|[A-Za-z_]\w*|\+\+|--|<<=?|>>=?|&&|\|\||\^\^|[-+*/%<>=!&|^]=|\S)/gm;
const SWIZZLE = 'xyzw';

/**
 * A shader source split into its structure and the float literals that can become uniforms.
 * Two sources with the same `key` only differ in those literal values, comments or whitespace.
 */
export interface LiteralLayout {
	key: string;
	/** Source with every patchable literal read from a `uniform vec4 _shyLit[]`, so new values need no recompile. */
	patched: string;
	/** Literal values packed 4 per vec4, ready for `uniform4fv`. */
	values: Float32Array;
	vectorCount: number;
}

/**
 * Only float literals inside function bodies are patchable: GLSL ES 1.0 requires constant expressions for globals,
 * `const` declarations, array sizes, `for` headers and preprocessor directives.
 * @example analyzeLiterals('void main() { gl_FragColor = vec4(0.2, 0.4, 1.0, 1.0); }').values.length // 4
 */
export function analyzeLiterals(source: string): LiteralLayout {
	const key: string[] = [];
	const values: number[] = [];
	const patched: string[] = [];
	let braceDepth = 0;
	let bracketDepth = 0;
	let parenDepth = 0;
	let forParenDepth = -1;
	let awaitingForParen = false;
	let inConst = false;
	let cursor = 0;
	let declarationIndex = -1;

	for (const match of source.matchAll(TOKEN_PATTERN)) {
		const [text, comment, directive, float] = match;
		if (comment) continue;
		if (directive) {
			key.push(directive.replace(/\s+/g, ' ').trim());
			continue;
		}
		if (declarationIndex < 0) declarationIndex = match.index;

		if (float) {
			if (braceDepth > 0 && bracketDepth === 0 && forParenDepth < 0 && !inConst) {
				const index = values.length;
				values.push(Number.parseFloat(float));
				patched.push(source.slice(cursor, match.index), `${LITERAL_UNIFORM}[${index >> 2}].${SWIZZLE[index & 3]}`);
				cursor = match.index + float.length;
				key.push('\0');
			} else {
				key.push(float);
			}
			continue;
		}

		key.push(text);
		switch (text) {
			case '{': braceDepth += 1; break;
			case '}': braceDepth -= 1; break;
			case '[': bracketDepth += 1; break;
			case ']': bracketDepth -= 1; break;
			case ';': inConst = false; break;
			case 'const': inConst = true; break;
			case 'for': awaitingForParen = true; break;
			case '(':
				parenDepth += 1;
				if (awaitingForParen) forParenDepth = parenDepth;
				awaitingForParen = false;
				break;
			case ')':
				if (parenDepth === forParenDepth) forParenDepth = -1;
				parenDepth -= 1;
				break;
		}
	}

	const vectorCount = Math.ceil(values.length / 4);
	const packed = new Float32Array(vectorCount * 4);
	packed.set(values);
	const body = patched.join('') + source.slice(cursor);
	const insertAt = Math.max(0, declarationIndex);
	return {
		key: key.join('\n'),
		patched: vectorCount === 0
			? source
			: `${body.slice(0, insertAt)}\nuniform highp vec4 ${LITERAL_UNIFORM}[${vectorCount}];\n${body.slice(insertAt)}`,
		values: packed,
		vectorCount,
	};
}
