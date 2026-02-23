export interface GlslVariable {
	name: string;
	type: string;
	qualifier?: 'uniform' | 'attribute' | 'varying' | 'const' | 'in' | 'out' | 'inout';
	/** Line number (1-based) where the declaration was found */
	line: number;
}

export interface GlslFunction {
	name: string;
	returnType: string;
	params: GlslVariable[];
	line: number;
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

const TYPE_RE_SRC =
	'(?:u?i?b?vec[234]|mat[234](?:x[234])?|sampler(?:2D|3D|Cube(?:Shadow)?|2DShadow)|float|int|uint|bool|void)';

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
	const structRe = /\bstruct\s+(\w+)\s*\{([^}]*)\}/g;
	for (const m of clean.matchAll(structRe)) {
		const structName = m[1];
		const body = m[2];
		const fields: GlslStructField[] = [];
		const fieldRe = /\b(\w+)\s+(\w+)\s*(?:\[\s*\d+\s*\])?\s*;/g;
		for (const fm of body.matchAll(fieldRe)) {
			fields.push({ name: fm[2], type: fm[1] });
		}
		structs.push({ name: structName, fields, line: lineOf(clean, m.index!) });
		// Register struct name as a known type so variables of that type are recognised
		seen.add(structName);
	}

	// #define
	const defineRe = /#define\s+(\w+)(?:\([^)]*\))?\s*([^\n]*)/g;
	for (const m of clean.matchAll(defineRe)) {
		defines.push({ name: m[1], value: m[2].trim(), line: lineOf(clean, m.index!) });
	}

	// Qualified global declarations (uniform / attribute / varying / const)
	const qualifiedRe = new RegExp(
		`\\b(uniform|attribute|varying|const)\\s+(?:(?:lowp|mediump|highp)\\s+)?(${TYPE_RE_SRC})\\s+(\\w+)(?:\\s*\\[\\s*\\d+\\s*\\])?\\s*(?:;|=)`,
		'g',
	);
	for (const m of clean.matchAll(qualifiedRe)) {
		addVar({ name: m[3], type: m[2], qualifier: m[1] as GlslVariable['qualifier'], line: lineOf(clean, m.index!) });
	}

	// Function declarations with local variable tracking
	const funcRe = new RegExp(
		`\\b(${TYPE_RE_SRC})\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`,
		'g',
	);
	for (const m of clean.matchAll(funcRe)) {
		const returnType = m[1];
		const name = m[2];
		const paramStr = m[3];
		const funcStartIndex = m.index! + m[0].length - 1; // Position of '{'

		const params: GlslVariable[] = [];
		for (const part of paramStr.split(',')) {
			const pm = part.trim().match(
				new RegExp(`\\b(?:(in|out|inout)\\s+)?(?:(?:lowp|mediump|highp)\\s+)?(${TYPE_RE_SRC})\\s+(\\w+)`),
			);
			if (pm) {
				params.push({
					name: pm[3],
					type: pm[2],
					qualifier: (pm[1] as GlslVariable['qualifier']) ?? 'in',
					line: lineOf(clean, m.index!),
				});
			}
		}

		// Find the matching closing brace to extract function body
		let braceDepth = 1;
		let funcBodyEndIndex = funcStartIndex + 1;
		while (braceDepth > 0 && funcBodyEndIndex < clean.length) {
			if (clean[funcBodyEndIndex] === '{') braceDepth++;
			else if (clean[funcBodyEndIndex] === '}') braceDepth--;
			funcBodyEndIndex++;
		}
		const funcBody = clean.slice(funcStartIndex + 1, funcBodyEndIndex - 1);

		// Parse local variables within this function
		const localVariables: GlslVariable[] = [...params]; // Include params in scope
		const localVarRe = new RegExp(
			`\\b(${TYPE_RE_SRC})\\s+(\\w+(?:\\s*,\\s*\\w+)*)\\s*(?:=|;)`,
			'g',
		);
		for (const lm of funcBody.matchAll(localVarRe)) {
			const type = lm[1];
			const names = lm[2].split(',').map((s) => s.trim());
			for (const varName of names) {
				if (!localVariables.find((v) => v.name === varName)) {
					const varLine = lineOf(clean, funcStartIndex + (lm.index ?? 0));
					localVariables.push({ name: varName, type, line: varLine });
				}
			}
		}

		functions.push({ name, returnType, params, line: lineOf(clean, m.index!), localVariables });

		for (const p of params) addVar(p);
	}

	// Local variable declarations (global scope only, not inside functions)
	// type name; / type name = expr; / type name, name2;
	// This regex pattern is now only for global-scope locals since function-scoped ones are handled above
	const localRe = new RegExp(
		`\\b(${TYPE_RE_SRC})\\s+(\\w+(?:\\s*,\\s*\\w+)*)\\s*(?:=|;)`,
		'g',
	);
	for (const m of clean.matchAll(localRe)) {
		const type = m[1];
		const names = m[2].split(',').map((s) => s.trim());
		// Skip if name matches a function
		for (const name of names) {
			if (!functions.find((f) => f.name === name)) {
				addVar({ name, type, line: lineOf(clean, m.index!) });
			}
		}
	}

	return { variables, functions, defines, structs };
}

/** Look up the type of a symbol by name within a GlslDocument. */
export function resolveType(doc: GlslDocument, name: string): string | undefined {
	return doc.variables.find((v) => v.name === name)?.type;
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

// Pattern for GLSL primitive types used as constructors
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
