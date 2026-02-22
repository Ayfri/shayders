import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';
import { analyzeDocument, findUnused } from '$lib/glsl/analyze';

/**
 * Parses WebGL shader compilation errors and applies them as Monaco markers.
 * Supported format: `ERROR: 0:<line>: <message>`
 */
export function applyErrors(
	monaco: typeof Monaco,
	model: Monaco.editor.ITextModel,
	errorStr: string,
): void {
	if (!errorStr.trim()) {
		monaco.editor.setModelMarkers(model, 'glsl', []);
		return;
	}

	const markers: Monaco.editor.IMarkerData[] = [];

	for (const rawLine of errorStr.split('\n')) {
		const line = rawLine.trim();
		if (!line) continue;

		// Standard WebGL: "ERROR: 0:10: 'x' : undeclared identifier"
		const m = line.match(/ERROR:\s*\d+:(\d+):\s*(.*)/i);
		if (m) {
			const lineNum = Math.max(1, parseInt(m[1]));
			const msg = m[2].trim();
			const totalLines = model.getLineCount();
			markers.push({
				severity: monaco.MarkerSeverity.Error,
				message: msg,
				startLineNumber: Math.min(lineNum, totalLines),
				endLineNumber:   Math.min(lineNum, totalLines),
				startColumn: 1,
				endColumn: Number.MAX_SAFE_INTEGER,
				source: 'WebGL',
			});
			continue;
		}

		// WARNING: 0:5: ...
		const w = line.match(/WARNING:\s*\d+:(\d+):\s*(.*)/i);
		if (w) {
			const lineNum = Math.max(1, parseInt(w[1]));
			const msg = w[2].trim();
			const totalLines = model.getLineCount();
			markers.push({
				severity: monaco.MarkerSeverity.Warning,
				message: msg,
				startLineNumber: Math.min(lineNum, totalLines),
				endLineNumber:   Math.min(lineNum, totalLines),
				startColumn: 1,
				endColumn: Number.MAX_SAFE_INTEGER,
				source: 'WebGL',
			});
		}
	}

	monaco.editor.setModelMarkers(model, 'glsl', markers);
}

/**
 * Analyses the current model for unused symbols and no-effect statements,
 * then applies Hint-severity markers with the `Unnecessary` tag so Monaco
 * dims them exactly like unused imports in TypeScript.
 */
export function applyHints(
	monaco: typeof Monaco,
	model: Monaco.editor.ITextModel,
): void {
	const src    = model.getValue();
	const doc    = analyzeDocument(src);
	const unused = findUnused(src, doc);

	const markers: Monaco.editor.IMarkerData[] = unused.map((item) => ({
		severity: item.kind === 'uniform'
			? monaco.MarkerSeverity.Hint
			: monaco.MarkerSeverity.Warning,
		// MarkerTag.Unnecessary = 1 → dims / grays out the token
		tags: [1 as Monaco.MarkerTag],
		message: item.message,
		startLineNumber: item.line,
		endLineNumber:   item.line,
		startColumn:     item.startColumn,
		endColumn:       item.endColumn,
		source: 'GLSL',
	}));

	monaco.editor.setModelMarkers(model, 'glsl-hints', markers);
}
