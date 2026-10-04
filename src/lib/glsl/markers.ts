import type * as Monaco from 'monaco-editor/editor';
import { compilerDiagnostic, type GlslDiagnostic, lintGlsl } from '#lib/glsl/lint.js';

const COMPILER_MESSAGE_RE = /(ERROR|WARNING):\s*\d+:(\d+):\s*(.*)/i;
const COMPILER_OWNER = 'glsl';
const LINT_OWNER = 'glsl-lint';

/** Diagnostics behind the markers of each model per owner, read back by the quick fix provider while the model version still matches. */
const modelDiagnostics = new WeakMap<Monaco.editor.ITextModel, Map<string, { diagnostics: GlslDiagnostic[]; version: number }>>();

function setDiagnostics(monaco: typeof Monaco, model: Monaco.editor.ITextModel, owner: string, diagnostics: GlslDiagnostic[]): void {
	const severities = {
		error: monaco.MarkerSeverity.Error,
		hint: monaco.MarkerSeverity.Hint,
		info: monaco.MarkerSeverity.Info,
		warning: monaco.MarkerSeverity.Warning,
	} as const;
	monaco.editor.setModelMarkers(model, owner, diagnostics.map<Monaco.editor.IMarkerData>((diagnostic) => {
		const start = model.getPositionAt(diagnostic.start);
		const end = model.getPositionAt(diagnostic.end);
		return {
			code: diagnostic.code === 'compiler' ? undefined : diagnostic.code,
			endColumn: end.column,
			endLineNumber: end.lineNumber,
			message: diagnostic.message,
			severity: severities[diagnostic.severity],
			source: owner === COMPILER_OWNER ? 'WebGL' : 'GLSL',
			startColumn: start.column,
			startLineNumber: start.lineNumber,
			tags: diagnostic.unnecessary ? [monaco.MarkerTag.Unnecessary] : undefined,
		};
	}));
	const owners = modelDiagnostics.get(model) ?? new Map();
	owners.set(owner, { diagnostics, version: model.getVersionId() });
	modelDiagnostics.set(model, owners);
}

/** Every diagnostic still in sync with the model content. */
export function getDiagnostics(model: Monaco.editor.ITextModel): GlslDiagnostic[] {
	const version = model.getVersionId();
	return [...(modelDiagnostics.get(model)?.values() ?? [])].flatMap((entry) => (entry.version === version ? entry.diagnostics : []));
}

/** Pass buffer whose compile errors are prefixed with `[label]` by the runtime. */
export interface CompileTarget {
	label: string;
	model: Monaco.editor.ITextModel;
}

/**
 * Routes WebGL compile errors to the buffer that produced them. Every pass compiles `Common + '\n' + buffer`, so a line inside Common's
 * range lands on the Common model and later lines are shifted back onto the pass buffer.
 * @example applyErrors(monaco, [{ label: 'Image', model }], null, "[Image] ERROR: 0:10: 'x' : undeclared identifier");
 */
export function applyErrors(monaco: typeof Monaco, targets: CompileTarget[], common: Monaco.editor.ITextModel | null, errorStr: string): void {
	const byModel = new Map<Monaco.editor.ITextModel, Map<string, GlslDiagnostic>>([...targets.map(({ model }) => model), ...(common ? [common] : [])].map((model) => [model, new Map()]));
	const commonLines = common?.getValue() ? common.getLineCount() : 0;
	let target: CompileTarget | undefined;

	for (const rawLine of errorStr.split('\n')) {
		const section = /^\[([^\]]+)\]\s*/.exec(rawLine);
		if (section) target = targets.find(({ label }) => label === section[1]);
		const match = COMPILER_MESSAGE_RE.exec(rawLine.slice(section?.[0].length ?? 0).trim());
		if (!match || !target) continue;
		const compiledLine = Number.parseInt(match[2], 10);
		const inCommon = common !== null && compiledLine <= commonLines;
		const model = inCommon ? common : target.model;
		const line = Math.min(Math.max(1, inCommon ? compiledLine : compiledLine - commonLines), model.getLineCount());
		const message = match[3].trim();
		const diagnostics = byModel.get(model)!;
		const key = `${line}:${message}`;
		if (diagnostics.has(key)) continue;
		const shared = !inCommon && common ? [common.getValue()] : [];
		const diagnostic = compilerDiagnostic(model.getValue(), shared, line, message);
		diagnostics.set(key, { ...diagnostic, severity: match[1].toUpperCase() === 'ERROR' ? 'error' : 'warning' });
	}

	for (const [model, diagnostics] of byModel) setDiagnostics(monaco, model, COMPILER_OWNER, [...diagnostics.values()]);
}

/**
 * Lints the model (unused symbols, no-op statements, GLSL ES 1.00 pitfalls, simplifications) and applies the markers, unused ones tagged
 * `Unnecessary` so Monaco fades them like unused imports in TypeScript.
 */
export function applyLint(monaco: typeof Monaco, model: Monaco.editor.ITextModel, sharedSources: string[]): void {
	setDiagnostics(monaco, model, LINT_OWNER, lintGlsl(model.getValue(), sharedSources));
}
