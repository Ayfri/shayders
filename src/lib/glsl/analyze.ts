/** Storage / parameter qualifier on a variable declaration */
export type GlslQualifier = 'uniform' | 'attribute' | 'varying' | 'const' | 'in' | 'out' | 'inout';

export interface GlslVariable {
	name: string;
	type: string;
	qualifier?: GlslQualifier;
	/** True when declared as an array, e.g. `float arr[4]` */
	arraySize?: number;
	/** Line number (1-based) where the declaration was found */
	line: number;
}

export interface GlslFunction {
	name: string;
	returnType: string;
	params: GlslVariable[];
	line: number;
	/** Last line (1-based) of the function body closing brace */
	bodyEndLine: number;
	localVariables: GlslVariable[];
}

export interface GlslDefine {
	name: string;
	value: string;
	line: number;
}

export interface GlslStructField {
	name: string;
	type: string;
}

export interface GlslStruct {
	name: string;
	fields: GlslStructField[];
	line: number;
}

export interface GlslDocument {
	variables: GlslVariable[];
	functions: GlslFunction[];
	defines: GlslDefine[];
	structs: GlslStruct[];
}

// Helpers

/** Built-in GLSL type pattern (no struct names — those are added dynamically). */
const BUILTIN_TYPE_RE =
	'(?:u?i?b?vec[234]|mat[234](?:x[234])?|sampler(?:2D|3D|Cube(?:Shadow)?|2DShadow)|float|int|uint|bool|void)';

/** Escape a string for use inside a RegExp character class or alternation. */
function escapeReAnalyze(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a type-pattern string that includes the given struct names. */
function buildTypeRe(structNames: string[]): string {
	if (structNames.length === 0) return BUILTIN_TYPE_RE;
	// BUILTIN_TYPE_RE starts with `(?:` (3 chars) and ends with `)` (1 char)
	return `(?:${BUILTIN_TYPE_RE.slice(3, -1)}|${structNames.map(escapeReAnalyze).join('|')})`;
}

function stripComments(src: string): string {
	// Replace block comments with equal-length whitespace (preserves line numbers)
	let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
	// Replace line comments
	out = out.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
	return out;
}

function lineOf(src: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < src.length; i++) {
		if (src[i] === '\n') line++;
	}
	return line;
}

// Main parser
export function analyzeDocument(src: string): GlslDocument {
	const clean = stripComments(src);

	const variables: GlslVariable[] = [];
	const functions: GlslFunction[] = [];
	const defines: GlslDefine[] = [];
	const structs: GlslStruct[] = [];
	const seen = new Set<string>();

	function addVar(v: GlslVariable) {
		if (!seen.has(v.name)) {
			seen.add(v.name);
			variables.push(v);
		}
	}

	// Struct declarations: struct Name { type field; ... }
	// Uses a simple [^}]* body match — nested structs are not valid GLSL so this is safe.
	const structRe = /\bstruct\s+(\w+)\s*\{([^}]*)\}/g;
	for (const m of clean.matchAll(structRe)) {
		const structName = m[1];
		const body = m[2];
		const fields: GlslStructField[] = [];
		const fieldRe = /\b(\w+)\s+(\w+)\s*(?:\[\s*(\d+)\s*\])?\s*;/g;
		for (const fm of body.matchAll(fieldRe)) {
			fields.push({ name: fm[2], type: fm[1] });
		}
		structs.push({ name: structName, fields, line: lineOf(clean, m.index!) });
	}

	// Build a type-pattern string that includes user-defined struct names so that
	// variables of struct type (e.g. `uniform MyStruct foo;`) are properly parsed.
	const TYPE_RE_SRC = buildTypeRe(structs.map((s) => s.name));

	// #define
	const defineRe = /#define\s+(\w+)(?:\([^)]*\))?\s*([^\n]*)/g;
	for (const m of clean.matchAll(defineRe)) {
		defines.push({ name: m[1], value: m[2].trim(), line: lineOf(clean, m.index!) });
	}

	// Qualified global declarations (uniform / attribute / varying / const)
	// Matches optional array suffix for things like `uniform sampler2D uTex[4];`.
	const qualifiedRe = new RegExp(
		`\\b(uniform|attribute|varying|const)\\s+(?:(?:lowp|mediump|highp)\\s+)?(${TYPE_RE_SRC})\\s+(\\w+)(?:\\s*\\[\\s*(\\d+)\\s*\\])?\\s*(?:;|=)`,
		'g',
	);
	for (const m of clean.matchAll(qualifiedRe)) {
		addVar({
			name:      m[3],
			type:      m[2],
			qualifier: m[1] as GlslQualifier,
			arraySize: m[4] !== undefined ? parseInt(m[4], 10) : undefined,
			line:      lineOf(clean, m.index!),
		});
	}

	// Character ranges [start, end) of every function body — used below to exclude
	// local variable declarations from the global-scope scan.
	const funcBodyRanges: Array<{ start: number; end: number }> = [];

	// Function declarations with local variable tracking
	const funcRe = new RegExp(
		`\\b(${TYPE_RE_SRC})\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`,
		'g',
	);
	for (const m of clean.matchAll(funcRe)) {
		const returnType = m[1];
		const name = m[2];
		const paramStr = m[3];
		const funcStartIndex = m.index! + m[0].length - 1; // index of opening '{'

		const params: GlslVariable[] = [];
		for (const part of paramStr.split(',')) {
			const pm = part.trim().match(
				new RegExp(`\\b(?:(in|out|inout)\\s+)?(?:(?:lowp|mediump|highp)\\s+)?(${TYPE_RE_SRC})\\s+(\\w+)`),
			);
			if (pm) {
				params.push({
					name:      pm[3],
					type:      pm[2],
					qualifier: (pm[1] as GlslQualifier) ?? 'in',
					line:      lineOf(clean, m.index!),
				});
			}
		}

		// Find the matching closing brace of the function body
		let braceDepth = 1;
		let funcBodyEndIndex = funcStartIndex + 1;
		while (braceDepth > 0 && funcBodyEndIndex < clean.length) {
			if (clean[funcBodyEndIndex] === '{') braceDepth++;
			else if (clean[funcBodyEndIndex] === '}') braceDepth--;
			funcBodyEndIndex++;
		}

		funcBodyRanges.push({ start: funcStartIndex, end: funcBodyEndIndex });

		const funcBody = clean.slice(funcStartIndex + 1, funcBodyEndIndex - 1);
		const bodyEndLine = lineOf(clean, funcBodyEndIndex - 1);

		// Parse local variables within this function
		const localVariables: GlslVariable[] = [...params];
		const localVarRe = new RegExp(
			`\\b(${TYPE_RE_SRC})\\s+(\\w+(?:\\s*,\\s*\\w+)*)\\s*(?:=|;)`,
			'g',
		);
		for (const lm of funcBody.matchAll(localVarRe)) {
			const type = lm[1];
			const names = lm[2].split(',').map((s) => s.trim());
			for (const varName of names) {
				if (!localVariables.find((v) => v.name === varName)) {
					localVariables.push({
						name: varName,
						type,
						line: lineOf(clean, funcStartIndex + (lm.index ?? 0)),
					});
				}
			}
		}

		functions.push({ name, returnType, params, line: lineOf(clean, m.index!), bodyEndLine, localVariables });

		for (const p of params) addVar(p);
	}

	// Top-level (global scope) variable declarations without a qualifier:
	// e.g. `vec3 myGlobal;`  or  `float a, b = 1.0;`
	// We must skip any match that falls inside a function body, otherwise local
	// variables would be incorrectly promoted to the global variables list.
	const globalVarRe = new RegExp(
		`\\b(${TYPE_RE_SRC})\\s+(\\w+(?:\\s*,\\s*\\w+)*)\\s*(?:=|;)`,
		'g',
	);
	for (const m of globalVarRe[Symbol.matchAll](clean)) {
		const idx = m.index!;
		if (funcBodyRanges.some((r) => idx >= r.start && idx < r.end)) continue;
		const type = m[1];
		const names = m[2].split(',').map((s) => s.trim());
		for (const name of names) {
			if (!functions.find((f) => f.name === name)) {
				addVar({ name, type, line: lineOf(clean, idx) });
			}
		}
	}

	return { variables, functions, defines, structs };
}

/** Look up the type of a symbol in the global variables list. */
export function resolveType(doc: GlslDocument, name: string): string | undefined {
	return doc.variables.find((v) => v.name === name)?.type;
}

/**
 * Look up the type of a symbol considering both local and global scope.
 * Pass the current cursor line (1-based) to enable function-local variable lookup.
 */
export function resolveScopedType(
	doc: GlslDocument,
	name: string,
	cursorLine: number,
): string | undefined {
	const fn = doc.functions.find(
		(f) => cursorLine >= f.line && cursorLine <= f.bodyEndLine,
	);
	if (fn) {
		const local = fn.localVariables.find((v) => v.name === name);
		if (local) return local.type;
	}
	return resolveType(doc, name);
}

// Unused / no-effect analysis

export interface UnusedItem {
	name: string;
	line: number;
	/** 1-based inclusive */
	startColumn: number;
	/** 1-based exclusive */
	endColumn: number;
	kind: 'variable' | 'function' | 'define' | 'void-expression' | 'uniform';
	message: string;
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pattern for GLSL primitive types used as value-discarding constructors
const CONSTRUCTOR_TYPE_RE =
	'(?:u?i?b?vec[234]|mat[234](?:x[234])?|float|int|uint|bool)';

/**
 * Finds:
 *  - User-defined variables (local / const) that are declared but never read.
 *  - User-defined functions (non-main) that are declared but never called.
 *  - Expression statements whose result is immediately discarded
 *    (e.g. `vec3(1.0);`, `float(x);`).
 */
export function findUnused(src: string, doc: GlslDocument): UnusedItem[] {
	const clean     = stripComments(src);
	const srcLines  = src.split('\n');
	const cleanLines = clean.split('\n');
	const result: UnusedItem[] = [];

	// Unused functions
	for (const fn of doc.functions) {
		if (fn.name === 'main') continue;

		const occurrences = (clean.match(new RegExp(`\\b${escapeRe(fn.name)}\\b`, 'g')) ?? []).length;
		// ≤ 1 → only appears in the function header itself
		if (occurrences <= 1) {
			const lineContent = srcLines[fn.line - 1] ?? '';
			const col = lineContent.indexOf(fn.name);
			if (col >= 0) {
				result.push({
					name: fn.name,
					line: fn.line,
					startColumn: col + 1,
					endColumn: col + fn.name.length + 1,
					kind: 'function',
					message: `Function '${fn.name}' is declared but never called.`,
				});
			}
		}
	}

	// Unused uniforms (shown as grayed-out, no warning)
	for (const v of doc.variables) {
		if (v.qualifier !== 'uniform') continue;
		const occurrences = (clean.match(new RegExp(`\\b${escapeRe(v.name)}\\b`, 'g')) ?? []).length;
		if (occurrences <= 1) {
			const lineContent = srcLines[v.line - 1] ?? '';
			const col = lineContent.indexOf(v.name);
			if (col >= 0) {
				result.push({
					name: v.name,
					line: v.line,
					startColumn: col + 1,
					endColumn: col + v.name.length + 1,
					kind: 'uniform',
					message: `Uniform '${v.name}' is declared but never used in this shader.`,
				});
			}
		}
	}

	// Unused variables
	for (const v of doc.variables) {
		// Skip pipeline-visible or parameter qualifiers
		if (v.qualifier && v.qualifier !== 'const') continue;

		const occurrences = (clean.match(new RegExp(`\\b${escapeRe(v.name)}\\b`, 'g')) ?? []).length;
		// ≤ 1 → only appears in its own declaration
		if (occurrences <= 1) {
			const lineContent = srcLines[v.line - 1] ?? '';
			const col = lineContent.indexOf(v.name);
			if (col >= 0) {
				result.push({
					name: v.name,
					line: v.line,
					startColumn: col + 1,
					endColumn: col + v.name.length + 1,
					kind: 'variable',
					message: `Variable '${v.name}' is declared but never read.`,
				});
			}
		}
	}

	// Void expression statements
	// Matches lines whose only statement is a type-constructor call (result discarded).
	// e.g.  vec3(1.0, 0.5, 0.0);   float(x);   mat2(1.0);
	const voidStmtRe = new RegExp(
		`^\\s*(${CONSTRUCTOR_TYPE_RE})\\s*\\(.*\\)\\s*;\\s*$`,
	);

	for (let i = 0; i < cleanLines.length; i++) {
		if (!voidStmtRe.test(cleanLines[i])) continue;

		const originalLine = srcLines[i];
		const colStart = originalLine.search(/\S/); // first non-whitespace
		const colEnd   = originalLine.trimEnd().length;

		result.push({
			name: originalLine.trim(),
			line: i + 1,
			startColumn: colStart + 1,
			endColumn: colEnd + 1,
			kind: 'void-expression',
			message: 'Expression statement has no effect - the computed value is immediately discarded.',
		});
	}

	return result;
}
