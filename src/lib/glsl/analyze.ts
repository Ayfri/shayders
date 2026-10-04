import type { editor } from 'monaco-editor/editor';
import { type Declaration, GlslUnit, modelUnit } from '#lib/glsl/unit.js';

export { stripComments } from '#lib/glsl/unit.js';

/** Storage / parameter qualifier on a variable declaration */
export type GlslQualifier = 'uniform' | 'const' | 'in' | 'out' | 'inout';

interface GlslSymbol {
	name: string;
	/** 1-based position of the name. */
	line: number;
	column: number;
	/** Doc comment above the declaration, or trailing on its line. */
	comment: string | null;
}

export interface GlslVariable extends GlslSymbol {
	type: string;
	qualifier?: GlslQualifier;
	/** Array length as written, e.g. `4` or `MAX_LIGHTS` for `float arr[MAX_LIGHTS]`. */
	arraySize?: string;
	/** Initializer source with whitespace collapsed. */
	initializer?: string;
	/** Last line (1-based) where a local is visible, the end of its block. */
	scopeEndLine: number;
}

export interface GlslFunction extends GlslSymbol {
	returnType: string;
	params: GlslVariable[];
	/** Last line (1-based) of the function body closing brace */
	bodyEndLine: number;
	/** Parameters and locals, in declaration order. */
	localVariables: GlslVariable[];
}

export interface GlslDefine extends GlslSymbol {
	value: string;
	/** Parameter names of a function-like macro. */
	params: string[] | null;
}

export interface GlslStructField extends GlslSymbol {
	type: string;
}

export interface GlslStruct extends GlslSymbol {
	fields: GlslStructField[];
}

export interface GlslDocument {
	/** Globals, uniforms and constants. */
	variables: GlslVariable[];
	functions: GlslFunction[];
	defines: GlslDefine[];
	structs: GlslStruct[];
}

const MAX_INITIALIZER_LENGTH = 80;

/** Converts the token model into the line-based symbol tables the editor providers read. */
function documentOf(unit: GlslUnit): GlslDocument {
	const symbolAt = (name: string, nameIndex: number, first: number, last: number): GlslSymbol => {
		const { column, line } = unit.position(unit.tokens[nameIndex].start);
		return { column, comment: unit.comment(first, last), line, name };
	};
	const lineOfToken = (index: number) => unit.position(unit.tokens[Math.min(index, unit.tokens.length - 1)].start).line;
	const variableOf = (declaration: Declaration): GlslVariable => {
		const isParam = declaration.kind === 'param';
		const initializer = declaration.initStart >= 0 && declaration.initEnd > declaration.initStart
			? unit.slice(declaration.initStart, declaration.initEnd).replace(/\s+/g, ' ')
			: undefined;
		const arrayOpen = declaration.nameIndex + 1;
		return {
			...symbolAt(declaration.name, declaration.nameIndex, isParam ? declaration.nameIndex : declaration.statementStart, isParam ? declaration.nameIndex : declaration.statementEnd),
			arraySize: declaration.isArray ? unit.slice(arrayOpen + 1, unit.match[arrayOpen]) : undefined,
			initializer: initializer && initializer.length > MAX_INITIALIZER_LENGTH ? `${initializer.slice(0, MAX_INITIALIZER_LENGTH - 1)}…` : initializer,
			qualifier: (isParam ? declaration.qualifier ?? 'in' : declaration.qualifier ?? undefined) as GlslQualifier | undefined,
			scopeEndLine: lineOfToken(declaration.scopeEnd),
			type: declaration.type,
		};
	};

	return {
		defines: [...unit.defines.values()].map((macro) => {
			const { column, line } = unit.position(macro.nameStart);
			return { column, comment: unit.comment(macro.tokenIndex, macro.tokenIndex), line, name: macro.name, params: macro.params, value: macro.value };
		}),
		functions: unit.functions.map((fn) => ({
			...symbolAt(fn.name, fn.nameIndex, fn.start, fn.paramsClose),
			bodyEndLine: lineOfToken(fn.bodyClose),
			localVariables: unit.declarations.filter((declaration) => declaration.fn === fn).map(variableOf),
			params: fn.params.map(variableOf),
			returnType: fn.returnType,
		})),
		structs: [...unit.structs.values()].map((struct) => ({
			...symbolAt(struct.name, struct.nameIndex, struct.start, struct.nameIndex),
			fields: [...struct.fields].map(([name, field]) => ({ ...symbolAt(name, field.nameIndex, field.nameIndex - 1, field.nameIndex + 1), type: field.type })),
		})),
		variables: unit.declarations.filter((declaration) => declaration.kind === 'global' || declaration.kind === 'uniform').map(variableOf),
	};
}

const modelAnalysis = new WeakMap<editor.ITextModel, { doc: GlslDocument; version: number }>();

/** Memoized {@link analyzeDocument} per model version, so every provider, marker and tokenizer pass shares one parse per edit. */
export function analyzeModel(model: editor.ITextModel): GlslDocument {
	const version = model.getVersionId();
	const cached = modelAnalysis.get(model);
	if (cached?.version === version) return cached.doc;
	const doc = documentOf(modelUnit(model));
	modelAnalysis.set(model, { doc, version });
	return doc;
}

export function analyzeDocument(source: string): GlslDocument {
	return documentOf(new GlslUnit(source));
}

/** Look up the type of a global, uniform or constant. */
export function resolveType(doc: GlslDocument, name: string): string | undefined {
	return doc.variables.find((v) => v.name === name)?.type;
}

/** Innermost parameter or local named `name` visible on `line` (1-based), the latest declaration wins when a name is shadowed. */
export function findLocal(doc: GlslDocument, name: string, line: number): { fn: GlslFunction; variable: GlslVariable } | null {
	const fn = doc.functions.find((candidate) => line >= candidate.line && line <= candidate.bodyEndLine);
	const variable = fn?.localVariables.findLast((candidate) => candidate.name === name && candidate.line <= line && line <= candidate.scopeEndLine);
	return fn && variable ? { fn, variable } : null;
}

/** Look up the type of a symbol on `line` (1-based), locals and parameters first. */
export function resolveScopedType(doc: GlslDocument, name: string, line: number): string | undefined {
	return findLocal(doc, name, line)?.variable.type ?? resolveType(doc, name);
}
