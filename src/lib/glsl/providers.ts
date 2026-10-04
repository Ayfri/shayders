import type * as Monaco from 'monaco-editor/editor';
import { BUILTIN_DOCS, type GlslDoc, UNIFORM_DOCS } from '#lib/glsl/builtins.js';
import { TYPE_DOCS, GLSL_TYPES, getSwizzles } from '#lib/glsl/types.js';
import { GLSL_KEYWORDS, GLSL_PREPROCESSOR, KEYWORD_DOCS, PREDEFINED_MACRO_DOCS, PREPROCESSOR_DOCS } from '#lib/glsl/keywords.js';
import { analyzeModel, findLocal, type GlslDocument, type GlslFunction, type GlslVariable, resolveScopedType, resolveType } from '#lib/glsl/analyze.js';
import { registerCodeActions } from '#lib/glsl/code-actions.js';
import { type ColorPreviewListener, registerColorProvider } from '#lib/glsl/color-provider.js';
import { registerSemanticTokens } from '#lib/glsl/semantic-tokens.js';
import { GlslUnit, modelUnit } from '#lib/glsl/unit.js';

const DISPOSABLES_KEY = '__glslProviderDisposables';
const ACTIVE_EDITOR_KEY = '__glslActiveEditor';
const GOTO_POSITION_COMMAND_ID = '__glslGotoPosition';

export function registerGlslProviders(monaco: typeof Monaco, onColorPreview?: ColorPreviewListener): void {
	const g = globalThis as Record<string, unknown>;
	const prev = g[DISPOSABLES_KEY] as Monaco.IDisposable[] | undefined;
	if (prev) for (const d of prev) d.dispose();

	g[DISPOSABLES_KEY] = [
		registerCompletion(monaco),
		registerHover(monaco),
		registerDefinition(monaco),
		registerSignatureHelp(monaco),
		registerInlayHints(monaco),
		registerSemanticTokens(monaco),
		registerColorProvider(monaco, onColorPreview),
		registerCodeActions(monaco),
	];
}

// Keywords that look like function calls but are not
const NON_FUNCTION_KEYWORDS = new Set([
	'if', 'else', 'for', 'while', 'do', 'switch', 'return',
	'discard', 'break', 'continue', 'struct',
]);

// Abstract GLSL genType aliases used in builtin signatures → their scalar family
const GENTYPE_FAMILY: Record<string, string> = {
	genType:  'float',
	genIType: 'int',
	genUType: 'uint',
	genBType: 'bool',
	// Abstract return-type shorthands used in builtin signatures
	vecN:     'float',
	ivecN:    'int',
	uvecN:    'uint',
	bvecN:    'bool',
	matN:     'float',
	matNxM:   'float',
};

// Returns the scalar component family for a concrete GLSL type
function getScalarFamily(type: string): 'float' | 'int' | 'uint' | 'bool' | null {
	if (type === 'float' || /^vec\d$/.test(type) || /^mat\d/.test(type) || /^mat\dx\d$/.test(type)) return 'float';
	if (type === 'int'   || /^ivec\d$/.test(type)) return 'int';
	if (type === 'uint'  || /^uvec\d$/.test(type)) return 'uint';
	if (type === 'bool'  || /^bvec\d$/.test(type)) return 'bool';
	return null; // sampler2D, void, etc. → exact match only
}

// Extract GLSL type from a parameter string like "inout vec3 color" → "vec3"
function parseParamType(paramStr: string): string | null {
	const qualifiers = new Set(['in', 'out', 'inout', 'lowp', 'mediump', 'highp', 'const', 'precision']);
	const parts = paramStr.trim().split(/\s+/).filter(Boolean);
	const filtered = parts.filter((p) => !qualifiers.has(p));
	return filtered.length >= 2 ? filtered[0] : null;
}

// Detect the enclosing function/constructor call and the 0-based argument index at cursor col
function inferCallContext(
	lineText: string,
	col: number,
): { fnName: string; argIndex: number } | null {
	let depth = 0;
	for (let i = col - 1; i >= 0; i--) {
		const ch = lineText[i];
		if (ch === ')' || ch === ']') { depth++; continue; }
		if (ch === '[') {
			if (depth > 0) { depth--; continue; }
			return null; // inside array index → not a call argument
		}
		if (ch === '(') {
			if (depth > 0) { depth--; continue; }
			// Count commas at this nesting level from opening paren to cursor
			let commaCount = 0;
			let d = 0;
			for (let j = i + 1; j < col; j++) {
				const c = lineText[j];
				if (c === '(' || c === '[') d++;
				else if (c === ')' || c === ']') d--;
				else if (c === ',' && d === 0) commaCount++;
			}
			const before = lineText.slice(0, i).trimEnd();
			const fnMatch = before.match(/([a-zA-Z_]\w*)$/);
			if (!fnMatch) return null;
			const fnName = fnMatch[1];
			if (NON_FUNCTION_KEYWORDS.has(fnName)) return null;
			return { fnName, argIndex: commaCount };
		}
	}
	return null;
}

// Returns the set of acceptable types for the n-th argument of a call (null = no restriction)
function getCallArgTypes(
	fnName: string,
	argIndex: number,
	docInfo: GlslDocument,
): Set<string> | null {
	// Vector constructors: accept the scalar component type and shorter same-family vectors
	const vecMatch = fnName.match(/^([biu]?vec)(\d)$/);
	if (vecMatch) {
		const prefix = vecMatch[1];
		const n = parseInt(vecMatch[2], 10);
		const scalar = prefix === 'ivec' ? 'int' : prefix === 'uvec' ? 'uint' : prefix === 'bvec' ? 'bool' : 'float';
		const types = new Set<string>([scalar]);
		for (let k = 2; k <= n; k++) types.add(`${prefix}${k}`);
		return types;
	}
	// Matrix constructors: accept float scalars and all float vectors/matrices
	if (/^mat\d/.test(fnName)) {
		return new Set(['float', 'vec2', 'vec3', 'vec4', 'mat2', 'mat3', 'mat4',
			'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4']);
	}
	// Scalar constructors: accept any scalar type (implicit cast)
	if (fnName === 'float' || fnName === 'int' || fnName === 'uint' || fnName === 'bool') {
		return new Set(['float', 'int', 'uint', 'bool']);
	}
	// Struct constructors: accept the type of each field in declaration order
	const struct = docInfo.structs.find((s) => s.name === fnName);
	if (struct) {
		if (argIndex < struct.fields.length) {
			return new Set([struct.fields[argIndex].type]);
		}
		return null;
	}
	// User-defined function
	const fn = docInfo.functions.find((f) => f.name === fnName);
	if (fn && argIndex < fn.params.length) {
		return new Set([fn.params[argIndex].type]);
	}
	// Built-in function: collect parameter types from all overloads
	const builtin = BUILTIN_DOCS[fnName];
	if (builtin) {
		const types = new Set<string>();
		for (const sig of builtin.signature.split('\n')) {
			const inner = sig.slice(sig.indexOf('(') + 1, sig.lastIndexOf(')'));
			if (!inner.trim()) continue;
			const params = inner.split(',');
			if (argIndex < params.length) {
				const t = parseParamType(params[argIndex]);
				if (t) types.add(t);
			}
		}
		return types.size > 0 ? types : null;
	}
	return null;
}

// Check whether a concrete candidate type satisfies a set of expected types
function isTypeAcceptable(candidateType: string, expected: Set<string>): boolean {
	if (expected.has(candidateType)) return true;
	// If the candidate is itself an abstract alias (e.g. genType return type of sin)
	const candidateFamily = GENTYPE_FAMILY[candidateType] ?? getScalarFamily(candidateType);
	if (candidateFamily === null) return false; // sampler/void → exact match only
	for (const et of expected) {
		const etFamily = GENTYPE_FAMILY[et] ?? getScalarFamily(et);
		if (etFamily === candidateFamily) return true;
	}
	return false;
}

// Extract the return type from a builtin signature: "vec4 texture2D(...)" or "vec4 gl_FragCoord"
function builtinReturnType(signature: string): string | null {
	const firstLine = signature.split('\n')[0];
	const m = firstLine.match(/^([a-zA-Z_]\w*)\s+[a-zA-Z_]/);
	return m ? m[1] : null;
}

// Extract parameter names from the first overload of a BUILTIN_DOCS signature string
function extractParamNames(signature: string): string[] {
	const inner = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
	if (!inner.trim()) return [];
	return inner.split(',').map((p) => {
		const parts = p.trim().split(/\s+/);
		return parts[parts.length - 1].replace(/[^a-zA-Z0-9_]/g, '');
	}).filter(Boolean);
}

interface BuiltinOverload {
	raw: string;
	returnType: string;
	functionName: string;
	params: { raw: string; type: string; name: string }[];
}

interface WorkspaceDoc {
	model: Monaco.editor.ITextModel;
	doc: GlslDocument;
}

interface WorkspaceSymbolMatch {
	model: Monaco.editor.ITextModel;
	name: string;
	line: number;
	column: number;
	type: string | null;
	kind: 'function' | 'struct' | 'variable' | 'define';
}

function getWorkspaceDocs(monaco: typeof Monaco): WorkspaceDoc[] {
	return monaco.editor.getModels().filter((model) => model.getLanguageId() === 'glsl').map((model) => ({ doc: analyzeModel(model), model }));
}

/** Declaration of `name` seen from `cursorLine` of `cursorModel`: locals first, then this buffer's globals, then the other buffers. */
function findWorkspaceSymbol(
	monaco: typeof Monaco,
	name: string,
	cursorModel: Monaco.editor.ITextModel,
	cursorLine: number,
): WorkspaceSymbolMatch | null {
	const docs = getWorkspaceDocs(monaco);
	const local = findLocal(analyzeModel(cursorModel), name, cursorLine)?.variable;
	if (local) return { column: local.column, kind: 'variable', line: local.line, model: cursorModel, name, type: local.type };

	for (const { doc, model } of [...docs.filter((entry) => entry.model === cursorModel), ...docs.filter((entry) => entry.model !== cursorModel)]) {
		const fn = doc.functions.find((candidate) => candidate.name === name);
		if (fn) return { column: fn.column, kind: 'function', line: fn.line, model, name, type: fn.returnType };
		const struct = doc.structs.find((candidate) => candidate.name === name);
		if (struct) return { column: struct.column, kind: 'struct', line: struct.line, model, name, type: name };
		const variable = doc.variables.find((candidate) => candidate.name === name);
		if (variable) return { column: variable.column, kind: 'variable', line: variable.line, model, name, type: variable.type };
		const define = doc.defines.find((candidate) => candidate.name === name);
		if (define) return { column: define.column, kind: 'define', line: define.line, model, name, type: null };
	}
	return null;
}

interface TypeConstructorOverload {
	raw: string;
	params: { type: string; name: string }[];
}

/** Markdown link running the editor's goto command, `uri` switches to another buffer first. */
function buildGotoPositionLink(line: number, column: number, label: string, uri?: string): string {
	const args = encodeURIComponent(JSON.stringify([{ column, lineNumber: line, uri }]));
	return `[${label}](command:${GOTO_POSITION_COMMAND_ID}?${args})`;
}

function buildTypeConstructorOverloads(typeName: string): TypeConstructorOverload[] | null {
	const scalarConstructors: Record<string, string[]> = {
		float: ['float(float x)', 'float(int x)', 'float(uint x)', 'float(bool x)'],
		int:   ['int(int x)', 'int(float x)', 'int(uint x)', 'int(bool x)'],
		uint:  ['uint(uint x)', 'uint(float x)', 'uint(int x)', 'uint(bool x)'],
		bool:  ['bool(bool x)', 'bool(float x)', 'bool(int x)', 'bool(uint x)'],
	};
	const scalar = scalarConstructors[typeName];
	if (scalar) {
		return scalar.map((raw) => ({
			raw,
			params: raw.slice(raw.indexOf('(') + 1, raw.lastIndexOf(')')).split(',').map((part) => {
				const tokens = part.trim().split(/\s+/).filter(Boolean);
				return {
					type: tokens.slice(0, -1).join(' '),
					name: tokens[tokens.length - 1] ?? '',
				};
			}),
		}));
	}

	const vecMatch = typeName.match(/^([biu]?vec)(\d)$/);
	if (!vecMatch) return null;

	const prefix = vecMatch[1];
	const size = parseInt(vecMatch[2], 10);
	const scalarType = prefix === 'ivec' ? 'int' : prefix === 'uvec' ? 'uint' : prefix === 'bvec' ? 'bool' : 'float';
	const overloads = new Map<string, TypeConstructorOverload>();

	const addOverload = (params: { type: string; name: string }[]): void => {
		const raw = `${typeName}(${params.map((param) => `${param.type} ${param.name}`).join(', ')})`;
		/** Keyed by parameter types, the single-part partition repeats the copy constructor under another parameter name. */
		const key = params.map((param) => param.type).join(',');
		if (!overloads.has(key)) overloads.set(key, { raw, params });
	};

	addOverload([{ type: scalarType, name: 'x' }]);
	addOverload([{ type: typeName, name: 'v' }]);

	const buildPartitions = (remaining: number, current: number[]): void => {
		if (remaining === 0) {
			const params = current.map((part, index) => ({
				type: part === 1 ? scalarType : `${prefix}${part}`,
				name: String.fromCharCode(97 + index),
			}));
			addOverload(params);
			return;
		}

		for (let part = 1; part <= remaining; part++) {
			current.push(part);
			buildPartitions(remaining - part, current);
			current.pop();
		}
	};

	buildPartitions(size, []);
	return [...overloads.values()];
}


function parseBuiltinOverloads(signature: string): BuiltinOverload[] {
	return signature
		.split('\n')
		.map((raw) => {
			const match = raw.match(/^(\S+)\s+(\w+)\s*\((.*)\)$/);
			if (!match) return null;

			const returnType = match[1];
			const functionName = match[2];
			const paramsString = match[3];
			const params = paramsString.trim()
				? paramsString.split(',').map((part) => {
					const trimmed = part.trim();
					const tokens = trimmed.split(/\s+/).filter(Boolean);
					const name = tokens[tokens.length - 1] ?? '';
					const type = tokens.slice(0, -1).join(' ');
					return { raw: trimmed, type, name };
				})
				: [];

			return { raw, returnType, functionName, params };
		})
		.filter((overload): overload is BuiltinOverload => overload !== null);
}

function splitTopLevelArgs(args: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';

	for (const ch of args) {
		if (ch === ',' && depth === 0) {
			parts.push(current.trim());
			current = '';
			continue;
		}
		if (ch === '(' || ch === '[' || ch === '{') depth += 1;
		else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
		current += ch;
	}

	if (current.trim()) parts.push(current.trim());
	return parts;
}

function inferExpressionType(
	expression: string,
	doc: GlslDocument,
	lineNumber: number,
): string | null {
	const trimmed = expression.trim();
	if (!trimmed) return null;

	if (/^(true|false)$/.test(trimmed)) return 'bool';
	if (/^[+-]?\d+[uU]$/.test(trimmed)) return 'uint';
	if (/^[+-]?(?:\d*\.\d+|\d+\.)(?:[eE][+-]?\d+)?f?$/.test(trimmed) || /^[+-]?\d+[eE][+-]?\d+f?$/.test(trimmed)) return 'float';
	if (/^[+-]?\d+$/.test(trimmed)) return 'int';

	const constructorMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*\(/);
	if (constructorMatch && GLSL_TYPES.includes(constructorMatch[1])) return constructorMatch[1];

	const swizzleMatch = trimmed.match(/^([a-zA-Z_]\w*)\.([xyzwrgba stpq]+)$/);
	if (swizzleMatch) {
		const ownerType = resolveScopedType(doc, swizzleMatch[1], lineNumber) ?? resolveType(doc, swizzleMatch[1]);
		if (ownerType) return swizzleResultType(ownerType, swizzleMatch[2]);
	}

	const memberMatch = trimmed.match(/^([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)$/);
	if (memberMatch) {
		const ownerType = resolveScopedType(doc, memberMatch[1], lineNumber) ?? resolveType(doc, memberMatch[1]);
		if (ownerType) {
			const struct = doc.structs.find((s) => s.name === ownerType);
			const field = struct?.fields.find((f) => f.name === memberMatch[2]);
			if (field) return field.type;
		}
	}

	return resolveScopedType(doc, trimmed, lineNumber) ?? resolveType(doc, trimmed) ?? null;
}

function resolveBuiltinOverload(
	name: string,
	args: string[],
	doc: GlslDocument,
	lineNumber: number,
): { overload: BuiltinOverload; inferredTypes: (string | null)[] } | null {
	const builtin = BUILTIN_DOCS[name];
	if (!builtin) return null;

	const overloads = parseBuiltinOverloads(builtin.signature);
	if (overloads.length === 0) return null;

	const inferredTypes = args.map((arg) => inferExpressionType(arg, doc, lineNumber));
	let best: { overload: BuiltinOverload; score: number } | null = null;

	for (const overload of overloads) {
		if (args.length > overload.params.length) continue;

		let score = 0;
		let valid = true;

		for (let i = 0; i < args.length; i++) {
			const actualType = inferredTypes[i];
			const expectedType = parseParamType(overload.params[i]?.raw ?? '');
			if (!expectedType) continue;
			if (!actualType) continue;

			if (actualType === expectedType) {
				score += 4;
				continue;
			}

			if (isTypeAcceptable(actualType, new Set([expectedType]))) {
				score += 1;
				continue;
			}

			valid = false;
			break;
		}

		if (!valid) continue;
		if (!best || score > best.score) best = { overload, score };
	}

	return best ? { overload: best.overload, inferredTypes } : { overload: overloads[0], inferredTypes };
}

function isStandaloneCodeEditor(value: unknown): value is Monaco.editor.IStandaloneCodeEditor {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as {
		getModel?: unknown;
		getPosition?: unknown;
	};
	return typeof candidate.getModel === 'function' && typeof candidate.getPosition === 'function';
}

function getActiveCursorPositionForModel(
	model: Monaco.editor.ITextModel,
	fallback: Monaco.Position,
): Monaco.Position {
	const activeEditor = (globalThis as Record<string, unknown>)[ACTIVE_EDITOR_KEY];
	if (!isStandaloneCodeEditor(activeEditor)) return fallback;

	const activeModel = activeEditor.getModel();
	const activePosition = activeEditor.getPosition();
	if (!activeModel || !activePosition) return fallback;
	if (activeModel.uri.toString() !== model.uri.toString()) return fallback;
	return activePosition;
}

interface CallInfoAtName {
	args: string[];
	activeArgIndex: number | null;
}

function argumentIndexAtColumn(
	lineText: string,
	openParenIndex: number,
	closeParenIndex: number,
	cursorIndex: number,
): number | null {
	if (cursorIndex <= openParenIndex || cursorIndex > closeParenIndex) return null;

	let depth = 0;
	let commaCount = 0;
	for (let i = openParenIndex + 1; i < Math.min(cursorIndex, closeParenIndex); i++) {
		const ch = lineText[i];
		if (ch === '(' || ch === '[' || ch === '{') depth += 1;
		else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
		else if (ch === ',' && depth === 0) commaCount += 1;
	}

	return commaCount;
}

function extractCallInfoAtFunctionName(
	lineText: string,
	wordEndColumn: number,
	activeCursorColumn: number | null,
): CallInfoAtName | null {
	let openParenIndex = wordEndColumn - 1;
	while (openParenIndex < lineText.length && /\s/.test(lineText[openParenIndex] ?? '')) openParenIndex += 1;
	if (lineText[openParenIndex] !== '(') return null;

	let depth = 0;
	let closeParenIndex = -1;
	for (let i = openParenIndex; i < lineText.length; i++) {
		const ch = lineText[i];
		if (ch === '(') depth += 1;
		else if (ch === ')') {
			depth -= 1;
			if (depth === 0) {
				closeParenIndex = i;
				break;
			}
		}
	}

	if (closeParenIndex === -1) return null;
	const args = splitTopLevelArgs(lineText.slice(openParenIndex + 1, closeParenIndex));

	let activeArgIndex: number | null = null;
	if (activeCursorColumn !== null) {
		activeArgIndex = argumentIndexAtColumn(
			lineText,
			openParenIndex,
			closeParenIndex,
			activeCursorColumn - 1,
		);
	}

	return { args, activeArgIndex };
}

const PARAMETER_FALLBACK_DOCS: Record<string, string> = {
	a: 'Interpolation or selector factor.',
	bias: 'Optional LOD bias added to the sampling level.',
	coord: 'Normalized texture coordinates/direction used for lookup.',
	edge: 'Threshold value.',
	edge0: 'Lower edge of the interpolation range.',
	edge1: 'Upper edge of the interpolation range.',
	eta: 'Ratio of refractive indices (n₁ / n₂).',
	I: 'Incident vector.',
	N: 'Surface normal vector.',
	Nref: 'Reference normal used for orientation tests.',
	maxVal: 'Upper bound.',
	minVal: 'Lower bound.',
	p0: 'First point/vector.',
	p1: 'Second point/vector.',
	sampler: 'Sampler bound to the source texture.',
	x: 'Input value.',
	y: 'Second input value.',
};

function formatGlslCodeBlock(lines: string[]): string {
	return ['```glsl', ...lines, '```'].join('\n');
}

function expandAbstractType(typeText: string, genericDim: number, n: number, m: number): string {
	const vectorSuffix = genericDim === 1 ? '' : String(genericDim);
	const genericReplacements: Array<[RegExp, string]> = [
		[/\bgenIType\b/g, genericDim === 1 ? 'int' : `ivec${vectorSuffix}`],
		[/\bgenUType\b/g, genericDim === 1 ? 'uint' : `uvec${vectorSuffix}`],
		[/\bgenBType\b/g, genericDim === 1 ? 'bool' : `bvec${vectorSuffix}`],
		[/\bgenType\b/g, genericDim === 1 ? 'float' : `vec${vectorSuffix}`],
	];

	const shapeReplacements: Array<[RegExp, string]> = [
		[/\bmatMxN\b/g, `mat${m}x${n}`],
		[/\bmatNxM\b/g, `mat${n}x${m}`],
		[/\bmatN\b/g, `mat${n}`],
		[/\bbvecN\b/g, `bvec${n}`],
		[/\bivecN\b/g, `ivec${n}`],
		[/\buvecN\b/g, `uvec${n}`],
		[/\bvecM\b/g, `vec${m}`],
		[/\bvecN\b/g, `vec${n}`],
	];

	let expanded = typeText;
	for (const [pattern, replacement] of genericReplacements) expanded = expanded.replace(pattern, replacement);
	for (const [pattern, replacement] of shapeReplacements) expanded = expanded.replace(pattern, replacement);
	return expanded;
}

// Completion range: start = word start, end = end of full word at position (for mid-word replace)
function completionRange(
	monaco: typeof Monaco,
	model: Monaco.editor.ITextModel,
	position: Monaco.Position,
): Monaco.IRange {
	const wordUntil = model.getWordUntilPosition(position);
	const wordAt    = model.getWordAtPosition(position);
	return {
		startLineNumber: position.lineNumber,
		endLineNumber:   position.lineNumber,
		startColumn:     wordUntil.startColumn,
		endColumn:       wordAt?.endColumn ?? position.column,
	};
}

/** Returns the result type of a swizzle expression, e.g. `vec3.xy` → `vec2`. */
function swizzleResultType(sourceType: string, swizzle: string): string {
	if (swizzle.length === 1) {
		if (sourceType.startsWith('i')) return 'int';
		if (sourceType.startsWith('u')) return 'uint';
		if (sourceType.startsWith('b')) return 'bool';
		return 'float';
	}
	const n = swizzle.length;
	if (sourceType.startsWith('ivec')) return `ivec${n}`;
	if (sourceType.startsWith('uvec')) return `uvec${n}`;
	if (sourceType.startsWith('bvec')) return `bvec${n}`;
	return `vec${n}`;
}

/** Member chain ending the text, indexing included: `gl_FragCoord.xy`, `lights[i].color`. */
const MEMBER_CHAIN_RE = /([a-zA-Z_]\w*(?:\s*\[[^\]]*\])*(?:\s*\.\s*[a-zA-Z_]\w*(?:\s*\[[^\]]*\])*)*)\s*$/;

/**
 * Resolves the type of the member chain ending `textBeforeDot` by walking struct fields and swizzles from its root symbol.
 * @example resolveMemberChain(monaco, model, 'gl_FragCoord.xy', 3) // { expression: 'gl_FragCoord.xy', type: 'vec2' }
 */
function resolveMemberChain(
	monaco: typeof Monaco,
	model: Monaco.editor.ITextModel,
	textBeforeDot: string,
	lineNumber: number,
): { expression: string; type: string } | null {
	const expression = textBeforeDot.match(MEMBER_CHAIN_RE)?.[1];
	if (!expression) return null;
	const [root, ...members] = expression.replace(/\s*\[[^\]]*\]/g, '').split('.').map((part) => part.trim());
	let type = resolveScopedType(analyzeModel(model), root, lineNumber)
		?? findWorkspaceSymbol(monaco, root, model, lineNumber)?.type
		?? BUILTIN_DOCS[root]?.signature.match(/^(\w+)/)?.[1]
		?? null;
	const structs = getWorkspaceDocs(monaco).flatMap((entry) => entry.doc.structs);
	for (const member of members) {
		if (!type) return null;
		const ownerType: string = type;
		const field = structs.find((struct) => struct.name === ownerType)?.fields.find((candidate) => candidate.name === member);
		type = field?.type ?? (getSwizzles(ownerType).includes(member) ? swizzleResultType(ownerType, member) : null);
	}
	return type ? { expression, type } : null;
}

function registerCompletion(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerCompletionItemProvider('glsl', {
		triggerCharacters: ['.', '#'],

		provideCompletionItems(model, position, context) {
			const CIK  = monaco.languages.CompletionItemKind;
			const CITR = monaco.languages.CompletionItemInsertTextRule;

			// Member access completions after a dot
			if (context.triggerCharacter === '.') {
				const lineText = model.getLineContent(position.lineNumber);
				const type = resolveMemberChain(monaco, model, lineText.slice(0, position.column - 2), position.lineNumber)?.type;
				if (!type) return { suggestions: [] };

				const dotRange: Monaco.IRange = {
					startLineNumber: position.lineNumber,
					endLineNumber:   position.lineNumber,
					startColumn:     position.column,
					endColumn:       position.column,
				};

				// Struct field completions
				const struct = getWorkspaceDocs(monaco).flatMap((entry) => entry.doc.structs).find((s) => s.name === type);
				if (struct) {
					return {
						suggestions: struct.fields.map((f, i) => ({
							label:      { label: f.name, description: f.type },
							kind:       CIK.Field,
							insertText: f.name,
							sortText:   String(i).padStart(6, '0'),
							detail:     `${type}.${f.name}: ${f.type}`,
							range:      dotRange,
						})),
					};
				}

				// Swizzle completions for vector/matrix types
				const swizzles = getSwizzles(type);
				if (swizzles.length === 0) return { suggestions: [] };

				return {
					suggestions: swizzles.map((sw, i) => ({
						label:      { label: sw, description: swizzleResultType(type, sw) },
						kind:       CIK.Field,
						insertText: sw,
						sortText:   String(i).padStart(6, '0'),
						detail:     `${type}.${sw} → ${swizzleResultType(type, sw)}`,
						range:      dotRange,
					})),
				};
			}

			// Preprocessor completions after #
			if (context.triggerCharacter === '#') {
				const word = model.getWordUntilPosition(position);
				const range: Monaco.IRange = {
					startLineNumber: position.lineNumber,
					endLineNumber:   position.lineNumber,
					startColumn:     word.startColumn - 1, // include '#'
					endColumn:       word.endColumn,
				};
				return {
					suggestions: GLSL_PREPROCESSOR.map((pp) => ({
						label:      pp,
						kind:       CIK.Keyword,
						insertText: pp.slice(1),
						range,
					})),
				};
			}

			// Check for member access even when triggerCharacter is not '.' (e.g. Ctrl+Space mid-word)
			const lineText = model.getLineContent(position.lineNumber);
			const textBefore = lineText.slice(0, position.column - 1);
			const memberMatch = textBefore.match(/^(.*?)\s*\.\s*\w*$/);
			if (memberMatch && context.triggerCharacter !== '.') {
				const type = resolveMemberChain(monaco, model, memberMatch[1], position.lineNumber)?.type;
				if (type) {
					const range = completionRange(monaco, model, position);

					// Struct field completions
					const struct = getWorkspaceDocs(monaco).flatMap((entry) => entry.doc.structs).find((s) => s.name === type);
					if (struct) {
						return {
							suggestions: struct.fields.map((f, i) => ({
								label:      { label: f.name, description: f.type },
								kind:       CIK.Field,
								insertText: f.name,
								sortText:   String(i).padStart(6, '0'),
								detail:     `${type}.${f.name}: ${f.type}`,
								range,
							})),
						};
					}

					// Swizzle completions for vector/matrix types
					const swizzles = getSwizzles(type);
					if (swizzles.length > 0) {
						return {
							suggestions: swizzles.map((sw, i) => ({
								label:      { label: sw, description: swizzleResultType(type, sw) },
								kind:       CIK.Field,
								insertText: sw,
								sortText:   String(i).padStart(6, '0'),
								detail:     `${type}.${sw} → ${swizzleResultType(type, sw)}`,
								range,
							})),
						};
					}
				}
			}

			// General completions - range spans the full word so mid-word replace works
			const range = completionRange(monaco, model, position);
			const suggestions: Monaco.languages.CompletionItem[] = [];

			// Detect if cursor is inside a function/constructor call argument
			const callCtx     = inferCallContext(lineText, position.column - 1);
			const docInfo     = analyzeModel(model);
			const expectedTypes = callCtx
				? getCallArgTypes(callCtx.fnName, callCtx.argIndex, docInfo)
				: null;
			const inCallCtx = expectedTypes !== null;

			// Types and keywords are always shown (they define structure / constructors)
			for (const t of GLSL_TYPES) {
				const td = TYPE_DOCS[t];
				suggestions.push({
					label:         t,
					kind:          CIK.TypeParameter,
					insertText:    t,
					detail:        td?.description ?? '',
					documentation: td?.struct ? { value: `\`\`\`glsl\n${td.struct}\n\`\`\`` } : undefined,
					range,
				});
			}

			for (const kw of GLSL_KEYWORDS) {
				suggestions.push({ label: kw, kind: CIK.Keyword, insertText: kw, range });
			}

			// Builtins: filter by return type (or variable type for gl_* vars) when in a call context
			for (const [name, doc] of Object.entries(BUILTIN_DOCS)) {
				const isVar = name.startsWith('gl_');
				const retType = builtinReturnType(doc.signature);
				if (inCallCtx) {
					if (isVar) {
						if (retType && !isTypeAcceptable(retType, expectedTypes!)) continue;
					} else {
						if (retType && retType !== 'void' && !isTypeAcceptable(retType, expectedTypes!)) continue;
					}
				}
				suggestions.push({
					label:           { label: name, description: retType ?? '' },
					kind:            isVar ? CIK.Variable : CIK.Function,
					insertText:      isVar ? name : `${name}($0)`,
					insertTextRules: isVar ? undefined : CITR.InsertAsSnippet,
					detail:          doc.signature.split('\n')[0],
					documentation:   { value: hoverBody(doc.unavailable && `⚠️ ${doc.unavailable}`, doc.extension && `Needs \`#extension ${doc.extension} : enable\`.`, doc.description, doc.examples && formatGlslCodeBlock(doc.examples)) },
					/** Struck through and sorted last, the linter reports them as compile errors. */
					tags:            doc.unavailable ? [monaco.languages.CompletionItemTag.Deprecated] : undefined,
					sortText:        doc.unavailable ? `9${name}` : undefined,
					range,
				});
			}

			/** Locals in scope first, then this buffer's globals, then the other buffers' (Common shares its scope with every pass). */
			const seen = new Set<string>();
			const docs = getWorkspaceDocs(monaco);
			const enclosing = docInfo.functions.find((fn) => position.lineNumber >= fn.line && position.lineNumber <= fn.bodyEndLine);
			const locals = enclosing?.localVariables.filter((variable) => variable.line <= position.lineNumber && position.lineNumber <= variable.scopeEndLine).reverse() ?? [];
			const documentation = (code: string, comment: string | null) => ({ value: hoverBody(formatGlslCodeBlock([code]), comment) });
			const addVariable = (variable: GlslVariable, kind: Monaco.languages.CompletionItemKind, sortPrefix: string) => {
				if (seen.has(variable.name) || (inCallCtx && !isTypeAcceptable(variable.type, expectedTypes!))) return;
				seen.add(variable.name);
				suggestions.push({ detail: declarationLine(variable), documentation: documentation(`${declarationLine(variable)};`, variable.comment), insertText: variable.name, kind, label: { description: variable.type, label: variable.name }, range, sortText: `${sortPrefix}${variable.name}` });
			};
			for (const variable of locals) addVariable(variable, CIK.Variable, '0');
			for (const { doc } of [...docs.filter((entry) => entry.model === model), ...docs.filter((entry) => entry.model !== model)]) {
				for (const variable of doc.variables) addVariable(variable, variable.qualifier === 'uniform' || variable.qualifier === 'const' ? CIK.Constant : CIK.Variable, '1');
				for (const fn of doc.functions) {
					if (seen.has(fn.name) || (inCallCtx && !isTypeAcceptable(fn.returnType, expectedTypes!))) continue;
					seen.add(fn.name);
					suggestions.push({ detail: functionSignature(fn), documentation: documentation(functionSignature(fn), fn.comment), insertText: `${fn.name}($0)`, insertTextRules: CITR.InsertAsSnippet, kind: CIK.Function, label: { description: fn.returnType, label: fn.name }, range, sortText: `1${fn.name}` });
				}
				for (const struct of doc.structs) {
					if (seen.has(struct.name)) continue;
					seen.add(struct.name);
					suggestions.push({ detail: `struct ${struct.name}`, documentation: documentation(`struct ${struct.name} {\n${struct.fields.map((field) => `  ${field.type} ${field.name};`).join('\n')}\n};`, struct.comment), insertText: struct.name, kind: CIK.Struct, label: struct.name, range });
				}
				/** Macros are always offered, their type is unknown until expansion. */
				for (const define of doc.defines) {
					if (seen.has(define.name)) continue;
					seen.add(define.name);
					const signature = `#define ${define.name}${define.params ? `(${define.params.join(', ')})` : ''} ${define.value}`;
					suggestions.push({ detail: signature, documentation: documentation(signature, define.comment), insertText: define.name, kind: CIK.Constant, label: define.name, range });
				}
			}

			return { suggestions };
		},
	});
}

/** Markdown sections of a hover, Monaco draws a separator between them. */
type HoverSections = string[];

/** Types GLSL ES 1.00 (WebGL 1) doesn't have. */
const ES3_ONLY_TYPE_RE = /^(?:uint|uvec[234]|mat[234]x[234]|sampler3D|sampler2DShadow|samplerCubeShadow)$/;

/** Buffer names shown in hovers for symbols from another buffer, filled by the editor. */
export const modelLabels = new WeakMap<Monaco.editor.ITextModel, string>();

function declarationLine(variable: GlslVariable): string {
	const qualifier = variable.qualifier && variable.qualifier !== 'in' ? `${variable.qualifier} ` : '';
	const array = variable.arraySize !== undefined ? `[${variable.arraySize}]` : '';
	const initializer = variable.initializer ? ` = ${variable.initializer}` : '';
	return `${qualifier}${variable.type} ${variable.name}${array}${initializer}`;
}

function functionSignature(fn: GlslFunction): string {
	return `${fn.returnType} ${fn.name}(${fn.params.map(declarationLine).join(', ')})`;
}

/** "*Kind* · Buffer · [line 12]" with a link that jumps to the declaration, across buffers too. */
function locationLine(kind: string, hovered: Monaco.editor.ITextModel, target: Monaco.editor.ITextModel, symbol: { line: number; column: number }): string {
	const buffer = target === hovered ? '' : ` · ${modelLabels.get(target) ?? target.uri.path.slice(1)}`;
	return `*${kind}*${buffer} · ${buildGotoPositionLink(symbol.line, symbol.column, `line ${symbol.line}`, target === hovered ? undefined : target.uri.toString())}`;
}

function hoverBody(...parts: (string | null | undefined | false)[]): string {
	return parts.filter(Boolean).join('\n\n');
}

/** Replaces the generic types of a builtin overload with the ones the call arguments resolved to: `mix(a, b, 0.5)` with `vec3` arguments shows `vec3 mix(vec3 x, vec3 y, float a)`. */
function concreteOverload(overload: BuiltinOverload, inferred: (string | null)[]): string | null {
	const generic = overload.params.findIndex((param, index) => /\b(?:gen[IB]?Type|[ib]?vecN|matN)\b/.test(param.type) && inferred[index] && /^(?:float|int|bool|[ib]?vec[234]|mat[234])$/.test(inferred[index]!));
	if (generic < 0) return null;
	const size = Number(/\d/.exec(inferred[generic]!)?.[0] ?? 1);
	const concrete = (type: string) => expandAbstractType(type, size, size, size);
	return `${concrete(overload.returnType)} ${overload.functionName}(${overload.params.map((param) => `${concrete(param.type)} ${param.name}`).join(', ')})`;
}

function builtinHover(model: Monaco.editor.ITextModel, position: Monaco.Position, name: string, builtin: GlslDoc, lineText: string, wordEndColumn: number): HoverSections {
	const overloads = parseBuiltinOverloads(builtin.signature);
	if (overloads.length === 0) return [formatGlslCodeBlock([`${builtin.signature};`]), hoverBody(builtin.description, builtin.details), ...(builtin.examples ? ['**Examples**', formatGlslCodeBlock(builtin.examples)] : [])];

	const activeCursor = getActiveCursorPositionForModel(model, position);
	const callInfo = extractCallInfoAtFunctionName(lineText, wordEndColumn, activeCursor.lineNumber === position.lineNumber ? activeCursor.column : null);
	const resolution = callInfo ? resolveBuiltinOverload(name, callInfo.args, analyzeModel(model), position.lineNumber) : null;
	const selected = resolution?.overload ?? overloads[0];
	const concrete = resolution ? concreteOverload(selected, resolution.inferredTypes) : null;

	/** Every overload with its generic types spelled out, the selected one first and the line matching the call marked with an arrow. */
	const ordered = [selected, ...overloads.filter((overload) => overload !== selected)];
	const signatures = [...new Set(ordered.flatMap(expandBuiltinOverload))];
	const marked = resolution ? (concrete && signatures.includes(concrete) ? concrete : signatures[0]) : null;

	return [
		formatGlslCodeBlock(signatures.map((signature) => (signature === marked ? `→ ${signature}` : signature))),
		...[
			builtin.unavailable && `⚠️ **Not available in WebGL 1.** ${builtin.unavailable}`,
			builtin.extension && `🧩 Needs \`#extension ${builtin.extension} : enable\` at the top of the shader.`,
			formatBuiltinParameterDocs(builtin, selected, callInfo?.activeArgIndex ?? null),
			builtin.returns && `**Returns**  \n${builtin.returns}`,
			hoverBody(builtin.description, builtin.details),
			...(builtin.examples ? ['**Examples**', formatGlslCodeBlock(builtin.examples)] : []),
		].filter((section): section is string => Boolean(section)),
	];
}

function expandBuiltinOverload(overload: BuiltinOverload): string[] {
	const generic = /\bgen[IB]?Type\b/.test(overload.raw);
	const hasN = /\b(?:[iub]?vecN|matN|matNxM|matMxN)\b/.test(overload.raw);
	const hasM = /\b(?:vecM|matNxM|matMxN)\b/.test(overload.raw);
	const variants = new Set<string>();
	for (const dimension of generic ? [1, 2, 3, 4] : [2]) {
		for (const n of hasN ? [2, 3, 4] : [2]) {
			for (const m of hasM ? [2, 3, 4] : [2]) {
				const expand = (type: string) => expandAbstractType(type, dimension, n, m);
				variants.add(`${expand(overload.returnType)} ${overload.functionName}(${overload.params.map((param) => `${expand(param.type)} ${param.name}`).join(', ')})`);
			}
		}
	}
	return [...variants];
}

/** Parameter list of the overload, the argument under the cursor marked with an arrow. */
function formatBuiltinParameterDocs(builtin: GlslDoc, overload: BuiltinOverload, activeParamIndex: number | null): string | null {
	if (overload.params.length === 0) return null;
	const lines = overload.params.map((param, index) => {
		const detail = builtin.params?.[param.name] ?? PARAMETER_FALLBACK_DOCS[param.name];
		return `${activeParamIndex === index ? '**→** ' : '- '}\`${param.name}\` (\`${param.type}\`)${detail ? `: ${detail}` : ''}`;
	});
	return ['**Parameters**', ...lines].join('  \n');
}

/** Number of components and scalar family of a constructor argument type, `vec3` → 3. */
function componentCount(type: string): number | null {
	if (/^(?:float|int|bool)$/.test(type)) return 1;
	const size = /^[ib]?vec([234])$/.exec(type)?.[1];
	return size ? Number(size) : null;
}

/**
 * Constructor overload matching the argument types of the call at `wordEnd`, constructors convert between float, int and bool so only the
 * component counts must line up. An argument of unknown type matches anything, the overload with the fewest unknowns wins.
 */
function activeConstructorIndex(monaco: typeof Monaco, model: Monaco.editor.ITextModel, name: string, wordStart: Monaco.IPosition): number | null {
	const shared = monaco.editor.getModels().filter((other) => other !== model && other.getLanguageId() === 'glsl').map(modelUnit);
	const unit = new GlslUnit(model.getValue(), shared);
	/** The word start, its end touches the `(` token too. */
	const index = unit.tokenAt(model.getOffsetAt(wordStart));
	if (index < 0 || unit.text(index) !== name || unit.text(index + 1) !== '(') return null;
	const argTypes = unit.callArgs(index + 1).map((range) => unit.expressionType(range));
	let best: { index: number; unknowns: number } | null = null;
	buildTypeConstructorOverloads(name)?.forEach((overload, overloadIndex) => {
		if (overload.params.length !== argTypes.length) return;
		let unknowns = 0;
		for (const [argIndex, param] of overload.params.entries()) {
			const argType = argTypes[argIndex];
			if (argType === null || componentCount(argType) === null) unknowns++;
			else if (componentCount(argType) !== componentCount(param.type)) return;
		}
		if (!best || unknowns < best.unknowns) best = { index: overloadIndex, unknowns };
	});
	return (best as { index: number } | null)?.index ?? null;
}

function typeHover(monaco: typeof Monaco, model: Monaco.editor.ITextModel, position: Monaco.Position, name: string, wordStartColumn: number): HoverSections {
	const typeDoc = TYPE_DOCS[name];
	const activeConstructor = activeConstructorIndex(monaco, model, name, { column: wordStartColumn, lineNumber: position.lineNumber });
	/** The matched constructor goes first, long lists (vec4 has 10) would push it below the hover's scroll limit. */
	const constructors = buildTypeConstructorOverloads(name)
		?.map((overload, index) => `${index === activeConstructor ? '→ ' : '  '}${name}(${overload.params.map((param) => param.type).join(', ')})`)
		.sort((a, b) => Number(b.startsWith('→')) - Number(a.startsWith('→')));
	const swizzleSets = typeDoc.components ? [0, 1, 2].map((set) => `\`${typeDoc.components!.map((component) => component[set]).join('')}\``).join(' · ') : null;
	return [
		formatGlslCodeBlock([typeDoc.struct]),
		hoverBody(
			ES3_ONLY_TYPE_RE.test(name) && '⚠️ **Not available here.** GLSL ES 3.00 only, WebGL 1 (GLSL ES 1.00) doesn\'t have this type.',
			typeDoc.description,
			swizzleSets && `Components ${swizzleSets}, swizzles mix them freely within one set: \`v.zyx\`, \`v.rrr\`.`,
		),
		...(constructors ? [`**Constructors**\n${formatGlslCodeBlock(constructors)}`] : []),
	];
}

/** Hover of the identifier after a `.`: struct field or swizzle. */
function memberHover(monaco: typeof Monaco, model: Monaco.editor.ITextModel, position: Monaco.Position, name: string, lineText: string, wordStartColumn: number): HoverSections | null {
	const owner = resolveMemberChain(monaco, model, lineText.slice(0, wordStartColumn - 2), position.lineNumber);
	if (!owner) return null;
	for (const { doc, model: target } of getWorkspaceDocs(monaco)) {
		const field = doc.structs.find((struct) => struct.name === owner.type)?.fields.find((candidate) => candidate.name === name);
		if (field) return [formatGlslCodeBlock([`${field.type} ${owner.type}.${field.name}`]), hoverBody(field.comment, locationLine(`Field of ${owner.type}`, model, target, field))];
	}
	if (!getSwizzles(owner.type).includes(name)) return null;
	const resultType = swizzleResultType(owner.type, name);
	const repeats = new Set(name).size !== name.length;
	return [
		formatGlslCodeBlock([`${resultType} ${owner.expression}.${name}`]),
		hoverBody(
			`Swizzle of \`${owner.type} ${owner.expression}\`, picks ${[...name].map((component) => `\`${component}\``).join(', ')}.`,
			repeats && 'It repeats a component, so it can be read but not assigned.',
		),
	];
}

function variableHover(kind: string, variable: GlslVariable, hovered: Monaco.editor.ITextModel, target: Monaco.editor.ITextModel): HoverSections {
	const engine = variable.qualifier === 'uniform' ? UNIFORM_DOCS[variable.name] : undefined;
	return [
		formatGlslCodeBlock([`${declarationLine(variable)};`]),
		hoverBody(variable.comment, engine && `${engine.description} Set by Shayders every frame.`, locationLine(kind, hovered, target, variable)),
	];
}

function registerHover(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerHoverProvider('glsl', {
		provideHover(model, position): Monaco.languages.Hover | null {
			const word = model.getWordAtPosition(position);
			if (!word) return null;
			const name = word.word;
			const lineText = model.getLineContent(position.lineNumber);
			const before = lineText.slice(0, word.startColumn - 1);
			const sections = ((): HoverSections | null => {
				if (/#\s*$/.test(before) && PREPROCESSOR_DOCS[name]) return [formatGlslCodeBlock([`#${name}`]), PREPROCESSOR_DOCS[name]];
				if (/\.\s*$/.test(before)) return memberHover(monaco, model, position, name, lineText, word.startColumn);

				const doc = analyzeModel(model);
				const local = findLocal(doc, name, position.lineNumber);
				if (local) {
					const isParam = local.fn.params.includes(local.variable);
					return variableHover(`${isParam ? 'Parameter of' : 'Local variable in'} ${local.fn.name}()`, local.variable, model, model);
				}

				const builtin = BUILTIN_DOCS[name];
				if (builtin) return builtinHover(model, position, name, builtin, lineText, word.endColumn);
				if (TYPE_DOCS[name]) return typeHover(monaco, model, position, name, word.startColumn);

				const docs = getWorkspaceDocs(monaco);
				const ordered = [...docs.filter((entry) => entry.model === model), ...docs.filter((entry) => entry.model !== model)];
				for (const { doc: entryDoc, model: target } of ordered) {
					const functions = entryDoc.functions.filter((fn) => fn.name === name);
					if (functions.length > 0) {
						return [
							formatGlslCodeBlock(functions.map(functionSignature)),
							...(functions[0].params.length > 0 ? [['**Parameters**', ...functions[0].params.map((param) => `- \`${param.name}\` (\`${declarationLine({ ...param, initializer: undefined, name: '' }).trim()}\`)${param.comment ? `: ${param.comment}` : ''}`)].join('  \n')] : []),
							hoverBody(
								functions.find((fn) => fn.comment)?.comment,
								locationLine(functions.length > 1 ? `Function, ${functions.length} overloads` : 'Function', model, target, functions[0]),
							),
						];
					}
					const struct = entryDoc.structs.find((candidate) => candidate.name === name);
					if (struct) {
						const fields = struct.fields.map((field) => `  ${field.type} ${field.name};${field.comment ? ` // ${field.comment.replace(/ {2}\n/g, ' ')}` : ''}`);
						return [formatGlslCodeBlock([`struct ${struct.name} {`, ...fields, '};']), hoverBody(struct.comment, `Its name is also its constructor: \`${struct.name}(${struct.fields.map((field) => field.type).join(', ')})\`.`, locationLine('Struct', model, target, struct))];
					}
					const variable = entryDoc.variables.find((candidate) => candidate.name === name);
					if (variable) return variableHover(variable.qualifier === 'uniform' ? 'Uniform' : variable.qualifier === 'const' ? 'Constant' : 'Global variable', variable, model, target);
					const define = entryDoc.defines.find((candidate) => candidate.name === name);
					if (define) {
						const params = define.params ? `(${define.params.join(', ')})` : '';
						return [formatGlslCodeBlock([`#define ${define.name}${params} ${define.value}`]), hoverBody(define.comment, locationLine(define.params ? 'Function-like macro' : 'Macro', model, target, define))];
					}
				}

				const uniform = UNIFORM_DOCS[name];
				if (uniform) return [formatGlslCodeBlock([`${uniform.signature};`]), hoverBody(uniform.description, `⚠️ Not declared in this buffer, add \`${uniform.signature};\` to read it.`)];
				if (KEYWORD_DOCS[name]) return [formatGlslCodeBlock([name]), KEYWORD_DOCS[name]];
				if (PREDEFINED_MACRO_DOCS[name]) return [formatGlslCodeBlock([`#define ${name}`]), hoverBody(PREDEFINED_MACRO_DOCS[name], '*Predefined macro*')];
				return null;
			})();
			if (!sections) return null;
			return {
				contents: sections.map((value) => ({ isTrusted: true, supportThemeIcons: true, value })),
				range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
			};
		},
	});
}

function registerDefinition(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerDefinitionProvider('glsl', {
		provideDefinition(model, position): Monaco.languages.Definition | null {
			const word = model.getWordAtPosition(position);
			if (!word) return null;

			if (/\.\s*$/.test(model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1))) return null;
			const symbol = findWorkspaceSymbol(monaco, word.word, model, position.lineNumber);
			if (!symbol) return null;
			return {
				range: new monaco.Range(symbol.line, symbol.column, symbol.line, symbol.column + word.word.length),
				uri: symbol.model.uri,
			};
		},
	});
}

function registerSignatureHelp(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerSignatureHelpProvider('glsl', {
		signatureHelpTriggerCharacters: ['(', ','],

		provideSignatureHelp(model, position) {
			const lineContent = model.getLineContent(position.lineNumber);
			const col         = position.column - 1;
			let depth      = 0;
			let commaCount = 0;
			let fnStart    = -1;

			for (let i = col - 1; i >= 0; i--) {
				const ch = lineContent[i];
				if (ch === ')') { depth++;   continue; }
				if (ch === '(') {
					if (depth > 0) { depth--; continue; }
					commaCount = (lineContent.slice(i + 1, col).match(/,/g) ?? []).length;
					fnStart    = i;
					break;
				}
			}

			if (fnStart < 0) return null;

			const wordBefore = model.getWordAtPosition({
				lineNumber: position.lineNumber,
				column:     fnStart,
			});
			if (!wordBefore) return null;

			let sigSource: { signature: string; description: string } | null =
				BUILTIN_DOCS[wordBefore.word] ?? null;

			if (!sigSource) {
				const doc = analyzeModel(model);
				const fn = doc.functions.find((f) => f.name === wordBefore.word)
					?? getWorkspaceDocs(monaco)
						.map((entry) => entry.doc.functions.find((functionDoc) => functionDoc.name === wordBefore.word))
						.find((functionDoc): functionDoc is NonNullable<typeof functionDoc> => functionDoc !== undefined);
				if (fn) {
					const paramList = fn.params
						.map((p) => `${p.qualifier && p.qualifier !== 'in' ? p.qualifier + ' ' : ''}${p.type} ${p.name}`)
						.join(', ');
					sigSource = {
						signature:   `${fn.returnType} ${fn.name}(${paramList})`,
						description: fn.comment ?? `User-defined at line ${fn.line}`,
					};
				}
			}

			if (!sigSource) return null;

			const overloads   = sigSource.signature.split('\n');
			const signatures: Monaco.languages.SignatureInformation[] = overloads.map((sig) => {
				const inner  = sig.slice(sig.indexOf('(') + 1, sig.lastIndexOf(')'));
				const params = inner.split(',').map((p) => p.trim()).filter(Boolean).map((p) => ({ label: p }));
				return {
					label:         sig,
					documentation: { value: sigSource!.description },
					parameters:    params,
				};
			});

			return {
				value: {
					signatures,
					activeSignature: 0,
					activeParameter: Math.min(
						commaCount,
						(signatures[0]?.parameters.length ?? 1) - 1,
					),
				},
				dispose: () => {},
			};
		},
	});
}

// Vector constructor types that get component-labelled inlay hints
const CONSTRUCTOR_TYPES = new Set([
	'vec2', 'vec3', 'vec4',
	'ivec2', 'ivec3', 'ivec4',
	'uvec2', 'uvec3', 'uvec4',
	'bvec2', 'bvec3', 'bvec4',
]);

/** Returns the xyzw component names for a vector constructor type, e.g. vec3 → ['x','y','z'] */
function constructorComponents(typeName: string): string[] {
	const doc = TYPE_DOCS[typeName];
	if (!doc?.components) return [];
	return doc.components.map((c) => c[0]); // use xyzw aliases (index 0)
}

/**
 * Estimates how many constructor component slots an argument expression fills.
 * - Trailing swizzle (e.g. `a.xy`)  → swizzle length
 * - Simple identifier with resolved vector type → vector size
 * - Otherwise → 1 (scalar / unknown)
 */
function argComponentCount(
	arg: string,
	docInfo: GlslDocument,
	lineNumber: number,
): number {
	const trimmed = arg.trim();
	// Trailing swizzle: word.xyzw / word.rgba / word.stpq
	const swizzleMatch = trimmed.match(/\.([xyzwrgbastpq]+)$/);
	if (swizzleMatch) return swizzleMatch[1].length;

	// Simple identifier - try to resolve its type
	const identMatch = trimmed.match(/^([a-zA-Z_]\w*)$/);
	if (identMatch) {
		const varType = resolveScopedType(docInfo, identMatch[1], lineNumber);
		if (varType) {
			const vecMatch = varType.match(/(?:vec|ivec|uvec|bvec)(\d)/);
			if (vecMatch) return parseInt(vecMatch[1], 10);
		}
	}

	return 1;
}

function registerInlayHints(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerInlayHintsProvider('glsl', {
		provideInlayHints(model): Monaco.languages.InlayHintList {
			const hints   = [] as Monaco.languages.InlayHint[];
			const docInfo = analyzeModel(model);

			// Build function → param names map (non-constructor builtins + user functions)
			const fnParams = new Map<string, string[]>();

			for (const [name, info] of Object.entries(BUILTIN_DOCS)) {
				const names = extractParamNames(info.signature.split('\n')[0]);
				if (names.length > 0) fnParams.set(name, names);
			}
			for (const fn of docInfo.functions) {
				fnParams.set(fn.name, fn.params.map((p) => p.name));
			}
			// Struct constructors: hint with field names
			for (const st of docInfo.structs) {
				fnParams.set(st.name, st.fields.map((f) => f.name));
			}

			const lineCount = model.getLineCount();

			for (let lineNum = 1; lineNum <= lineCount; lineNum++) {
				const line    = model.getLineContent(lineNum);
				const trimmed = line.trimStart();

				// Skip comment and preprocessor lines
				if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('#')) continue;

				// Strip inline comments to avoid false positives
				const stripped = line
					.replace(/\/\/.*$/, '')
					.replace(/\/\*.*?\*\//g, (m) => ' '.repeat(m.length));

				const callRe = /\b([a-zA-Z_]\w*)\s*\(/g;
				let m: RegExpExecArray | null;

				while ((m = callRe.exec(stripped)) !== null) {
					const fnName = m[1];
					if (NON_FUNCTION_KEYWORDS.has(fnName)) continue;

					const openParenIdx = m.index + m[0].length;

					// Constructor hint (vec2/vec3/vec4/ivec…/uvec…/bvec…)
					if (CONSTRUCTOR_TYPES.has(fnName)) {
						const components = constructorComponents(fnName);
						if (components.length === 0) continue;

						let slotIdx      = 0;   // next component slot to fill
						let argBuf       = '';   // accumulated text of current arg
						let argFirstCol  = -1;   // 0-based column of first non-space char
						let depth        = 1;
						let argCount     = 0;   // count arguments to know if broadcast applies

						const flushArg = (hintCol: number, buf: string, isOnlyArg: boolean = false) => {
							if (hintCol < 0 || slotIdx >= components.length) return;
							let count = argComponentCount(buf, docInfo, lineNum);
							const remainingSlots = components.length - slotIdx;

							// If single argument that doesn't fill all slots, broadcast it to fill remaining
							if (isOnlyArg && count < remainingSlots) {
								count = remainingSlots;
							}

							const label = components.slice(slotIdx, slotIdx + count).join('');
							slotIdx += count;
							// Suppress redundant "x: x" hints
							if (label && buf.trim() !== label) {
								hints.push({
									kind:         monaco.languages.InlayHintKind.Parameter,
									position:     { lineNumber: lineNum, column: hintCol + 1 },
									label:        `${label}:`,
									paddingRight: true,
								});
							}
						};

						for (let col = openParenIdx; col < stripped.length && depth > 0; col++) {
							const ch = stripped[col];

							if (ch === '(') { depth++; argBuf += ch; continue; }

							if (ch === ')') {
								depth--;
								if (depth === 0) {
									if (argFirstCol >= 0) argCount++;
									flushArg(argFirstCol, argBuf, argCount === 1);
									break;
								}
								argBuf += ch;
								continue;
							}

							if (ch === ',' && depth === 1) {
								if (argFirstCol >= 0) argCount++;
								flushArg(argFirstCol, argBuf, false);
								argBuf      = '';
								argFirstCol = -1;
								continue;
							}

							argBuf += ch;
							if (argFirstCol === -1 && ch !== ' ' && ch !== '\t') {
								argFirstCol = col;
							}
						}

						continue; // handled as constructor - skip regular-param path
					}

					// Regular function / builtin hint
					const params = fnParams.get(fnName);
					if (!params || params.length === 0) continue;

					let depth        = 1;
					let argIndex     = 0;
					let needArgStart = true;

					for (let col = openParenIdx; col < stripped.length && depth > 0; col++) {
						const ch = stripped[col];

						if (ch === '(') { depth++; continue; }
						if (ch === ')') { depth--; continue; }

						if (ch === ',' && depth === 1) {
							argIndex++;
							needArgStart = true;
							continue;
						}

						if (needArgStart && depth === 1 && ch !== ' ' && ch !== '\t') {
							needArgStart = false;
							if (argIndex < params.length) {
								const paramName = params[argIndex];
								const argToken  = stripped.slice(col).match(/^\w+/)?.[0];
								if (argToken !== paramName) {
									hints.push({
										kind:         monaco.languages.InlayHintKind.Parameter,
										position:     { lineNumber: lineNum, column: col + 1 },
										label:        `${paramName}:`,
										paddingRight: true,
									});
								}
							}
						}
					}
				}
			}

			return { hints, dispose: () => {} };
		},
	});
}
