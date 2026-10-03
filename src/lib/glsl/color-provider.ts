import type * as Monaco from 'monaco-editor/editor';
import { stripComments } from '#lib/glsl/analyze.js';

const FLOAT = String.raw`(\d+\.\d*|\.\d+|\d+)`;
/** Only fully literal constructors count, `vec3(uv, 1.0)` is not a color. */
const COLOR_RE = new RegExp(String.raw`\bvec([34])\s*\(\s*${FLOAT}\s*,\s*${FLOAT}\s*,\s*${FLOAT}\s*(?:,\s*${FLOAT}\s*)?\)`, 'g');

function formatFloat(value: number): string {
	const text = String(Math.round(value * 1000) / 1000);
	return text.includes('.') ? text : `${text}.0`;
}

/**
 * Shows a swatch and a color picker next to `vec3(r, g, b)` and `vec4(r, g, b, a)` literals whose components are all in [0, 1].
 * @example vec3(1.0, 0.5, 0.2) gets an orange swatch, picking a color rewrites the literal in place.
 */
export function registerColorProvider(monaco: typeof Monaco): Monaco.IDisposable {
	return monaco.languages.registerColorProvider('glsl', {
		provideDocumentColors(model) {
			const colors: Monaco.languages.IColorInformation[] = [];
			for (const match of stripComments(model.getValue()).matchAll(COLOR_RE)) {
				const size = Number(match[1]);
				const components = match.slice(2, 2 + size).map(Number);
				/** NaN means a vec4 with 3 arguments, a 5th group on a vec3 means 4 arguments, both are not colors. */
				if ((size === 3 && match[5] !== undefined) || components.some((component) => Number.isNaN(component) || component > 1)) continue;
				const start = model.getPositionAt(match.index);
				const end = model.getPositionAt(match.index + match[0].length);
				colors.push({
					color: { alpha: components[3] ?? 1, blue: components[2], green: components[1], red: components[0] },
					range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
				});
			}
			return colors;
		},
		provideColorPresentations(model, { color, range }) {
			const isVec4 = /^vec4/.test(model.getValueInRange(range));
			const parts = [color.red, color.green, color.blue, ...(isVec4 ? [color.alpha] : [])].map(formatFloat);
			return [{ label: `vec${parts.length}(${parts.join(', ')})` }];
		},
	});
}
