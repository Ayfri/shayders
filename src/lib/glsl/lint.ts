import { BUILTIN_DOCS, UNIFORM_DOCS } from '#lib/glsl/builtins.js';
import {
	ASSIGN_OPS,
	BINARY_PRECEDENCE,
	BUILTIN_TYPES,
	type Declaration,
	GlslUnit,
	PARAM_QUALIFIERS,
	type Range,
	STATEMENT_KEYWORDS,
	SWIZZLE_SETS,
} from '#lib/glsl/unit.js';

export type GlslSeverity = 'error' | 'warning' | 'info' | 'hint';

/** Source offsets, `end` exclusive. */
export interface GlslTextEdit {
	start: number;
	end: number;
	text: string;
}

export interface GlslFix {
	title: string;
	edits: GlslTextEdit[];
	/** Listed first in the quick fix menu and applied by "fix all". */
	preferred?: boolean;
}

export interface GlslDiagnostic {
	code: string;
	message: string;
	severity: GlslSeverity;
	start: number;
	end: number;
	/** Faded out like an unused import. */
	unnecessary?: boolean;
	fixes: GlslFix[];
}

const IDEMPOTENT_FUNCTIONS = new Set(['abs', 'sign', 'floor', 'ceil', 'fract', 'normalize']);
const FLOAT_PARAM_TYPE_RE = /^(?:genType|float|vecN|vec[234]|matN|mat[234])$/;

/** WebGL 1 rewrites of GLSL ES 3.00 builtins, `x` is the only argument and must be cheap to repeat when it appears twice. */
const ES1_FALLBACKS: Readonly<Partial<Record<string, (x: string) => string>>> = {
	cosh: (x) => `(exp(${x}) + exp(-${x})) * 0.5`,
	round: (x) => `floor(${x} + 0.5)`,
	sinh: (x) => `(exp(${x}) - exp(-${x})) * 0.5`,
	trunc: (x) => `sign(${x}) * floor(abs(${x}))`,
};

/** WebGL 1 names of texture functions missing from GLSL ES 1.00 fragment shaders, for a `sampler2D` and a `samplerCube` first argument. */
const TEXTURE_RENAMES: Readonly<Record<string, readonly [string, string]>> = {
	texture: ['texture2D', 'textureCube'],
	texture2DLod: ['texture2DLodEXT', 'textureCubeLodEXT'],
	texture2DProjLod: ['texture2DProjLodEXT', 'texture2DProjLodEXT'],
	textureCubeLod: ['texture2DLodEXT', 'textureCubeLodEXT'],
	textureLod: ['texture2DLodEXT', 'textureCubeLodEXT'],
};

function isFloatFamily(type: string | null): boolean {
	return type !== null && (type === 'float' || type === 'genType' || /^vec[234]$/.test(type) || /^mat[234]/.test(type));
}

function formatFloat(value: number): string {
	const text = String(value);
	return /[.e]/.test(text) ? text : `${text}.0`;
}

/** Optimal string alignment distance, a swapped pair of letters (`sni` → `sin`) costs 1. */
function editDistance(a: string, b: string): number {
	const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
		}
	}
	return rows[a.length][b.length];
}

const builtinParamFloatCache = new Map<string, boolean>();

/** True when every overload of the builtin takes a float-family value at `index`, so an int literal there never compiles in GLSL ES 1.00. */
function builtinParamIsFloat(name: string, index: number): boolean {
	const key = `${name}:${index}`;
	const cached = builtinParamFloatCache.get(key);
	if (cached !== undefined) return cached;
	const types = (BUILTIN_DOCS[name]?.signature.split('\n') ?? []).flatMap((overload) => {
		const params = overload.slice(overload.indexOf('(') + 1, overload.lastIndexOf(')')).split(',');
		const words = params[index]?.trim().split(/\s+/).filter((word) => !PARAM_QUALIFIERS.has(word)) ?? [];
		return words.length >= 2 ? [words[0]] : [];
	});
	const result = types.length > 0 && types.every((type) => FLOAT_PARAM_TYPE_RE.test(type));
	builtinParamFloatCache.set(key, result);
	return result;
}

/** Collects diagnostics with their quick fixes for one buffer. */
class GlslLinter {
	readonly diagnostics: GlslDiagnostic[] = [];
	private readonly unit: GlslUnit;

	constructor(source: string, sharedSources: readonly string[]) {
		this.unit = new GlslUnit(source, sharedSources.map((shared) => new GlslUnit(shared)));
	}

	run(): GlslDiagnostic[] {
		this.checkUnused();
		this.checkStatements();
		const { tokens } = this.unit;
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.kind === 'int' || token.kind === 'float') this.checkLiteral(i);
			else if (token.kind === 'ident' && this.unit.text(i + 1) === '(' && this.unit.match[i + 1] > i) this.checkCall(i);
		}
		return this.diagnostics;
	}

	private report(diagnostic: Omit<GlslDiagnostic, 'start' | 'end' | 'fixes'> & { from: number; to?: number; fixes?: GlslFix[] }): void {
		const { tokens } = this.unit;
		const { fixes = [], from, to = from + 1, ...rest } = diagnostic;
		this.diagnostics.push({ ...rest, end: tokens[to - 1].end, fixes, start: tokens[from].start });
	}

	/** Replaces tokens [start, end) with `text`. */
	private replace(start: number, end: number, text: string): GlslTextEdit {
		return { end: this.unit.tokens[end - 1].end, start: this.unit.tokens[start].start, text };
	}

	private wrap(range: Range): string {
		const text = this.unit.slice(range.start, range.end);
		return this.unit.isAtomic(range) ? text : `(${text})`;
	}

	/** Removal edit for a source span, widened to whole lines when nothing else shares them so no blank line is left behind. */
	private removal(start: number, end: number): GlslTextEdit {
		const { source } = this.unit;
		const lineStart = source.lastIndexOf('\n', start - 1) + 1;
		const newline = source.indexOf('\n', end);
		const lineEnd = newline < 0 ? source.length : newline;
		const trailing = /^[ \t]*/.exec(source.slice(end, lineEnd))![0].length;
		if (source.slice(lineStart, start).trim() !== '' || end + trailing !== lineEnd) return { end: end + trailing, start, text: '' };
		let removeEnd = newline < 0 ? lineEnd : lineEnd + 1;
		const blankAfter = /^[ \t]*\n/.exec(source.slice(removeEnd))?.[0].length ?? 0;
		if (blankAfter > 0 && (lineStart === 0 || /\n[ \t]*\n$/.test(source.slice(0, lineStart)))) removeEnd += blankAfter;
		return { end: removeEnd, start: lineStart, text: '' };
	}

	private removeStatement(start: number, end: number): GlslTextEdit {
		return this.removal(this.unit.tokens[start].start, this.unit.tokens[end].end);
	}

	/** Removes one declarator, the whole statement when it is the only one, null when its initializer has side effects. */
	private removeDeclaration(declaration: Declaration): GlslTextEdit | null {
		const { unit } = this;
		if (declaration.initStart >= 0 && !unit.isPure(declaration.initStart, declaration.initEnd)) return null;
		if (declaration.siblings.length === 1) {
			const isForInit = unit.text(declaration.statementStart - 1) === '(';
			return isForInit ? null : this.removeStatement(declaration.statementStart, declaration.statementEnd);
		}
		const position = declaration.siblings.indexOf(declaration);
		const next = declaration.siblings[position + 1];
		if (next) return { end: unit.tokens[next.declaratorStart].start, start: unit.tokens[declaration.declaratorStart].start, text: '' };
		return { end: unit.tokens[declaration.declaratorEnd - 1].end, start: unit.tokens[declaration.declaratorStart - 2].end, text: '' };
	}

	private identifierCounts(): Map<string, number> {
		const counts = new Map<string, number>();
		for (const unit of [this.unit, ...this.unit.shared]) {
			unit.tokens.forEach((token, index) => {
				if (token.kind === 'ident' && unit.text(index - 1) !== '.') counts.set(token.text, (counts.get(token.text) ?? 0) + 1);
				else if (token.kind === 'directive') {
					for (const [word] of token.text.slice(1).matchAll(/[A-Za-z_]\w*/g)) counts.set(word, (counts.get(word) ?? 0) + 1);
				}
			});
		}
		return counts;
	}

	private checkUnused(): void {
		const { unit } = this;
		const counts = this.identifierCounts();

		for (const fn of unit.functions) {
			if (fn.name === 'main' || (counts.get(fn.name) ?? 0) > unit.findFunctions(fn.name).length) continue;
			this.report({
				code: 'unused-function',
				fixes: [{ edits: [this.removeStatement(fn.start, fn.bodyClose)], preferred: true, title: `Remove unused function '${fn.name}'` }],
				from: fn.nameIndex,
				message: `Function '${fn.name}' is never called.`,
				severity: 'warning',
				unnecessary: true,
			});
		}

		for (const declaration of unit.declarations) {
			const { kind, name } = declaration;
			if (kind === 'global' || kind === 'uniform') {
				if ((counts.get(name) ?? 0) > 1) continue;
				const removal = this.removeDeclaration(declaration);
				const label = kind === 'uniform' ? 'Uniform' : declaration.qualifier === 'const' ? 'Constant' : 'Global variable';
				this.report({
					code: kind === 'uniform' ? 'unused-uniform' : 'unused-variable',
					fixes: removal ? [{ edits: [removal], preferred: true, title: `Remove unused ${label.toLowerCase()} '${name}'` }] : [],
					from: declaration.nameIndex,
					message: `${label} '${name}' is never used${kind === 'uniform' ? ' in this shader' : ''}.`,
					severity: kind === 'uniform' ? 'hint' : 'warning',
					unnecessary: true,
				});
				continue;
			}

			const reads: number[] = [];
			const writes: number[] = [];
			const from = kind === 'param' ? declaration.fn!.bodyOpen : declaration.declaratorEnd;
			for (let i = from; i < declaration.scopeEnd; i++) {
				if (unit.tokens[i].kind !== 'ident' || unit.text(i) !== name || unit.text(i - 1) === '.') continue;
				if (unit.resolveDeclaration(name, i) !== declaration) continue;
				(this.isWrite(i) ? writes : reads).push(i);
			}
			if (reads.length > 0) continue;

			if (kind === 'param') {
				if (declaration.qualifier || writes.length > 0) continue;
				this.report({ code: 'unused-parameter', from: declaration.nameIndex, message: `Parameter '${name}' is never used.`, severity: 'hint', unnecessary: true });
				continue;
			}

			const edits = [this.removeDeclaration(declaration), ...writes.map((write) => this.removeWrite(write))];
			const removable = edits.every((edit): edit is GlslTextEdit => edit !== null);
			this.report({
				code: writes.length > 0 ? 'write-only-variable' : 'unused-variable',
				fixes: removable ? [{ edits, preferred: true, title: writes.length > 0 ? `Remove '${name}' and its ${writes.length} assignment${writes.length > 1 ? 's' : ''}` : `Remove unused variable '${name}'` }] : [],
				from: declaration.nameIndex,
				message: writes.length > 0 ? `Variable '${name}' is assigned but its value is never read.` : `Variable '${name}' is never used.`,
				severity: 'warning',
				unnecessary: true,
			});
		}
	}

	/** Identifier at `index` starts a statement that only assigns or increments it (`x = …;`, `x.y += …;`, `x++;`, `++x;`). */
	private isWrite(index: number): boolean {
		const { unit } = this;
		const prefix = (unit.text(index - 1) === '++' || unit.text(index - 1) === '--') && unit.isStatementStart(index - 1);
		if (!prefix && !unit.isStatementStart(index)) return false;
		let end = index + 1;
		while (true) {
			if (unit.text(end) === '.' && unit.tokens[end + 1]?.kind === 'ident') end += 2;
			else if (unit.text(end) === '[' && unit.match[end] > end) end = unit.match[end] + 1;
			else break;
		}
		const next = unit.text(end);
		return prefix ? next === ';' || next === ')' : ASSIGN_OPS.has(next) || next === '++' || next === '--';
	}

	/** Removes a write-only statement when its right-hand side is free of side effects. */
	private removeWrite(index: number): GlslTextEdit | null {
		const { unit } = this;
		const start = unit.isStatementStart(index) ? index : index - 1;
		const end = unit.statementEnd(start);
		if (end < 0 || unit.isControlBody(start)) return null;
		let operator = start;
		while (operator < end && !ASSIGN_OPS.has(unit.text(operator)) && unit.text(operator) !== '++' && unit.text(operator) !== '--') operator++;
		if (!unit.isPure(operator + 1, end)) return null;
		return this.removeStatement(start, end);
	}

	/** Expression statements whose value is thrown away: `vec3(1.0);`, `col * 2.0;`, a call to a pure function. */
	private checkStatements(): void {
		const { unit } = this;
		for (const fn of unit.functions) {
			for (let i = fn.bodyOpen + 1; i < fn.bodyClose; i++) {
				const token = unit.tokens[i];
				if (token.text === 'for' && unit.text(i + 1) === '(' && unit.match[i + 1] > i) {
					i = unit.match[i + 1];
					continue;
				}
				if (!unit.isStatementStart(i) || unit.declarationStarts.has(i) || STATEMENT_KEYWORDS.has(token.text) || token.kind === 'directive' || '{};'.includes(token.text)) continue;
				const end = unit.statementEnd(i);
				if (end < 0 || !unit.isPure(i, end)) continue;
				const fixes: GlslFix[] = [];
				const operand = unit.typeAfter(i).end;
				const operator = unit.text(operand);
				if (operand < end && operator === '==') {
					fixes.push({ edits: [this.replace(operand, operand + 1, '=')], preferred: true, title: `Change '==' to '='` });
				} else if (operand < end && ['+', '-', '*', '/'].includes(operator) && unit.isSimple({ end: operand, start: i }) && this.isCompoundSafe(operator, operand + 1, end)) {
					fixes.push({ edits: [this.replace(operand, operand + 1, `${operator}=`)], title: `Change '${operator}' to '${operator}='` });
				}
				if (!unit.isControlBody(i)) fixes.push({ edits: [this.removeStatement(i, end)], title: 'Remove statement' });
				this.report({
					code: 'no-effect',
					fixes,
					from: i,
					message: 'Statement has no effect, its value is discarded.',
					severity: 'warning',
					to: end + 1,
					unnecessary: true,
				});
				i = end;
			}
		}
	}

	/** `x op rest` equals `x op= rest` only when `rest` binds tighter, or associates with `+` / `*`. */
	private isCompoundSafe(operator: string, start: number, end: number): boolean {
		const { unit } = this;
		const precedence = BINARY_PRECEDENCE[operator];
		for (let i = start; i < end; i++) {
			const text = unit.text(i);
			if ((text === '(' || text === '[') && unit.match[i] > i) i = unit.match[i];
			else if (text === '?') return false;
			else if (BINARY_PRECEDENCE[text] !== undefined && !unit.isUnary(i)) {
				const other = BINARY_PRECEDENCE[text];
				if (other < precedence || (other === precedence && operator !== '+' && operator !== '*')) return false;
			}
		}
		return true;
	}

	private checkLiteral(index: number): void {
		const { unit } = this;
		const { text } = unit.tokens[index];
		if (/[fF]$/.test(text) && !/^0[xX]/.test(text)) {
			const fixed = text.slice(0, -1);
			this.report({
				code: 'float-suffix',
				fixes: [{ edits: [this.replace(index, index + 1, /[.eE]/.test(fixed) ? fixed : `${fixed}.0`)], preferred: true, title: `Remove the 'f' suffix` }],
				from: index,
				message: `WebGL 1 shaders don't accept the 'f' after a number.`,
				severity: 'error',
			});
			return;
		}
		if (/[uU]$/.test(text)) {
			this.report({
				code: 'uint-literal',
				fixes: [{ edits: [this.replace(index, index + 1, text.slice(0, -1))], preferred: true, title: `Remove the 'u' suffix` }],
				from: index,
				message: `WebGL 1 shaders have no unsigned integers ('u' numbers).`,
				severity: 'error',
			});
			return;
		}
		if (/^\d+$/.test(text) && this.intNeedsFloat(index)) {
			this.report({
				code: 'int-to-float',
				fixes: [{ edits: [this.replace(index, index + 1, `${text}.0`)], preferred: true, title: `Change to '${text}.0'` }],
				from: index,
				message: `WebGL 1 never turns an int into a float on its own, write '${text}.0'.`,
				severity: 'error',
			});
			return;
		}
		if (unit.tokens[index].kind === 'float') this.checkRedundantArithmetic(index);
	}

	/** Int literal used where only a float fits: arithmetic or comparison with a float operand, float assignment or return, float builtin argument. */
	private intNeedsFloat(index: number): boolean {
		const { unit } = this;
		let before = index - 1;
		if (unit.isUnary(before)) before--;
		const previous = unit.text(before);
		const next = unit.text(index + 1);
		const isArithmetic = (operator: string) => (BINARY_PRECEDENCE[operator] ?? 0) >= 2;
		if (isArithmetic(previous) && !unit.isUnary(before) && isFloatFamily(unit.typeBefore(before - 1))) return true;
		if (isArithmetic(next) && isFloatFamily(unit.typeAfter(index + 2).type)) return true;
		if (ASSIGN_OPS.has(previous)) {
			const target = unit.typeBefore(before - 1);
			return previous === '=' ? target === 'float' : isFloatFamily(target);
		}
		if (previous === 'return' && next === ';') return unit.enclosingFunction(index)?.returnType === 'float';
		if ((previous === '(' || previous === ',') && (next === ',' || next === ')')) {
			const call = this.enclosingCall(index);
			if (!call) return false;
			const user = unit.findFunctions(call.name);
			if (user.length > 0) return user.length === 1 && user[0].fn.params[call.argument]?.type === 'float';
			return builtinParamIsFloat(call.name, call.argument);
		}
		return false;
	}

	private enclosingCall(index: number): { name: string; argument: number } | null {
		const { unit } = this;
		let argument = 0;
		for (let i = index - 1; i >= 0; i--) {
			const text = unit.text(i);
			if ((text === ')' || text === ']') && unit.match[i] >= 0) i = unit.match[i];
			else if (text === ',') argument++;
			else if (text === '(') {
				const callee = unit.tokens[i - 1];
				return callee?.kind === 'ident' && !STATEMENT_KEYWORDS.has(callee.text) ? { argument, name: callee.text } : null;
			} else if (text === ';' || text === '{' || text === '}' || text === '[') return null;
		}
		return null;
	}

	/** `x * 1.0`, `x / 1.0`, `x + 0.0`, `x - 0.0`, `1.0 * x`, `0.0 + x`. */
	private checkRedundantArithmetic(index: number): void {
		const { unit } = this;
		const value = Number.parseFloat(unit.text(index));
		if (value !== 0 && value !== 1) return;
		const previous = unit.text(index - 1);
		const next = unit.text(index + 1);
		const neutral = value === 1 ? ['*', '/'] : ['+', '-'];
		const report = (from: number, edit: GlslTextEdit, operator: string) => this.report({
			code: 'redundant-arithmetic',
			fixes: [{ edits: [edit], preferred: true, title: 'Remove the no-op operation' }],
			from,
			message: value === 1 ? `${operator === '/' ? 'Dividing' : 'Multiplying'} by 1.0 has no effect.` : `${operator === '-' ? 'Subtracting' : 'Adding'} 0.0 has no effect.`,
			severity: 'hint',
			to: from + 2,
			unnecessary: true,
		});
		/** `x * 1.0`: the literal must not be the left operand of a tighter operator (`x + 0.0 * y`). */
		if (index >= 2 && neutral.includes(previous) && !unit.isUnary(index - 1) && (BINARY_PRECEDENCE[next] ?? 0) <= BINARY_PRECEDENCE[previous] && next !== '.' && next !== '[') {
			report(index - 1, { end: unit.tokens[index].end, start: unit.tokens[index - 2].end, text: '' }, previous);
			return;
		}
		/** `1.0 * x`: only `*` and `+` have the literal as a neutral left operand, and the left context must not bind tighter (`a / 1.0 * x`). */
		if ((next === '*' || next === '+') && neutral.includes(next) && !unit.isUnary(index - 1) && unit.tokens[index + 2] && unit.fitsWithoutParens(index, index + 1, BINARY_PRECEDENCE[next])) {
			report(index, { end: unit.tokens[index + 2].start, start: unit.tokens[index].start, text: '' }, next);
		}
	}

	/** Builtins missing from WebGL 1 (GLSL ES 3.00 only) or behind an extension the buffer doesn't enable. */
	private checkAvailability(index: number, name: string, args: Range[], call: Range): boolean {
		const { unit } = this;
		const doc = BUILTIN_DOCS[name];
		const cube = args.length > 0 && unit.rangeType(args[0]) === 'samplerCube';
		const renamed = TEXTURE_RENAMES[name]?.[cube ? 1 : 0];
		if (renamed) {
			const extension = BUILTIN_DOCS[renamed]?.extension;
			this.report({
				code: 'es3-builtin',
				fixes: [{ edits: [this.replace(index, index + 1, renamed), ...(extension ? this.enableExtension(extension) : [])], preferred: true, title: `Change to '${renamed}'` }],
				from: index,
				message: doc?.unavailable ? `${name}(): ${doc.unavailable}` : `${name}() only exists in WebGL 2 shaders, WebGL 1 uses ${renamed}().`,
				severity: 'error',
			});
			return true;
		}
		if (doc?.unavailable) {
			const fallback = ES1_FALLBACKS[name];
			const text = fallback && args.length === 1 && unit.isSimple(args[0]) ? fallback(unit.slice(args[0].start, args[0].end)) : null;
			const wrapped = text && name !== 'round' && !unit.fitsWithoutParens(call.start, call.end, 5) ? `(${text})` : text;
			this.report({
				code: 'es3-builtin',
				fixes: wrapped ? [{ edits: [this.replace(call.start, call.end, wrapped)], preferred: true, title: `Change to '${wrapped}'` }] : [],
				from: index,
				message: `${name}(): ${doc.unavailable}`,
				severity: 'error',
			});
			return true;
		}
		if (doc?.extension && !this.hasExtension(doc.extension)) {
			this.report({
				code: 'missing-extension',
				fixes: [{ edits: this.enableExtension(doc.extension), preferred: true, title: `Add '#extension ${doc.extension} : enable'` }],
				from: index,
				message: `${name}() needs '#extension ${doc.extension} : enable' at the top of the shader.`,
				severity: 'error',
			});
			return true;
		}
		return false;
	}

	private hasExtension(extension: string): boolean {
		return [this.unit, ...this.unit.shared].some((unit) => unit.tokens.some((token) => token.kind === 'directive' && new RegExp(`^#\\s*extension\\s+${extension}\\b`).test(token.text)));
	}

	/** Inserts the directive once, at the top of the buffer, a later "fix all" may repeat the edit so it is idempotent through `hasExtension`. */
	private enableExtension(extension: string): GlslTextEdit[] {
		return this.hasExtension(extension) ? [] : [{ end: 0, start: 0, text: `#extension ${extension} : enable\n` }];
	}

	private checkCall(index: number): void {
		const { unit } = this;
		const name = unit.text(index);
		const open = index + 1;
		const close = unit.match[open];
		const args = unit.callArgs(open);
		const call = { end: close + 1, start: index };
		if (unit.findFunctions(name).length > 0 || unit.isMacro(name)) return;
		if (this.checkAvailability(index, name, args, call)) return;
		/** The title shows the replacement itself when it is short enough to read in the quick fix menu. */
		const suggest = (code: string, message: string, text: string, title: string, severity: GlslSeverity = 'info', range: Range = call) => {
			const label = text.length <= 40 ? `Change to '${text}'` : title;
			this.report({ code, fixes: [{ edits: [this.replace(range.start, range.end, text)], preferred: true, title: label }], from: range.start, message, severity, to: range.end });
		};
		const argText = (i: number) => unit.slice(args[i].start, args[i].end);
		/** Index of the call to `callee` spanning the whole argument, -1 otherwise. */
		const nestedCall = (i: number, callee: string) => {
			const { end, start } = args[i] ?? { end: -1, start: -1 };
			return unit.text(start) === callee && unit.text(start + 1) === '(' && unit.match[start + 1] === end - 1 ? start : -1;
		};

		switch (name) {
			case 'pow': {
				if (args.length !== 2) return;
				const base = args[0];
				const exponent = unit.literalValue(args[1]);
				const baseText = argText(0);
				const product = (count: number) => {
					const text = Array.from({ length: count }, () => baseText).join(' * ');
					return unit.fitsWithoutParens(call.start, call.end, 5) ? text : `(${text})`;
				};
				if (unit.literalValue(base) === 2) suggest('pow-constant', 'pow(2.0, x) is exp2(x), a single hardware instruction.', `exp2(${argText(1)})`, 'Change to exp2()');
				else if (exponent === 1) suggest('pow-constant', 'pow(x, 1.0) is just x.', this.wrap(base), 'Replace with the base');
				else if ((exponent === 2 || exponent === 3) && unit.isSimple(base)) {
					suggest('pow-constant', `pow(x, ${exponent}.0) is slower than multiplying and undefined for negative x.`, product(exponent), `Change to ${Array(exponent).fill('x').join(' * ')}`);
				} else if (exponent === 0.5) suggest('pow-constant', 'pow(x, 0.5) is sqrt(x).', `sqrt(${baseText})`, 'Change to sqrt()');
				else if (exponent === -0.5) suggest('pow-constant', 'pow(x, -0.5) is inversesqrt(x), a single hardware instruction.', `inversesqrt(${baseText})`, 'Change to inversesqrt()');
				return;
			}
			case 'sqrt': {
				const dot = nestedCall(0, 'dot');
				if (args.length !== 1 || dot < 0) return;
				const [a, b] = unit.callArgs(dot + 1);
				if (a && b && unit.shape(a.start, a.end) === unit.shape(b.start, b.end)) {
					suggest('length', 'sqrt(dot(v, v)) is length(v).', `length(${unit.slice(a.start, a.end)})`, 'Change to length()');
				}
				return;
			}
			case 'length': {
				if (args.length !== 1) return;
				const minus = this.singleBinaryMinus(args[0]);
				if (minus < 0) return;
				suggest('distance', 'length(a - b) is distance(a, b).', `distance(${unit.slice(args[0].start, minus)}, ${unit.slice(minus + 1, args[0].end)})`, 'Change to distance()', 'hint');
				return;
			}
			case 'min':
			case 'max': {
				if (args.length !== 2) return;
				const inner = name === 'min' ? 'max' : 'min';
				const nested = [nestedCall(0, inner), nestedCall(1, inner)];
				const position = nested.findIndex((start) => start >= 0);
				if (position < 0) return;
				const innerArgs = unit.callArgs(nested[position] + 1);
				if (innerArgs.length !== 2) return;
				const outer = argText(1 - position);
				const [x, bound] = innerArgs.map(({ end, start }) => unit.slice(start, end));
				const [low, high] = name === 'min' ? [bound, outer] : [outer, bound];
				suggest('clamp', `${name}(${inner}(x, a), b) is clamp(x, a, b).`, `clamp(${x}, ${low}, ${high})`, 'Change to clamp()', 'hint');
				return;
			}
			case 'mod': {
				if (args.length === 2 && unit.literalValue(args[1]) === 1) suggest('fract', 'mod(x, 1.0) is fract(x).', `fract(${argText(0)})`, 'Change to fract()', 'hint');
				return;
			}
			case 'floor': {
				const minus = index - 1;
				if (args.length !== 1 || unit.text(minus) !== '-' || unit.isUnary(minus)) return;
				let start = minus - 1;
				while (unit.tokens[start]?.kind === 'ident' && unit.text(start - 1) === '.') start -= 2;
				const operand = { end: minus, start };
				if (start < 0 || !unit.isSimple(operand) || unit.shape(operand.start, operand.end) !== unit.shape(args[0].start, args[0].end)) return;
				if (!unit.fitsWithoutParens(start, call.end, 4)) return;
				suggest('fract', 'x - floor(x) is fract(x).', `fract(${argText(0)})`, 'Change to fract()', 'hint', { end: call.end, start });
				return;
			}
			case 'log': {
				const divisor = close + 2;
				if (args.length !== 1 || unit.text(close + 1) !== '/' || unit.text(divisor) !== 'log' || unit.text(divisor + 1) !== '(') return;
				const [base] = unit.callArgs(divisor + 1);
				const end = unit.match[divisor + 1] + 1;
				if (base && unit.literalValue(base) === 2 && unit.fitsWithoutParens(index, end, 5)) {
					suggest('log2', 'log(x) / log(2.0) is log2(x).', `log2(${argText(0)})`, 'Change to log2()', 'info', { end, start: index });
				}
				return;
			}
			case 'smoothstep': {
				if (args.length !== 3) return;
				const [edge0, edge1] = [unit.literalValue(args[0]), unit.literalValue(args[1])];
				if (edge0 === null || edge1 === null || edge0 < edge1) return;
				const flipped = `1.0 - smoothstep(${argText(1)}, ${argText(0)}, ${argText(2)})`;
				this.report({
					code: 'smoothstep-edges',
					fixes: edge0 > edge1 ? [{ edits: [this.replace(call.start, call.end, unit.fitsWithoutParens(call.start, call.end, 4) ? flipped : `(${flipped})`)], preferred: true, title: 'Change to 1.0 - smoothstep() with ordered edges' }] : [],
					from: args[0].start,
					message: 'smoothstep() needs edge0 smaller than edge1, otherwise some GPUs return garbage.',
					severity: 'warning',
					to: args[1].end,
				});
				return;
			}
		}

		if (IDEMPOTENT_FUNCTIONS.has(name) && args.length === 1 && nestedCall(0, name) >= 0) {
			suggest('idempotent-call', `${name}(${name}(x)) is ${name}(x).`, argText(0), `Remove the outer ${name}()`, 'hint');
			return;
		}
		this.checkConstructor(index, name, args, call);
	}

	/** Index of the only top-level binary `-` of the range when nothing else binds looser or as loose, -1 otherwise. */
	private singleBinaryMinus({ end, start }: Range): number {
		const { unit } = this;
		let minus = -1;
		for (let i = start + 1; i < end; i++) {
			const text = unit.text(i);
			if ((text === '(' || text === '[') && unit.match[i] > i) i = unit.match[i];
			else if (text === '?' || ((BINARY_PRECEDENCE[text] ?? 9) <= 4 && !unit.isUnary(i))) {
				if (text !== '-' || minus >= 0) return -1;
				minus = i;
			}
		}
		return minus;
	}

	private checkConstructor(index: number, name: string, args: Range[], call: Range): void {
		const { unit } = this;
		const vector = /^([ib]?)vec([234])$/.exec(name);
		const isScalar = name === 'float' || name === 'int' || name === 'bool';
		if (!vector && !isScalar) return;

		if (args.length === 1) {
			const literal = name === 'float' ? unit.literalValue(args[0]) : null;
			if (literal !== null && /^\d+$/.test(unit.text(args[0].end - 1))) {
				this.report({ code: 'redundant-constructor', fixes: [{ edits: [this.replace(call.start, call.end, formatFloat(literal))], preferred: true, title: `Change to '${formatFloat(literal)}'` }], from: call.start, message: `float(${unit.slice(args[0].start, args[0].end)}) is the literal ${formatFloat(literal)}.`, severity: 'hint', to: call.end });
				return;
			}
			if (unit.rangeType(args[0]) === name && unit.isAtomic(args[0])) {
				const text = unit.slice(args[0].start, args[0].end);
				this.report({ code: 'redundant-constructor', fixes: [{ edits: [this.replace(call.start, call.end, text)], preferred: true, title: `Replace with '${text}'` }], from: index, message: `'${text}' is already a ${name}, the constructor does nothing.`, severity: 'hint', to: index + 1, unnecessary: true });
			}
			return;
		}
		if (!vector) return;
		const size = Number(vector[2]);

		const shapes = args.map(({ end, start }) => unit.shape(start, end));
		if (args.length === size && shapes.every((shape) => shape === shapes[0]) && unit.isSimple(args[0])) {
			const text = `${name}(${unit.slice(args[0].start, args[0].end)})`;
			this.report({ code: 'splat-constructor', fixes: [{ edits: [this.replace(call.start, call.end, text)], preferred: true, title: `Change to '${text}'` }], from: call.start, message: `A single argument fills every component: ${text}.`, severity: 'hint', to: call.end });
			return;
		}

		/** `vec3(v.x, v.y, v.z)` → `v.xyz`, `vec2(p.y, p.x)` → `p.yx`. */
		let base: string | null = null;
		let swizzle = '';
		for (const { end, start } of args) {
			const member = unit.tokens[end - 1];
			if (end - start < 3 || unit.text(end - 2) !== '.' || member.kind !== 'ident' || !unit.isSimple({ end: end - 2, start })) return;
			const shape = unit.shape(start, end - 2);
			if (base !== null && shape !== base) return;
			base = shape;
			swizzle += member.text;
		}
		const set = SWIZZLE_SETS.find((candidate) => [...swizzle].every((char) => candidate.includes(char)));
		const first = args[0];
		const baseRange = { end: first.end - 2, start: first.start };
		const baseType = unit.rangeType(baseRange);
		const baseMatch = baseType ? /^([ib]?)vec([234])$/.exec(baseType) : null;
		if (!set || swizzle.length !== size || !baseMatch || baseMatch[1] !== vector[1] || [...swizzle].some((char) => set.indexOf(char) >= Number(baseMatch[2]))) return;
		const baseText = unit.slice(baseRange.start, baseRange.end);
		const text = Number(baseMatch[2]) === size && swizzle === set.slice(0, size) ? baseText : `${baseText}.${swizzle}`;
		this.report({ code: 'swizzle-constructor', fixes: [{ edits: [this.replace(call.start, call.end, text)], preferred: true, title: `Change to '${text}'` }], from: call.start, message: text === baseText ? `This constructor rebuilds '${baseText}' unchanged.` : `This constructor only reorders components of '${baseText}', the swizzle ${text} does it.`, severity: 'hint', to: call.end });
	}
}

/**
 * Lints one buffer: unused symbols, statements without effect, GLSL ES 1.00 pitfalls and simplifications, every finding carries its quick fixes.
 * `sharedSources` are buffers compiled in the same scope: Common for a pass buffer, every pass buffer for Common.
 * @example lintGlsl('void main() { float x = pow(uv.x, 2.0); }', []) // unused 'x', pow → uv.x * uv.x
 */
export function lintGlsl(source: string, sharedSources: readonly string[] = []): GlslDiagnostic[] {
	return new GlslLinter(source, sharedSources).run();
}

/**
 * Quick fixes for a compiler error on `line` (1-based): narrows the range to the reported token and suggests close names for an undeclared
 * identifier, or a declaration for a known engine uniform.
 * @example compilerDiagnostic(src, [], 4, "'uTiem' : undeclared identifier") // fix: Change to 'uTime'
 */
export function compilerDiagnostic(source: string, sharedSources: readonly string[], line: number, message: string): GlslDiagnostic {
	const unit = new GlslUnit(source, sharedSources.map((shared) => new GlslUnit(shared)));
	let lineStart = 0;
	for (let current = 1; current < line && lineStart >= 0; current++) lineStart = source.indexOf('\n', lineStart) + (lineStart >= 0 ? 1 : 0);
	const lineEnd = source.indexOf('\n', lineStart) < 0 ? source.length : source.indexOf('\n', lineStart);
	const diagnostic: GlslDiagnostic = { code: 'compiler', end: lineEnd, fixes: [], message, severity: 'error', start: lineStart };

	const subject = /^'([^']+)'/.exec(message)?.[1];
	const index = subject ? unit.tokens.findIndex((token) => token.start >= lineStart && token.end <= lineEnd && token.text === subject) : -1;
	if (index < 0) return diagnostic;
	diagnostic.start = unit.tokens[index].start;
	diagnostic.end = unit.tokens[index].end;
	if (!/undeclared identifier|no matching overloaded function/.test(message)) return diagnostic;

	const uniform = UNIFORM_DOCS[subject!];
	if (uniform) {
		const lastUniform = unit.declarations.filter((declaration) => declaration.kind === 'uniform').at(-1);
		const precision = unit.tokens.findIndex((token, i) => token.text === 'precision' && unit.isStatementStart(i));
		const anchor = lastUniform ? unit.tokens[lastUniform.statementEnd].end : precision >= 0 ? unit.tokens[unit.statementEnd(precision)].end : -1;
		diagnostic.fixes.push({
			edits: [anchor < 0 ? { end: 0, start: 0, text: `${uniform.signature};\n` } : { end: anchor, start: anchor, text: `\n${uniform.signature};` }],
			preferred: true,
			title: `Declare '${uniform.signature}'`,
		});
	}

	const isCall = unit.text(index + 1) === '(';
	const candidates = new Set<string>(isCall ? Object.keys(BUILTIN_DOCS).filter((name) => BUILTIN_DOCS[name].signature.includes('(') && !BUILTIN_DOCS[name].unavailable) : [...Object.keys(UNIFORM_DOCS), ...Object.keys(BUILTIN_DOCS)]);
	for (const shared of [unit, ...unit.shared]) {
		for (const fn of shared.functions) if (isCall) candidates.add(fn.name);
		for (const name of shared.structs.keys()) if (isCall) candidates.add(name);
		for (const name of shared.defines.keys()) candidates.add(name);
	}
	if (isCall) for (const type of BUILTIN_TYPES) candidates.add(type);
	else for (const declaration of unit.declarations) if (unit.resolveDeclaration(declaration.name, index) === declaration) candidates.add(declaration.name);
	if (!isCall) for (const declaration of unit.shared.flatMap((shared) => shared.declarations)) if (declaration.kind === 'global' || declaration.kind === 'uniform') candidates.add(declaration.name);

	const limit = subject!.length <= 4 ? 1 : 2;
	const suggestions = [...candidates]
		.map((name) => ({ distance: name.toLowerCase() === subject!.toLowerCase() ? 0 : editDistance(name, subject!), name }))
		.filter(({ distance, name }) => name !== subject && distance <= limit)
		.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
		.slice(0, 3);
	for (const { name } of suggestions) {
		diagnostic.fixes.push({ edits: [{ end: diagnostic.end, start: diagnostic.start, text: name }], preferred: !uniform && diagnostic.fixes.length === 0, title: `Change to '${name}'` });
	}
	return diagnostic;
}
