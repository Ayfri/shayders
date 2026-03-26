import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';
import { BUILTIN_DOCS, UNIFORM_DOCS } from '$lib/glsl/builtins';
import { TYPE_DOCS, GLSL_TYPES, getSwizzles } from '$lib/glsl/types';
import { GLSL_KEYWORDS, GLSL_PREPROCESSOR } from '$lib/glsl/keywords';
import { analyzeDocument, resolveType, resolveScopedType } from '$lib/glsl/analyze';

const DISPOSABLES_KEY = '__glslProviderDisposables';
const ACTIVE_EDITOR_KEY = '__glslActiveEditor';
const GOTO_POSITION_COMMAND_ID = '__glslGotoPosition';

export function registerGlslProviders(monaco: typeof Monaco): void {
	const g = globalThis as Record<string, unknown>;
	const prev = g[DISPOSABLES_KEY] as Monaco.IDisposable[] | undefined;
	if (prev) for (const d of prev) d.dispose();

	g[DISPOSABLES_KEY] = [
		registerCompletion(monaco),
		registerHover(monaco),
		registerDefinition(monaco),
		registerSignatureHelp(monaco),
		registerInlayHints(monaco),
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
	docInfo: ReturnType<typeof analyzeDocument>,
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
	doc: ReturnType<typeof analyzeDocument>;
}

interface WorkspaceSymbolMatch {
	model: Monaco.editor.ITextModel | null;
	name: string;
	line: number;
	type: string | null;
	kind: 'function' | 'struct' | 'variable' | 'define';
}

function isWorkspaceModel(model: Monaco.editor.ITextModel): boolean {
	return model.getLanguageId() === 'glsl';
}

function getWorkspaceDocs(monaco: typeof Monaco): WorkspaceDoc[] {
	return monaco.editor.getModels().filter(isWorkspaceModel).map((model) => ({
		model,
		doc: analyzeDocument(model.getValue()),
	}));
}

function findLocalSymbol(doc: ReturnType<typeof analyzeDocument>, name: string, cursorLine: number): WorkspaceSymbolMatch | null {
	const enclosingFn = doc.functions.find((fn) => cursorLine >= fn.line && cursorLine <= fn.bodyEndLine);
	if (enclosingFn) {
		const local = enclosingFn.localVariables.find((variable) => variable.name === name);
		if (local) {
			return {
				kind: 'variable',
				line: local.line,
				model: null,
				name: local.name,
				type: local.type,
			};
		}
	}

	const fn = doc.functions.find((functionDoc) => functionDoc.name === name);
	if (fn) return { kind: 'function', line: fn.line, model: null, name, type: fn.returnType };

	const st = doc.structs.find((struct) => struct.name === name);
	if (st) return { kind: 'struct', line: st.line, model: null, name, type: name };

	const variable = doc.variables.find((docVariable) => docVariable.name === name);
	if (variable) return { kind: 'variable', line: variable.line, model: null, name, type: variable.type };

	const def = doc.defines.find((define) => define.name === name);
	if (def) return { kind: 'define', line: def.line, model: null, name, type: null };

	return null;
}

function findWorkspaceSymbol(
	monaco: typeof Monaco,
	name: string,
	cursorModel: Monaco.editor.ITextModel,
	cursorLine: number,
): WorkspaceSymbolMatch | null {
	const docs = getWorkspaceDocs(monaco);
	const current = docs.find((entry) => entry.model.uri.toString() === cursorModel.uri.toString());
	if (current) {
		const localMatch = findLocalSymbol(current.doc, name, cursorLine);
		if (localMatch) return { ...localMatch, model: current.model };
	}

	for (const entry of docs) {
		if (entry.model.uri.toString() === cursorModel.uri.toString()) continue;
		const fn = entry.doc.functions.find((functionDoc) => functionDoc.name === name);
		if (fn) return { kind: 'function', line: fn.line, model: entry.model, name, type: fn.returnType };
		const st = entry.doc.structs.find((struct) => struct.name === name);
		if (st) return { kind: 'struct', line: st.line, model: entry.model, name, type: name };
		const variable = entry.doc.variables.find((docVariable) => docVariable.name === name);
		if (variable) return { kind: 'variable', line: variable.line, model: entry.model, name, type: variable.type };
		const def = entry.doc.defines.find((define) => define.name === name);
		if (def) return { kind: 'define', line: def.line, model: entry.model, name, type: null };
	}

	return null;
}

interface TypeConstructorOverload {
	raw: string;
	params: { type: string; name: string }[];
}

function findDeclarationColumn(model: Monaco.editor.ITextModel, line: number, name: string): number {
	const lineText = model.getLineContent(line);
	const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = lineText.match(new RegExp(`\\b${escapedName}\\b`));
	return match?.index !== undefined ? match.index + 1 : 1;
}

function buildGotoPositionLink(line: number, column: number, label: string): string {
	const args = encodeURIComponent(JSON.stringify([{ lineNumber: line, column }]));
	return `[${label}](command:${GOTO_POSITION_COMMAND_ID}?${args})`;
}

function formatLineLink(model: Monaco.editor.ITextModel, line: number, column: number): string {
	return buildGotoPositionLink(line, column, `line ${line}`);
}

function formatLineScopedText(label: string, model: Monaco.editor.ITextModel, line: number, name: string): string {
	return `${label} ${formatLineLink(model, line, findDeclarationColumn(model, line, name))}.`;
}

function formatFunctionParameterText(model: Monaco.editor.ITextModel, line: number, functionName: string, declarationName: string): string {
	return `Function parameter of ${buildGotoPositionLink(line, findDeclarationColumn(model, line, functionName), functionName)} declared at ${formatLineLink(model, line, findDeclarationColumn(model, line, declarationName))}.`;
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
		overloads.set(raw, { raw, params });
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

function formatOverloadLines(overloads: string[], activeIndex: number | null = null): string[] {
	return overloads.map((line, index) => (index === activeIndex ? `→ ${line}` : line));
}

function formatTypeConstructorOverloadList(typeName: string, activeIndex: number | null = null): string[] | null {
	const overloads = buildTypeConstructorOverloads(typeName);
	if (!overloads) return null;
	return formatOverloadLines(overloads.map((overload) => overload.raw), activeIndex);
}

function resolveTypeConstructorOverloadIndex(
	typeName: string,
	args: string[],
	doc: ReturnType<typeof analyzeDocument>,
	lineNumber: number,
): number | null {
	const overloads = buildTypeConstructorOverloads(typeName);
	if (!overloads) return null;

	for (let index = 0; index < overloads.length; index++) {
		const overload = overloads[index];
		if (overload.params.length !== args.length) continue;
		let matches = true;
		for (let argIndex = 0; argIndex < args.length; argIndex++) {
			const argType = inferExpressionType(args[argIndex], doc, lineNumber);
			if (!argType || !isTypeAcceptable(argType, new Set([overload.params[argIndex].type]))) {
				matches = false;
				break;
			}
		}
		if (matches) return index;
	}

	return null;
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
	doc: ReturnType<typeof analyzeDocument>,
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
	doc: ReturnType<typeof analyzeDocument>,
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

function formatOverloadRaw(overload: BuiltinOverload): string {
	const params = overload.params.map((param) => param.raw).join(', ');
	return `${overload.returnType} ${overload.functionName}(${params})`;
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

function expandBuiltinOverload(overload: BuiltinOverload): string[] {
	const hasGenericAliases = /(genType|genIType|genUType|genBType)\b/.test(overload.raw);
	const hasN = /\b(?:vecN|ivecN|uvecN|bvecN|matN|matNxM|matMxN)\b/.test(overload.raw);
	const hasM = /\b(?:vecM|matNxM|matMxN)\b/.test(overload.raw);

	const genericDims = hasGenericAliases ? [1, 2, 3, 4] : [2];
	const nValues = hasN ? [2, 3, 4] : [2];
	const mValues = hasM ? [2, 3, 4] : [2];

	const variants = new Set<string>();
	for (const genericDim of genericDims) {
		for (const n of nValues) {
			for (const m of mValues) {
				const returnType = expandAbstractType(overload.returnType, genericDim, n, m);
				const params = overload.params.map((param) => ({
					...param,
					type: expandAbstractType(param.type, genericDim, n, m),
				}));
				variants.add(`${returnType} ${overload.functionName}(${params.map((p) => `${p.type} ${p.name}`).join(', ')})`);
			}
		}
	}

	return variants.size > 0 ? [...variants] : [formatOverloadRaw(overload)];
}

function formatBuiltinParameterDocs(
	builtin: { params?: Record<string, string> },
	overload: BuiltinOverload | null,
	activeParamIndex: number | null,
): string | null {
	if (!overload || overload.params.length === 0) return null;

	const lines = overload.params.map((param, index) => {
		const custom = builtin.params?.[param.name];
		const fallback = PARAMETER_FALLBACK_DOCS[param.name];
		const detail = custom ?? fallback ?? 'Parameter used by this overload.';
		const marker = activeParamIndex === index ? '**→** ' : '- ';
		return `${marker}\`${param.name}\` (\`${param.type}\`): ${detail}`;
	});

	return ['**Parameters**', ...lines].join('  \n');
}

function formatBuiltinExamples(builtin: { examples?: string[] }): string | null {
	if (!builtin.examples || builtin.examples.length === 0) return null;
	return formatGlslCodeBlock(builtin.examples);
}

function formatUserFunctionSignature(
	returnType: string,
	name: string,
	params: { type: string; name: string }[],
): string {
	return `${returnType} ${name}(${params.map((param) => `${param.type} ${param.name}`).join(', ')})`;
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

function registerCompletion(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerCompletionItemProvider('glsl', {
		triggerCharacters: ['.', '#'],

		provideCompletionItems(model, position, context) {
			const CIK  = monaco.languages.CompletionItemKind;
			const CITR = monaco.languages.CompletionItemInsertTextRule;

			// Member access completions after a dot
			if (context.triggerCharacter === '.') {
				const lineText   = model.getLineContent(position.lineNumber);
				const before     = lineText.slice(0, position.column - 2);
				const wordBefore = before.match(/(\w+)\s*$/)?.[1];
				if (!wordBefore) return { suggestions: [] };

				const doc  = analyzeDocument(model.getValue());
				const type = resolveScopedType(doc, wordBefore, position.lineNumber)
					?? (BUILTIN_DOCS[wordBefore]?.signature.match(/^(\w+)/)?.[1]);
				if (!type) return { suggestions: [] };

				const dotRange: Monaco.IRange = {
					startLineNumber: position.lineNumber,
					endLineNumber:   position.lineNumber,
					startColumn:     position.column,
					endColumn:       position.column,
				};

				// Struct field completions
				const struct = doc.structs.find((s) => s.name === type);
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
			const memberMatch = textBefore.match(/(\w+)\s*\.\s*(\w*)$/);
			if (memberMatch && context.triggerCharacter !== '.') {
				const wordBefore = memberMatch[1];
				const doc = analyzeDocument(model.getValue());
				const type = resolveScopedType(doc, wordBefore, position.lineNumber)
					?? (BUILTIN_DOCS[wordBefore]?.signature.match(/^(\w+)/)?.[1]);
				if (type) {
					const range = completionRange(monaco, model, position);

					// Struct field completions
					const struct = doc.structs.find((s) => s.name === type);
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
			const docInfo     = analyzeDocument(model.getValue());
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
					documentation:   { value: doc.description },
					range,
				});
			}

			for (const v of docInfo.variables) {
				if (BUILTIN_DOCS[v.name] || GLSL_TYPES.includes(v.name)) continue;
				if (inCallCtx && !isTypeAcceptable(v.type, expectedTypes!)) continue;
				suggestions.push({
					label:         { label: v.name, description: v.type },
					kind:          v.qualifier === 'uniform'   ? CIK.Constant
					             : v.qualifier === 'attribute' ? CIK.Field
					             : CIK.Variable,
					insertText:    v.name,
					detail:        [v.qualifier, v.type].filter(Boolean).join(' '),
					documentation: { value: `**${v.qualifier ?? 'variable'}** \`${v.type} ${v.name}\`  \nDeclared at line ${v.line}` },
					range,
				});
			}

			for (const fn of docInfo.functions) {
				if (BUILTIN_DOCS[fn.name]) continue;
				if (inCallCtx && !isTypeAcceptable(fn.returnType, expectedTypes!)) continue;
				const paramList = fn.params.map((p) => `${p.type} ${p.name}`).join(', ');
				suggestions.push({
					label:           { label: fn.name, description: fn.returnType },
					kind:            CIK.Function,
					insertText:      `${fn.name}($0)`,
					insertTextRules: CITR.InsertAsSnippet,
					detail:          `${fn.returnType} ${fn.name}(${paramList})`,
					documentation:   { value: `User-defined function at line ${fn.line}` },
					range,
				});
			}

			for (const st of docInfo.structs) {
				const fieldList = st.fields.map((f) => `  ${f.type} ${f.name};`).join('\n');
				suggestions.push({
					label:         st.name,
					kind:          CIK.Struct,
					insertText:    st.name,
					detail:        `struct ${st.name}`,
					documentation: { value: `\`\`\`glsl\nstruct ${st.name} {\n${fieldList}\n}\n\`\`\`\n\nUser-defined struct at line ${st.line}` },
					range,
				});
			}

			// Defines are always shown (their type is unknown at parse time)
			for (const def of docInfo.defines) {
				suggestions.push({
					label:         def.name,
					kind:          CIK.Constant,
					insertText:    def.name,
					detail:        `#define ${def.name} ${def.value}`,
					documentation: { value: `Preprocessor macro at line ${def.line}` },
					range,
				});
			}

			return { suggestions };
		},
	});
}

function registerHover(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerHoverProvider('glsl', {
		provideHover(model, position): Monaco.languages.Hover | null {
			const word = model.getWordAtPosition(position);
			if (!word) return null;
			const workspaceDocs = getWorkspaceDocs(monaco);

			const name = word.word;
			const range: Monaco.IRange = {
				startLineNumber: position.lineNumber,
				endLineNumber:   position.lineNumber,
				startColumn:     word.startColumn,
				endColumn:       word.endColumn,
			};

			// Member access: swizzle or struct field after a dot
			const lineText  = model.getLineContent(position.lineNumber);
			const charBefore = lineText[word.startColumn - 2];
			if (charBefore === '.') {
				const textBeforeDot = lineText.slice(0, word.startColumn - 2);
				const ownerMatch    = textBeforeDot.match(/(\w+)\s*$/);
				if (ownerMatch) {
					const ownerName = ownerMatch[1];
					const docM = analyzeDocument(model.getValue());
					const ownerSymbol = findWorkspaceSymbol(monaco, ownerName, model, position.lineNumber);
					const ownerType = resolveScopedType(docM, ownerName, position.lineNumber)
						?? ownerSymbol?.type
						?? (BUILTIN_DOCS[ownerName]?.signature.match(/^(\w+)/)?.[1]);
					if (ownerType) {
						// Struct field
						const structM = workspaceDocs
							.map((entry) => entry.doc.structs.find((struct) => struct.name === ownerType))
							.find((struct): struct is NonNullable<typeof struct> => struct !== undefined);
						if (structM) {
							const field = structM.fields.find((f) => f.name === name);
							if (field) {
								const contents: Monaco.IMarkdownString[] = [
									{ value: formatGlslCodeBlock([`${field.type} ${ownerType}.${field.name};`]), isTrusted: true },
									{ value: `Field of struct \`${ownerType}\`.`, isTrusted: true },
								];
								return {
									range,
									contents,
								};
							}
						}
						// Swizzle
						const swizzles = getSwizzles(ownerType);
						if (swizzles.includes(name)) {
							const resultType = swizzleResultType(ownerType, name);
							const contents: Monaco.IMarkdownString[] = [
								{ value: formatGlslCodeBlock([`${resultType} value = ${ownerName}.${name};`]), isTrusted: true },
								{ value: `Swizzle from \`${ownerType}\` to \`${resultType}\`.`, isTrusted: true },
							];
							return {
								range,
								contents,
							};
						}
					}
				}
			}

			// Built-in function or variable
			const builtin = BUILTIN_DOCS[name];
			if (builtin) {
				const doc = analyzeDocument(model.getValue());
				const builtinLine = builtin.signature.split('\n')[0] ?? '';
				const activeCursor = getActiveCursorPositionForModel(model, position);
				const activeCursorColumn = activeCursor.lineNumber === position.lineNumber
					? activeCursor.column
					: null;

				const callInfo = extractCallInfoAtFunctionName(lineText, word.endColumn, activeCursorColumn);
				const overloadResolution = callInfo
					? resolveBuiltinOverload(name, callInfo.args, doc, position.lineNumber)
					: null;

				const overloads = parseBuiltinOverloads(builtin.signature);
				const selectedRaw = overloadResolution?.overload.raw ?? overloads[0]?.raw ?? null;
				const selectedIndex = selectedRaw
					? Math.max(0, overloads.findIndex((overload) => overload.raw === selectedRaw))
					: 0;

				const orderedOverloads = overloads
					.map((overload, index) => ({ overload, index }))
					.sort((a, b) => {
						if (a.index === selectedIndex && b.index !== selectedIndex) return -1;
						if (b.index === selectedIndex && a.index !== selectedIndex) return 1;
						return a.index - b.index;
					});

				const contents: Monaco.IMarkdownString[] = [];
				const selectedOverload = overloadResolution?.overload ?? overloads[selectedIndex] ?? overloads[0] ?? null;
				const activeParamIndex = callInfo?.activeArgIndex ?? null;

				if (orderedOverloads.length > 0) {
					const expandedSignatures: string[] = [];
					const seen = new Set<string>();
					let activeSignatureMarked = false;
					for (const { overload } of orderedOverloads) {
						const isSelected = selectedOverload?.raw === overload.raw;
						for (const expanded of expandBuiltinOverload(overload)) {
							if (seen.has(expanded)) continue;
							seen.add(expanded);
							if (!activeSignatureMarked && isSelected) {
								expandedSignatures.push(`→ ${expanded}`);
								activeSignatureMarked = true;
							} else {
								expandedSignatures.push(expanded);
							}
						}
					}
					contents.push({
						value: formatGlslCodeBlock(expandedSignatures),
						isTrusted: true,
					});
				} else {
					const builtinVarMatch = builtinLine.match(/^(\S+)\s+([a-zA-Z_]\w*)$/);
					contents.push({ value: formatGlslCodeBlock([builtinVarMatch ? `${builtinVarMatch[1]} ${builtinVarMatch[2]};` : builtinLine]), isTrusted: true });
				}

				const paramDocs = formatBuiltinParameterDocs(builtin, selectedOverload, activeParamIndex);
				if (paramDocs) contents.push({ value: paramDocs, isTrusted: true });
				if (builtin.returns) contents.push({ value: `**Returns**  \n${builtin.returns}`, isTrusted: true });
				contents.push({ value: builtin.description, isTrusted: true });
				const exampleBlock = formatBuiltinExamples(builtin);
				if (exampleBlock) {
					contents.push({ value: '**Examples**', isTrusted: true });
					contents.push({ value: exampleBlock, isTrusted: true });
				}

				return {
					range,
					contents,
				};
			}

			// GLSL type
			const typeDoc = TYPE_DOCS[name];
			if (typeDoc) {
				const doc = analyzeDocument(model.getValue());
				const activeCursor = getActiveCursorPositionForModel(model, position);
				const activeCursorColumn = activeCursor.lineNumber === position.lineNumber
					? activeCursor.column
					: null;
				const callInfo = extractCallInfoAtFunctionName(lineText, word.endColumn, activeCursorColumn);
				const activeConstructorIndex = callInfo
					? resolveTypeConstructorOverloadIndex(name, callInfo.args, doc, position.lineNumber)
					: null;
				const constructorDocs = formatTypeConstructorOverloadList(name, activeConstructorIndex);
				const contents: Monaco.IMarkdownString[] = [
					{ value: `\`\`\`glsl\n${typeDoc.struct}\n\`\`\``, isTrusted: true },
					...(constructorDocs ? [{ value: `**Constructors**  \n${formatGlslCodeBlock(constructorDocs)}`, isTrusted: true }] : []),
					{ value: typeDoc.description, isTrusted: true },
				];
				return {
					range,
					contents,
				};
			}

			// User-defined symbols
			const doc = analyzeDocument(model.getValue());

			// Local variable inside a function
			const enclosingFn = doc.functions.find(
				(f) => position.lineNumber >= f.line && position.lineNumber <= f.bodyEndLine,
			);
			const localVar = enclosingFn?.localVariables.find((v) => v.name === name);
			if (localVar) {
				const param = enclosingFn?.params.find((v) => v.name === name);
				const declarationText = param
					? formatFunctionParameterText(model, localVar.line, enclosingFn?.name ?? 'anonymous', localVar.name)
					: formatLineScopedText('Local variable declared at', model, localVar.line, localVar.name);
				const contents: Monaco.IMarkdownString[] = [
					{
						value: formatGlslCodeBlock([`${localVar.type} ${localVar.name};`]),
						isTrusted: true,
					},
					{ value: declarationText, isTrusted: true },
				];
				return {
					range,
					contents,
				};
			}

			const workspaceMatch = findWorkspaceSymbol(monaco, name, model, position.lineNumber);
			if (workspaceMatch?.model && workspaceMatch.line > 0) {
				const targetModel = workspaceMatch.model;
				const targetLineText = targetModel.getLineContent(workspaceMatch.line);
				const targetCol = targetLineText.indexOf(name);
				const startColumn = targetCol >= 0 ? targetCol + 1 : 1;
				const endColumn = targetCol >= 0 ? targetCol + name.length + 1 : Number.MAX_SAFE_INTEGER;
				const contents: Monaco.IMarkdownString[] = [];

				if (workspaceMatch.kind === 'function' && workspaceMatch.type) {
					const fn = workspaceDocs.find((entry) => entry.model.uri.toString() === targetModel.uri.toString())?.doc.functions.find((functionDoc) => functionDoc.name === name);
					if (fn) {
						const params = fn.params.map((param) => ({
							type: `${param.qualifier && param.qualifier !== 'in' ? `${param.qualifier} ` : ''}${param.type}`,
							name: param.name,
						}));
						contents.push({ value: formatGlslCodeBlock([formatUserFunctionSignature(fn.returnType, fn.name, params)]), isTrusted: true });
						if (params.length > 0) {
							contents.push({ value: ['**Parameters**', ...params.map((param) => `- \`${param.name}\` (\`${param.type}\`)`)].join('  \n'), isTrusted: true });
						}
						contents.push({ value: formatLineScopedText('User-defined function at', targetModel, fn.line, fn.name), isTrusted: true });
					}
				} else if (workspaceMatch.kind === 'struct') {
					const struct = workspaceDocs.find((entry) => entry.model.uri.toString() === targetModel.uri.toString())?.doc.structs.find((structDoc) => structDoc.name === name);
					if (struct) {
						const fields = struct.fields.map((field) => `  ${field.type} ${field.name};`).join('\n');
						contents.push({ value: `\`\`\`glsl\nstruct ${struct.name} {\n${fields}\n}\n\`\`\``, isTrusted: true });
						contents.push({ value: formatLineScopedText('User-defined struct at', targetModel, struct.line, struct.name), isTrusted: true });
					}
				} else if (workspaceMatch.kind === 'variable') {
					const variable = workspaceDocs.find((entry) => entry.model.uri.toString() === targetModel.uri.toString())?.doc.variables.find((docVariable) => docVariable.name === name);
					if (variable) {
						const qualifier = variable.qualifier ? `${variable.qualifier} ` : '';
						contents.push({ value: formatGlslCodeBlock([`${qualifier}${variable.type} ${variable.name};`.trim()]), isTrusted: true });
						contents.push({ value: formatLineScopedText('Declared at', targetModel, variable.line, variable.name), isTrusted: true });
					}
				} else if (workspaceMatch.kind === 'define') {
					const def = workspaceDocs.find((entry) => entry.model.uri.toString() === targetModel.uri.toString())?.doc.defines.find((define) => define.name === name);
					if (def) {
						contents.push({ value: `\`\`\`glsl\n#define ${def.name} ${def.value}\n\`\`\``, isTrusted: true });
						contents.push({ value: formatLineScopedText('Preprocessor macro at', targetModel, def.line, def.name), isTrusted: true });
					}
				}

				if (contents.length > 0) {
					return {
						range: {
							startLineNumber: position.lineNumber,
							endLineNumber: position.lineNumber,
							startColumn,
							endColumn,
						},
						contents,
					};
				}
			}

			const fn = doc.functions.find((f) => f.name === name);
			if (fn) {
				const activeCursor = getActiveCursorPositionForModel(model, position);
				const callCtx = activeCursor.lineNumber === position.lineNumber
					? inferCallContext(lineText, activeCursor.column - 1)
					: null;
				const activeParamIndex = callCtx?.fnName === fn.name ? callCtx.argIndex : null;
				const params = fn.params.map((param) => ({
					type: `${param.qualifier && param.qualifier !== 'in' ? `${param.qualifier} ` : ''}${param.type}`,
					name: param.name,
				}));
				const contents: Monaco.IMarkdownString[] = [
					{
						value: formatGlslCodeBlock([formatUserFunctionSignature(fn.returnType, fn.name, params)]),
						isTrusted: true,
					},
					...(params.length > 0
						? [{
							value: ['**Parameters**', ...params.map((param, index) => `${activeParamIndex === index ? '**→** ' : '- '}\`${param.name}\` (\`${param.type}\`)`)].join('  \n'),
							isTrusted: true,
						}]
						: []),
						{ value: formatLineScopedText('User-defined function at', model, fn.line, fn.name), isTrusted: true },
				];
				return {
					range,
					contents,
				};
			}

			const struct = doc.structs.find((s) => s.name === name);
			if (struct) {
				const fields = struct.fields.map((f) => `  ${f.type} ${f.name};`).join('\n');
				return {
					range,
					contents: [
						{ value: `\`\`\`glsl\nstruct ${struct.name} {\n${fields}\n}\n\`\`\``, isTrusted: true },
						{ value: formatLineScopedText('User-defined struct at', model, struct.line, struct.name), isTrusted: true },
					],
				};
			}

			const variable = doc.variables.find((v) => v.name === name);
			if (variable) {
				const uniformDoc = variable.qualifier === 'uniform' ? UNIFORM_DOCS[variable.name] : undefined;
				if (uniformDoc) {
					const contents: Monaco.IMarkdownString[] = [
						{ value: formatGlslCodeBlock([`${uniformDoc.signature};`]), isTrusted: true },
						{ value: uniformDoc.description, isTrusted: true },
					];
					return {
						range,
						contents,
					};
				}
				const qualifier = variable.qualifier ? `${variable.qualifier} ` : '';
				const contents: Monaco.IMarkdownString[] = [
					{
						value: formatGlslCodeBlock([`${qualifier}${variable.type} ${variable.name};`.trim()]),
						isTrusted: true,
					},
						{ value: formatLineScopedText('Declared at', model, variable.line, variable.name), isTrusted: true },
				];
				return {
					range,
					contents,
				};
			}

			const def = doc.defines.find((d) => d.name === name);
			if (def) {
				return {
					range,
					contents: [
						{ value: `\`\`\`glsl\n#define ${def.name} ${def.value}\n\`\`\``, isTrusted: true },
						{ value: formatLineScopedText('Preprocessor macro at', model, def.line, def.name), isTrusted: true },
					],
				};
			}

			return null;
		},
	});
}

function registerDefinition(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerDefinitionProvider('glsl', {
		provideDefinition(model, position): Monaco.languages.Definition | null {
			const word = model.getWordAtPosition(position);
			if (!word) return null;

			const name = word.word;
			const workspaceSymbol = findWorkspaceSymbol(monaco, name, model, position.lineNumber);
			if (!workspaceSymbol?.model) return null;

			const targetModel = workspaceSymbol.model;
			const lineText = targetModel.getLineContent(workspaceSymbol.line);
			const colStart = lineText.indexOf(name);
			const startCol = colStart >= 0 ? colStart + 1 : 1;
			const endCol   = colStart >= 0 ? colStart + name.length + 1 : Number.MAX_SAFE_INTEGER;

			return {
				uri:   targetModel.uri,
				range: {
					startLineNumber: workspaceSymbol.line,
					endLineNumber:   workspaceSymbol.line,
					startColumn:     startCol,
					endColumn:       endCol,
				},
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
				const doc = analyzeDocument(model.getValue());
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
						description: `User-defined at line ${fn.line}`,
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
	docInfo: ReturnType<typeof analyzeDocument>,
): number {
	const trimmed = arg.trim();
	// Trailing swizzle: word.xyzw / word.rgba / word.stpq
	const swizzleMatch = trimmed.match(/\.([xyzwrgbastpq]+)$/);
	if (swizzleMatch) return swizzleMatch[1].length;

	// Simple identifier - try to resolve its type
	const identMatch = trimmed.match(/^([a-zA-Z_]\w*)$/);
	if (identMatch) {
		const varType = resolveType(docInfo, identMatch[1]);
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
			const docInfo = analyzeDocument(model.getValue());

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
							let count = argComponentCount(buf, docInfo);
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
