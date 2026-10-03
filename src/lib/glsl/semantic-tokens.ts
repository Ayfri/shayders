import type * as Monaco from 'monaco-editor/editor';
import { analyzeModel, stripComments, type GlslDocument, type GlslFunction } from '#lib/glsl/analyze.js';

const TOKEN_TYPES = ['type', 'function', 'parameter', 'variable', 'macro'] as const;
const TOKEN_MODIFIERS = ['uniform', 'readonly'] as const;

/** Token type index in the low byte, modifier bitset above it. */
type Classification = number;

const TYPE = 0;
const FUNCTION = 1;
const PARAMETER = 2;
const VARIABLE = 3;
const MACRO = 4;
const UNIFORM_MODIFIER = 1 << 8;
const READONLY_MODIFIER = 2 << 8;

/** `\b` keeps exponents and hex digits (`1e5`, `0xFF`) from being read as identifiers. */
const IDENTIFIER_RE = /\b[A-Za-z_]\w*/g;

/** Workspace-wide symbols, the first declaration kind wins so a macro never gets recolored as a function. */
function collectGlobals(docs: GlslDocument[]): Map<string, Classification> {
	const globals = new Map<string, Classification>();
	const add = (name: string, classification: Classification) => {
		if (!globals.has(name)) globals.set(name, classification);
	};
	for (const doc of docs) for (const define of doc.defines) add(define.name, MACRO);
	for (const doc of docs) for (const struct of doc.structs) add(struct.name, TYPE);
	for (const doc of docs) for (const fn of doc.functions) add(fn.name, FUNCTION);
	for (const doc of docs) {
		for (const variable of doc.variables) {
			if (variable.qualifier === 'uniform') add(variable.name, VARIABLE | UNIFORM_MODIFIER);
			else if (variable.qualifier === 'const') add(variable.name, VARIABLE | READONLY_MODIFIER);
		}
	}
	return globals;
}

/** Scans only `range` (comments are stripped from the whole source first, a block comment can open above it). */
function encodeTokens(model: Monaco.editor.ITextModel, range: Monaco.IRange, doc: GlslDocument, globals: ReadonlyMap<string, Classification>): Uint32Array<ArrayBuffer> {
	const text = stripComments(model.getValue());
	const endOffset = model.getOffsetAt({ column: model.getLineMaxColumn(range.endLineNumber), lineNumber: range.endLineNumber });
	const data: number[] = [];
	let line = range.startLineNumber - 1;
	let lineStart = model.getOffsetAt({ column: 1, lineNumber: range.startLineNumber });
	let nextNewline = text.indexOf('\n', lineStart);
	let previousLine = 0;
	let previousColumn = 0;
	let functionCursor = 0;
	const identifiers = new RegExp(IDENTIFIER_RE.source, 'g');
	identifiers.lastIndex = lineStart;

	for (let match = identifiers.exec(text); match && match.index < endOffset; match = identifiers.exec(text)) {
		const index = match.index;
		if (text[index - 1] === '.') continue;
		while (nextNewline !== -1 && nextNewline < index) {
			line += 1;
			lineStart = nextNewline + 1;
			nextNewline = text.indexOf('\n', lineStart);
		}

		const name = match[0];
		const lineNumber = line + 1;
		while (functionCursor < doc.functions.length && doc.functions[functionCursor].bodyEndLine < lineNumber) functionCursor += 1;
		const fn: GlslFunction | undefined = doc.functions[functionCursor];
		let classification = globals.get(name);
		if (fn && fn.line <= lineNumber) {
			if (fn.params.some((param) => param.name === name)) classification = PARAMETER;
			else if (fn.localVariables.some((variable) => variable.name === name)) continue;
		}
		if (classification === undefined) continue;

		const column = index - lineStart;
		data.push(line - previousLine, line === previousLine ? column - previousColumn : column, name.length, classification & 0xff, classification >> 8);
		previousLine = line;
		previousColumn = column;
	}

	return Uint32Array.from(data);
}

/**
 * Colors symbols the lexer cannot know about (structs, user functions, uniforms, consts, macros, parameters), resolved across every buffer.
 * The Monarch grammar stays static, so edits never trigger a full retokenization.
 */
export function registerSemanticTokens(monaco: typeof Monaco): Monaco.IDisposable {
	const changed = new monaco.Emitter<void>();
	let lastSignature: string | null = null;

	/** Range provider because `register.all` only ships the viewport semantic tokens feature, it also keeps work to the visible lines. */
	const provider = monaco.languages.registerDocumentRangeSemanticTokensProvider('glsl', {
		getLegend: () => ({ tokenModifiers: [...TOKEN_MODIFIERS], tokenTypes: [...TOKEN_TYPES] }),
		onDidChange: changed.event,
		provideDocumentRangeSemanticTokens(model, range) {
			const globals = collectGlobals(monaco.editor.getModels().filter((candidate) => candidate.getLanguageId() === 'glsl').map(analyzeModel));
			/** A symbol added or removed in one buffer recolors the other buffers too. */
			const signature = Array.from(globals, ([name, classification]) => `${name}:${classification}`).join(',');
			if (lastSignature !== null && signature !== lastSignature) queueMicrotask(() => changed.fire());
			lastSignature = signature;
			return { data: encodeTokens(model, range, analyzeModel(model), globals) };
		},
	});

	return {
		dispose() {
			provider.dispose();
			changed.dispose();
		},
	};
}
