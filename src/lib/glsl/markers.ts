import type * as Monaco from 'monaco-editor/editor';
import { analyzeModel, findUnused } from '#lib/glsl/analyze.js';

const COMPILER_MESSAGE_RE = /(ERROR|WARNING):\s*\d+:(\d+):\s*(.*)/i;

/**
 * Parses WebGL shader compilation errors and applies them as Monaco markers.
 * @example applyErrors(monaco, model, "ERROR: 0:10: 'x' : undeclared identifier");
 */
export function applyErrors(
	monaco: typeof Monaco,
	model: Monaco.editor.ITextModel,
	errorStr: string,
): void {
	const lastLine = model.getLineCount();
	const markers = errorStr.split('\n').flatMap<Monaco.editor.IMarkerData>((rawLine) => {
		const match = COMPILER_MESSAGE_RE.exec(rawLine.trim());
		if (!match) return [];
		const line = Math.min(Math.max(1, Number.parseInt(match[2], 10)), lastLine);
		return [{
			severity: match[1].toUpperCase() === 'ERROR' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
			message: match[3].trim(),
			startLineNumber: line,
			endLineNumber: line,
			startColumn: 1,
			endColumn: Number.MAX_SAFE_INTEGER,
			source: 'WebGL',
		}];
	});

	monaco.editor.setModelMarkers(model, 'glsl', markers);
}

/**
 * Analyses the model for unused symbols and no-effect statements, then applies markers tagged `Unnecessary`
 * so Monaco dims them like unused imports in TypeScript.
 */
export function applyHints(
	monaco: typeof Monaco,
	model: Monaco.editor.ITextModel,
	workspaceSrcs: string[],
): void {
	const markers = findUnused(model.getValue(), analyzeModel(model), workspaceSrcs).map<Monaco.editor.IMarkerData>((item) => ({
		severity: item.kind === 'uniform' ? monaco.MarkerSeverity.Hint : monaco.MarkerSeverity.Warning,
		tags: [monaco.MarkerTag.Unnecessary],
		message: item.message,
		startLineNumber: item.line,
		endLineNumber: item.line,
		startColumn: item.startColumn,
		endColumn: item.endColumn,
		source: 'GLSL',
	}));

	monaco.editor.setModelMarkers(model, 'glsl-hints', markers);
}
