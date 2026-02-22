import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';

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
