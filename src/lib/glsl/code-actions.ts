import type * as Monaco from 'monaco-editor/editor';
import type { GlslDiagnostic, GlslTextEdit } from '#lib/glsl/lint.js';
import { getDiagnostics } from '#lib/glsl/markers.js';

const FIX_ALL_TITLES: Readonly<Record<string, string>> = {
	'float-suffix': `Remove every 'f' suffix`,
	'int-to-float': 'Turn every int literal used as a float into a float literal',
	'no-effect': 'Apply the first fix to every statement without effect',
	'redundant-arithmetic': 'Remove every no-op operation',
	'unused-function': 'Remove all unused functions',
	'unused-uniform': 'Remove all unused uniforms',
	'unused-variable': 'Remove all unused variables',
	'write-only-variable': 'Remove all variables that are never read',
};

/**
 * Turns the fixes carried by GLSL diagnostics into Monaco quick fixes (lightbulb, Ctrl+. and Alt+Enter), plus a "fix all" action per
 * problem kind when the buffer has several.
 */
export function registerCodeActions(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerCodeActionProvider('glsl', {
		provideCodeActions(model, range, context) {
			const diagnostics = getDiagnostics(model);
			const versionId = model.getVersionId();
			const toWorkspaceEdit = (edits: GlslTextEdit[]): Monaco.languages.WorkspaceEdit => ({
				edits: edits.map(({ end, start, text }) => {
					const from = model.getPositionAt(start);
					const to = model.getPositionAt(end);
					return { resource: model.uri, textEdit: { range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text }, versionId };
				}),
			});
			const markerOf = (diagnostic: GlslDiagnostic) => {
				const start = model.getPositionAt(diagnostic.start);
				return context.markers.find((marker) => marker.startLineNumber === start.lineNumber && marker.startColumn === start.column && marker.message === diagnostic.message);
			};

			const startOffset = model.getOffsetAt(range.getStartPosition());
			const endOffset = model.getOffsetAt(range.getEndPosition());
			const actions: Monaco.languages.CodeAction[] = [];
			const fixAllCodes = new Set<string>();
			for (const diagnostic of diagnostics) {
				if (diagnostic.fixes.length === 0 || diagnostic.end < startOffset || diagnostic.start > endOffset) continue;
				const marker = markerOf(diagnostic);
				for (const fix of diagnostic.fixes) {
					actions.push({ diagnostics: marker ? [marker] : undefined, edit: toWorkspaceEdit(fix.edits), isPreferred: fix.preferred, kind: 'quickfix', title: fix.title });
				}
				fixAllCodes.add(diagnostic.code);
			}

			for (const code of fixAllCodes) {
				if (code === 'compiler') continue;
				const siblings = diagnostics.filter((diagnostic) => diagnostic.code === code && diagnostic.fixes.length > 0);
				if (siblings.length < 2) continue;
				/** Overlapping edits (two declarators of one statement) are dropped, the next lint pass reports what is left. */
				const disjoint: GlslTextEdit[] = [];
				for (const edit of siblings.flatMap((diagnostic) => diagnostic.fixes[0].edits).sort((a, b) => a.start - b.start)) {
					const last = disjoint.at(-1);
					if (last && last.start === edit.start && last.end === edit.end && last.text === edit.text) continue;
					if (!last || edit.start >= last.end) disjoint.push(edit);
				}
				actions.push({ edit: toWorkspaceEdit(disjoint), kind: 'quickfix', title: `${FIX_ALL_TITLES[code] ?? `Fix all '${code}' problems`} (${siblings.length})` });
			}

			return { actions, dispose() {} };
		},
	}, { providedCodeActionKinds: ['quickfix'] });
}
