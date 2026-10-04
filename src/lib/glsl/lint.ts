import { stripComments } from '#lib/glsl/analyze.js';
import { BUILTIN_DOCS, UNIFORM_DOCS } from '#lib/glsl/builtins.js';
import { GLSL_TYPES } from '#lib/glsl/types.js';

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

type TokenKind = 'ident' | 'int' | 'float' | 'punct' | 'directive';

interface Token {
	kind: TokenKind;
	text: string;
	start: number;
	end: number;
}

interface FunctionInfo {
	name: string;
	returnType: string;
	/** Token indices: first header token (qualifiers included), name, `{` and `}` of the body. */
	start: number;
	nameIndex: number;
	bodyOpen: number;
	bodyClose: number;
	params: Declaration[];
}

interface Declaration {
	name: string;
	type: string;
	kind: 'local' | 'global' | 'uniform' | 'param';
	qualifier: string | null;
	isArray: boolean;
	nameIndex: number;
	fn: FunctionInfo | null;
	/** Token index closing the enclosing block, the token count for globals. */
	scopeEnd: number;
	/** Token indices of the whole statement (`;` included) and of this declarator alone (`end` exclusive). */
	statementStart: number;
	statementEnd: number;
	declaratorStart: number;
	declaratorEnd: number;
	initStart: number;
	initEnd: number;
	siblings: Declaration[];
}

interface Range {
	start: number;
	end: number;
}

/** One GLSL ES 1.00 lexical token per match, whitespace is skipped by the global flag. */
const TOKEN_RE = /(#(?:[^\n\\]|\\[^])*)|([A-Za-z_]\w*)|((?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?[fF]?|\d+(?:[eE][+-]?\d+)?[fF]|\d+[eE][+-]?\d+)|(0[xX][\dA-Fa-f]+[uU]?|\d+[uU]?)|(<<=|>>=|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[-+*/%&|^]=|\S)/g;

const BUILTIN_TYPES = new Set(GLSL_TYPES);
const DECLARATION_QUALIFIERS = new Set(['const', 'uniform', 'varying', 'attribute', 'highp', 'mediump', 'lowp', 'invariant']);
const STORAGE_QUALIFIERS = new Set(['const', 'uniform', 'varying', 'attribute']);
const PARAM_QUALIFIERS = new Set(['in', 'out', 'inout', 'const', 'highp', 'mediump', 'lowp']);
const STATEMENT_KEYWORDS = new Set([
	'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'discard', 'struct', 'precision',
	...DECLARATION_QUALIFIERS,
]);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^=']);
const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
	'*': 5, '/': 5, '%': 5, '+': 4, '-': 4, '<': 3, '>': 3, '<=': 3, '>=': 3, '==': 2, '!=': 2, '&&': 1, '^^': 1, '||': 1,
};
/** Tokens after which an expression starts fresh, any replacement fits without parentheses. */
const OPEN_CONTEXT = new Set(['(', '[', ',', ';', '{', '}', '?', ':', 'return', ...ASSIGN_OPS]);
const CLOSE_CONTEXT = new Set([')', ']', ',', ';', '?', ':']);
const IDEMPOTENT_FUNCTIONS = new Set(['abs', 'sign', 'floor', 'ceil', 'fract', 'normalize']);
const SWIZZLE_SETS = ['xyzw', 'rgba', 'stpq'] as const;
const FLOAT_PARAM_TYPE_RE = /^(?:genType|float|vecN|vec[234]|matN|mat[234])$/;

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

/**
 * Token-level model of one GLSL buffer: functions, scoped declarations, structs and macros.
 * `shared` units are compiled in the same scope (the Common buffer is prepended to every pass, every pass uses Common).
 */
class GlslUnit {
	readonly clean: string;
	readonly tokens: Token[] = [];
	/** Index of the matching bracket for every `(`, `)`, `[`, `]`, `{`, `}`, -1 otherwise. */
	readonly match: Int32Array;
	readonly functions: FunctionInfo[] = [];
	readonly declarations: Declaration[] = [];
	readonly structs = new Map<string, Map<string, string>>();
	readonly defines = new Set<string>();
	readonly declarationStarts = new Set<number>();
	private purityCache: Map<string, boolean> | null = null;

	constructor(readonly source: string, readonly shared: readonly GlslUnit[] = []) {
		this.clean = stripComments(source);
		for (const match of this.clean.matchAll(TOKEN_RE)) {
			const kind: TokenKind = match[1] ? 'directive' : match[2] ? 'ident' : match[3] ? 'float' : match[4] ? 'int' : 'punct';
			this.tokens.push({ end: match.index + match[0].length, kind, start: match.index, text: match[0] });
			if (kind === 'directive') {
				const name = /^#\s*define\s+(\w+)/.exec(match[0])?.[1];
				if (name) this.defines.add(name);
			}
		}
		this.match = new Int32Array(this.tokens.length).fill(-1);
		const stack: number[] = [];
		for (let i = 0; i < this.tokens.length; i++) {
			const text = this.tokens[i].text;
			if (text === '(' || text === '[' || text === '{') stack.push(i);
			else if ((text === ')' || text === ']' || text === '}') && stack.length > 0) {
				const open = stack.pop()!;
				this.match[open] = i;
				this.match[i] = open;
			}
		}
		this.scan();
	}

	text(index: number): string {
		return this.tokens[index]?.text ?? '';
	}

	/** Source text of the token range, comments and spacing kept. */
	slice(start: number, end: number): string {
		return this.source.slice(this.tokens[start].start, this.tokens[end - 1].end);
	}

	/** Whitespace-insensitive text of the token range, used to compare expressions. */
	shape(start: number, end: number): string {
		return this.tokens.slice(start, end).map((token) => token.text).join(' ');
	}

	isType(name: string): boolean {
		return BUILTIN_TYPES.has(name) || this.findStruct(name) !== null;
	}

	findStruct(name: string): Map<string, string> | null {
		return this.structs.get(name) ?? this.shared.find((unit) => unit.structs.has(name))?.structs.get(name) ?? null;
	}

	/** User functions with that name across this unit and the shared ones, overloads included. */
	findFunctions(name: string): { fn: FunctionInfo; unit: GlslUnit }[] {
		return [this, ...this.shared].flatMap((unit) => unit.functions.filter((fn) => fn.name === name).map((fn) => ({ fn, unit })));
	}

	isStatementStart(index: number): boolean {
		const previous = this.tokens[index - 1];
		if (!previous || previous.kind === 'directive' || previous.text === ';' || previous.text === '{' || previous.text === '}' || previous.text === 'else') return true;
		if (previous.text === ')') {
			const keyword = this.text(this.match[index - 1] - 1);
			return keyword === 'if' || keyword === 'while' || keyword === 'for';
		}
		return previous.text === '(' && this.text(index - 2) === 'for';
	}

	/** True when the statement starting at `index` is the unbraced body of `if`, `else`, `for` or `while`, removing it would leave the keyword dangling. */
	isControlBody(index: number): boolean {
		const previous = this.tokens[index - 1];
		return previous?.text === 'else' || (previous?.text === ')' && this.isStatementStart(index));
	}

	isUnary(index: number): boolean {
		const text = this.text(index);
		if (text !== '-' && text !== '+') return false;
		const previous = this.tokens[index - 1];
		return !previous || previous.text === 'return' || (previous.kind === 'punct' && previous.text !== ')' && previous.text !== ']');
	}

	/** Index after the expression starting at `index`, stopping at a top-level `,`, `;` or closing bracket. */
	expressionEnd(index: number): number {
		let i = index;
		while (i < this.tokens.length) {
			const text = this.text(i);
			if ((text === '(' || text === '[') && this.match[i] > i) i = this.match[i] + 1;
			else if (text === ',' || text === ';' || text === ')' || text === ']' || text === '{' || text === '}') return i;
			else i++;
		}
		return i;
	}

	/** Index of the `;` ending the statement starting at `index`, -1 when it is not a plain statement. */
	statementEnd(index: number): number {
		let i = index;
		while (i < this.tokens.length) {
			const text = this.text(i);
			if ((text === '(' || text === '[') && this.match[i] > i) i = this.match[i] + 1;
			else if (text === ';') return i;
			else if (text === '{' || text === '}' || text === ')' || text === ']' || this.tokens[i].kind === 'directive') return -1;
			else i++;
		}
		return -1;
	}

	/** Splits the argument list of the call whose `(` is at `open` into token ranges. */
	callArgs(open: number): Range[] {
		const close = this.match[open];
		if (close < 0 || close === open + 1) return [];
		const args: Range[] = [];
		let start = open + 1;
		for (let i = start; i < close; i++) {
			const text = this.text(i);
			if ((text === '(' || text === '[') && this.match[i] > i) i = this.match[i];
			else if (text === ',') {
				args.push({ end: i, start });
				start = i + 1;
			}
		}
		args.push({ end: close, start });
		return args;
	}

	/** Identifier or member chain (`p`, `light.color.rgb`), cheap and side-effect free to repeat. */
	isSimple({ end, start }: Range): boolean {
		if (end - start === 1) return this.tokens[start].kind !== 'punct';
		if (this.tokens[start].kind !== 'ident') return false;
		for (let i = start + 1; i < end; i += 2) {
			if (this.text(i) !== '.' || this.tokens[i + 1]?.kind !== 'ident' || i + 1 >= end) return false;
		}
		return true;
	}

	/** Expression that never needs parentheses: a simple chain, a call or a parenthesized group, members included. */
	isAtomic(range: Range): boolean {
		if (this.isSimple(range)) return true;
		let i = range.start;
		if (this.tokens[i].kind === 'ident' && this.text(i + 1) === '(') i++;
		if (this.text(i) !== '(' || this.match[i] < 0) return false;
		for (let j = this.match[i] + 1; j < range.end; j += 2) {
			if (this.text(j) !== '.' || this.tokens[j + 1]?.kind !== 'ident') return false;
		}
		return true;
	}

	/** Numeric value of a literal argument, a leading unary minus included. */
	literalValue({ end, start }: Range): number | null {
		const negative = this.text(start) === '-' && end - start === 2;
		const token = this.tokens[negative ? start + 1 : start];
		if ((!negative && end - start !== 1) || (token.kind !== 'int' && token.kind !== 'float') || /^0[xX]/.test(token.text)) return null;
		const value = Number.parseFloat(token.text);
		return negative ? -value : value;
	}

	/** Whether a replacement whose top operator has precedence `precedence` can take the place of tokens [start, end) without parentheses. */
	fitsWithoutParens(start: number, end: number, precedence: number): boolean {
		const previous = this.tokens[start - 1];
		const next = this.tokens[end];
		const previousOk = !previous || OPEN_CONTEXT.has(previous.text) || previous.kind === 'directive'
			|| (!this.isUnary(start - 1) && BINARY_PRECEDENCE[previous.text] !== undefined
				&& (BINARY_PRECEDENCE[previous.text] < precedence || (BINARY_PRECEDENCE[previous.text] === precedence && (previous.text === '+' || previous.text === '*'))));
		const nextOk = !next || CLOSE_CONTEXT.has(next.text) || ASSIGN_OPS.has(next.text) || (BINARY_PRECEDENCE[next.text] ?? 99) <= precedence;
		return previousOk && nextOk;
	}

	private scan(): void {
		let blockEnds: number[] = [];
		let fn: FunctionInfo | null = null;
		for (let i = 0; i < this.tokens.length; i++) {
			const text = this.text(i);
			if (text === '{') {
				blockEnds.push(this.match[i] < 0 ? this.tokens.length : this.match[i]);
				continue;
			}
			if (text === '}') {
				blockEnds.pop();
				if (fn && i === fn.bodyClose) fn = null;
				continue;
			}
			if (text === 'struct') {
				i = this.scanStruct(i);
				continue;
			}
			if (!this.isStatementStart(i) || this.tokens[i].kind !== 'ident') continue;
			if (blockEnds.length === 0) {
				const parsed = this.parseFunction(i);
				if (parsed) {
					this.functions.push(parsed);
					this.declarations.push(...parsed.params);
					fn = parsed;
					blockEnds = [parsed.bodyClose];
					i = parsed.bodyOpen;
					continue;
				}
			}
			const end = this.parseDeclaration(i, fn, blockEnds.at(-1) ?? this.tokens.length);
			if (end > i) i = end;
		}
	}

	/** Registers `struct Name { fields }` and returns the index of its closing brace. */
	private scanStruct(index: number): number {
		const name = this.tokens[index + 1]?.kind === 'ident' ? this.text(index + 1) : null;
		const open = name ? index + 2 : index + 1;
		if (this.text(open) !== '{' || this.match[open] < 0) return index;
		const fields = new Map<string, string>();
		let type: string | null = null;
		for (let i = open + 1; i < this.match[open]; i++) {
			const token = this.tokens[i];
			if (token.text === ';') type = null;
			else if (token.kind === 'ident' && !DECLARATION_QUALIFIERS.has(token.text)) {
				if (type === null) type = token.text;
				else fields.set(token.text, type);
			} else if (token.text === '[' && this.match[i] > i) i = this.match[i];
		}
		if (name) this.structs.set(name, fields);
		return this.match[open];
	}

	private parseFunction(index: number): FunctionInfo | null {
		let i = index;
		while (DECLARATION_QUALIFIERS.has(this.text(i))) i++;
		const returnType = this.tokens[i];
		const name = this.tokens[i + 1];
		if (returnType?.kind !== 'ident' || name?.kind !== 'ident' || this.text(i + 2) !== '(') return null;
		if (!this.isType(returnType.text) && returnType.text !== 'void') return null;
		const close = this.match[i + 2];
		if (close < 0 || this.text(close + 1) !== '{' || this.match[close + 1] < 0) return null;
		const fn: FunctionInfo = {
			bodyClose: this.match[close + 1],
			bodyOpen: close + 1,
			name: name.text,
			nameIndex: i + 1,
			params: [],
			returnType: returnType.text,
			start: index,
		};
		for (const arg of this.callArgs(i + 2)) {
			let j = arg.start;
			let qualifier: string | null = null;
			while (j < arg.end && PARAM_QUALIFIERS.has(this.text(j))) {
				if (this.text(j) === 'out' || this.text(j) === 'inout') qualifier = this.text(j);
				j++;
			}
			if (j + 1 >= arg.end || this.tokens[j + 1].kind !== 'ident') continue;
			fn.params.push({
				declaratorEnd: arg.end,
				declaratorStart: arg.start,
				fn,
				initEnd: -1,
				initStart: -1,
				isArray: this.text(j + 2) === '[',
				kind: 'param',
				name: this.text(j + 1),
				nameIndex: j + 1,
				qualifier,
				scopeEnd: fn.bodyClose,
				siblings: [],
				statementEnd: arg.end,
				statementStart: arg.start,
				type: this.text(j),
			});
		}
		return fn;
	}

	/** Parses `[qualifiers] type name [= init] (, name [= init])* ;` and returns the index of its `;`, or `index` when it is not a declaration. */
	private parseDeclaration(index: number, fn: FunctionInfo | null, scopeEnd: number): number {
		let i = index;
		let qualifier: string | null = null;
		while (DECLARATION_QUALIFIERS.has(this.text(i))) {
			if (STORAGE_QUALIFIERS.has(this.text(i))) qualifier = this.text(i);
			i++;
		}
		const type = this.tokens[i];
		if (type?.kind !== 'ident' || !this.isType(type.text) || this.tokens[i + 1]?.kind !== 'ident' || this.text(i + 2) === '(') return index;
		const group: Declaration[] = [];
		let j = i + 1;
		while (true) {
			if (this.tokens[j]?.kind !== 'ident') return index;
			const declaratorStart = j;
			let k = j + 1;
			const isArray = this.text(k) === '[' && this.match[k] > k;
			if (isArray) k = this.match[k] + 1;
			let initStart = -1;
			let initEnd = -1;
			if (this.text(k) === '=') {
				initStart = k + 1;
				k = initEnd = this.expressionEnd(k + 1);
			}
			const kind = fn ? 'local' : qualifier === 'uniform' ? 'uniform' : 'global';
			if (qualifier !== 'varying' && qualifier !== 'attribute') {
				group.push({
					declaratorEnd: k,
					declaratorStart,
					fn,
					initEnd,
					initStart,
					isArray,
					kind,
					name: this.text(j),
					nameIndex: j,
					qualifier,
					scopeEnd,
					siblings: group,
					statementEnd: -1,
					statementStart: index,
					type: type.text,
				});
			}
			if (this.text(k) === ',') {
				j = k + 1;
				continue;
			}
			if (this.text(k) !== ';') return index;
			for (const declaration of group) declaration.statementEnd = k;
			this.declarations.push(...group);
			this.declarationStarts.add(index);
			return k;
		}
	}

	enclosingFunction(index: number): FunctionInfo | null {
		return this.functions.find((fn) => index > fn.bodyOpen && index < fn.bodyClose) ?? null;
	}

	/** Innermost declaration of `name` visible at token `index`, shared globals last. */
	resolveDeclaration(name: string, index: number): Declaration | null {
		let best: Declaration | null = null;
		for (const declaration of this.declarations) {
			if (declaration.name !== name) continue;
			const visible = declaration.kind === 'param'
				? index > declaration.fn!.bodyOpen && index < declaration.scopeEnd
				: declaration.nameIndex <= index && index <= declaration.scopeEnd;
			if (visible && (!best || declaration.nameIndex > best.nameIndex)) best = declaration;
		}
		if (best) return best;
		for (const unit of this.shared) {
			const global = unit.declarations.find((declaration) => declaration.name === name && (declaration.kind === 'global' || declaration.kind === 'uniform'));
			if (global) return global;
		}
		return null;
	}

	identifierType(name: string, index: number): string | null {
		const declaration = this.resolveDeclaration(name, index);
		if (declaration) return declaration.isArray ? null : declaration.type;
		const signature = BUILTIN_DOCS[name]?.signature;
		return signature && !signature.includes('(') ? signature.split(/\s+/)[0] : null;
	}

	callType(name: string): string | null {
		if (this.isType(name)) return name;
		const user = this.findFunctions(name);
		if (user.length > 0) return user.every(({ fn }) => fn.returnType === user[0].fn.returnType) ? user[0].fn.returnType : null;
		return BUILTIN_DOCS[name]?.signature.match(/^(\w+)/)?.[1] ?? null;
	}

	memberType(type: string | null, member: string): string | null {
		if (!type) return null;
		const struct = this.findStruct(type);
		if (struct) return struct.get(member) ?? null;
		const vector = /^([ib]?)vec([234])$/.exec(type) ?? (type === 'genType' ? ['', '', '4'] : null);
		if (!vector || member.length > 4 || !SWIZZLE_SETS.some((set) => [...member].every((char) => set.slice(0, Number(vector[2])).includes(char)))) return null;
		const scalar = vector[1] === 'i' ? 'int' : vector[1] === 'b' ? 'bool' : 'float';
		return member.length === 1 ? scalar : `${vector[1]}vec${member.length}`;
	}

	/** Type of the operand ending at token `index`. */
	typeBefore(index: number): string | null {
		const token = this.tokens[index];
		if (!token) return null;
		if (token.kind === 'float') return 'float';
		if (token.kind === 'int') return 'int';
		if (token.text === ')') {
			const callee = this.tokens[this.match[index] - 1];
			return callee?.kind === 'ident' && !STATEMENT_KEYWORDS.has(callee.text) ? this.callType(callee.text) : null;
		}
		if (token.kind !== 'ident') return null;
		if (this.text(index - 1) === '.') return this.memberType(this.typeBefore(index - 2), token.text);
		return this.identifierType(token.text, index);
	}

	/** Type and end of the operand starting at token `index`. */
	typeAfter(index: number): { type: string | null; end: number } {
		const token = this.tokens[index];
		if (!token) return { end: index, type: null };
		if (this.isUnary(index)) return this.typeAfter(index + 1);
		if (token.kind === 'float') return { end: index + 1, type: 'float' };
		if (token.kind === 'int') return { end: index + 1, type: /[uU]$/.test(token.text) ? 'uint' : 'int' };
		if (token.kind !== 'ident') return { end: index, type: null };
		const isCall = this.text(index + 1) === '(' && this.match[index + 1] > index;
		let type = isCall ? this.callType(token.text) : this.identifierType(token.text, index);
		let end = isCall ? this.match[index + 1] + 1 : index + 1;
		while (this.text(end) === '.' && this.tokens[end + 1]?.kind === 'ident') {
			type = this.memberType(type, this.text(end + 1));
			end += 2;
		}
		return this.text(end) === '[' ? { end, type: null } : { end, type };
	}

	/** Type of the expression spanning exactly `range`, null unless it is a single operand. */
	rangeType(range: Range): string | null {
		if (this.isSimple(range) && this.tokens[range.start].kind === 'ident') {
			let type = this.identifierType(this.text(range.start), range.start);
			for (let i = range.start + 2; i < range.end; i += 2) type = this.memberType(type, this.text(i));
			return type;
		}
		const { end, type } = this.typeAfter(range.start);
		return end === range.end ? type : null;
	}

	/** Pure functions have no out parameters, never discard and only write their own locals, so a discarded call does nothing. */
	isPureFunction(name: string): boolean {
		const user = this.findFunctions(name);
		return user.length > 0 && user.every(({ fn, unit }) => unit.purity().get(fn.name) !== false);
	}

	private purity(): Map<string, boolean> {
		if (this.purityCache) return this.purityCache;
		const purity = new Map<string, boolean>();
		const calls = new Map<string, Set<string>>();
		for (const fn of this.functions) {
			let pure = purity.get(fn.name) !== false && !fn.params.some((param) => param.qualifier !== null);
			const callees = calls.get(fn.name) ?? new Set<string>();
			for (let i = fn.bodyOpen + 1; pure && i < fn.bodyClose; i++) {
				const token = this.tokens[i];
				if (token.text === 'discard') pure = false;
				else if (ASSIGN_OPS.has(token.text) || token.text === '++' || token.text === '--') {
					const target = this.assignmentTarget(i);
					const declaration = target === null ? null : this.resolveDeclaration(this.text(target), target);
					pure = declaration?.fn === fn;
				} else if (token.kind === 'ident' && this.text(i + 1) === '(') {
					if (this.findFunctions(token.text).length > 0) callees.add(token.text);
					else if (!this.isType(token.text) && !BUILTIN_DOCS[token.text]) pure = false;
				}
			}
			purity.set(fn.name, pure);
			calls.set(fn.name, callees);
		}
		this.purityCache = purity;
		for (let changed = true; changed;) {
			changed = false;
			for (const [name, callees] of calls) {
				if (purity.get(name) && [...callees].some((callee) => (purity.has(callee) ? !purity.get(callee) : !this.isPureFunction(callee)))) {
					purity.set(name, false);
					changed = true;
				}
			}
		}
		return purity;
	}

	/** Root identifier written by the assignment or increment operator at `index`. */
	assignmentTarget(index: number): number | null {
		if ((this.text(index) === '++' || this.text(index) === '--') && this.tokens[index + 1]?.kind === 'ident') return index + 1;
		let i = index - 1;
		while (i >= 0) {
			const text = this.text(i);
			if (text === ']' && this.match[i] >= 0) i = this.match[i] - 1;
			else if (this.tokens[i].kind === 'ident' && this.text(i - 1) === '.') i -= 2;
			else return this.tokens[i].kind === 'ident' ? i : null;
		}
		return null;
	}

	/** No assignment, increment, discard or impure/unknown call in [start, end). */
	isPure(start: number, end: number): boolean {
		for (let i = start; i < end; i++) {
			const token = this.tokens[i];
			if (ASSIGN_OPS.has(token.text) || token.text === '++' || token.text === '--' || token.text === 'discard') return false;
			if (token.kind !== 'ident') continue;
			if (this.defines.has(token.text) || this.shared.some((unit) => unit.defines.has(token.text))) return false;
			if (this.text(i + 1) === '(' && !this.isType(token.text) && !(BUILTIN_DOCS[token.text] && this.findFunctions(token.text).length === 0) && !this.isPureFunction(token.text)) return false;
		}
		return true;
	}
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
				message: `GLSL ES 1.00 (WebGL 1) doesn't accept the 'f' suffix on float literals.`,
				severity: 'error',
			});
			return;
		}
		if (/[uU]$/.test(text)) {
			this.report({
				code: 'uint-literal',
				fixes: [{ edits: [this.replace(index, index + 1, text.slice(0, -1))], preferred: true, title: `Remove the 'u' suffix` }],
				from: index,
				message: `GLSL ES 1.00 (WebGL 1) has no unsigned integers.`,
				severity: 'error',
			});
			return;
		}
		if (/^\d+$/.test(text) && this.intNeedsFloat(index)) {
			this.report({
				code: 'int-to-float',
				fixes: [{ edits: [this.replace(index, index + 1, `${text}.0`)], preferred: true, title: `Change to '${text}.0'` }],
				from: index,
				message: `GLSL ES 1.00 never converts int to float implicitly, write '${text}.0'.`,
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

	private checkCall(index: number): void {
		const { unit } = this;
		const name = unit.text(index);
		const open = index + 1;
		const close = unit.match[open];
		const args = unit.callArgs(open);
		const call = { end: close + 1, start: index };
		if (unit.findFunctions(name).length > 0) return;
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
			case 'texture':
			case 'round': {
				if (name === 'texture' && args.length >= 2) {
					const replacement = unit.rangeType(args[0]) === 'samplerCube' ? 'textureCube' : 'texture2D';
					suggest('es3-builtin', `texture() needs GLSL ES 3.00, WebGL 1 uses ${replacement}().`, replacement, `Change to '${replacement}'`, 'error', { end: index + 1, start: index });
				} else if (name === 'round' && args.length === 1) {
					suggest('es3-builtin', 'round() needs GLSL ES 3.00, WebGL 1 has floor(x + 0.5).', `floor(${argText(0)} + 0.5)`, 'Change to floor(x + 0.5)', 'error');
				}
				return;
			}
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
					message: 'smoothstep() is undefined when edge0 >= edge1, some GPUs return garbage.',
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
			if (literal !== null && unit.tokens[args[0].end - 1].kind === 'int' && unit.tokens[args[0].end - 1].text.match(/^\d+$/)) {
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
	const candidates = new Set<string>(isCall ? Object.keys(BUILTIN_DOCS).filter((name) => BUILTIN_DOCS[name].signature.includes('(')) : [...Object.keys(UNIFORM_DOCS), ...Object.keys(BUILTIN_DOCS)]);
	for (const shared of [unit, ...unit.shared]) {
		for (const fn of shared.functions) if (isCall) candidates.add(fn.name);
		for (const name of shared.structs.keys()) if (isCall) candidates.add(name);
		for (const name of shared.defines) candidates.add(name);
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
