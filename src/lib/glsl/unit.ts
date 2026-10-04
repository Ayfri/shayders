import type { editor } from 'monaco-editor/editor';
import { BUILTIN_DOCS } from '#lib/glsl/builtins.js';
import { GLSL_TYPES } from '#lib/glsl/types.js';

export type TokenKind = 'ident' | 'int' | 'float' | 'punct' | 'directive';

export interface Token {
	kind: TokenKind;
	text: string;
	start: number;
	end: number;
}

/** Token range, `end` exclusive. */
export interface Range {
	start: number;
	end: number;
}

export interface FunctionInfo {
	name: string;
	returnType: string;
	/** Token indices: first header token (qualifiers included), name, `(`, `)`, `{` and `}` of the body. */
	start: number;
	nameIndex: number;
	paramsOpen: number;
	paramsClose: number;
	bodyOpen: number;
	bodyClose: number;
	params: Declaration[];
}

export interface Declaration {
	name: string;
	type: string;
	kind: 'local' | 'global' | 'uniform' | 'param';
	/** Storage qualifier (`const`, `uniform`) or parameter direction (`out`, `inout`). */
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

export interface StructInfo {
	name: string;
	/** Token indices of `struct` and of the name. */
	start: number;
	nameIndex: number;
	fields: Map<string, { type: string; nameIndex: number }>;
}

export interface MacroInfo {
	name: string;
	/** Parameter names of a function-like macro, null for an object-like one. */
	params: string[] | null;
	value: string;
	tokenIndex: number;
	/** Source offset of the macro name. */
	nameStart: number;
}

/** One GLSL ES 1.00 lexical token per match, whitespace is skipped by the global flag. */
const TOKEN_RE = /(#(?:[^\n\\]|\\[^])*)|([A-Za-z_]\w*)|((?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?[fF]?|\d+(?:[eE][+-]?\d+)?[fF]|\d+[eE][+-]?\d+)|(0[xX][\dA-Fa-f]+[uU]?|\d+[uU]?)|(<<=|>>=|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[-+*/%&|^]=|\S)/g;
const DEFINE_RE = /^#\s*define\s+(\w+)(\([^)]*\))?\s*([\s\S]*)$/;
const COMMENT_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

export const BUILTIN_TYPES = new Set(GLSL_TYPES);
export const DECLARATION_QUALIFIERS = new Set(['const', 'uniform', 'varying', 'attribute', 'highp', 'mediump', 'lowp', 'invariant']);
const STORAGE_QUALIFIERS = new Set(['const', 'uniform', 'varying', 'attribute']);
export const PARAM_QUALIFIERS = new Set(['in', 'out', 'inout', 'const', 'highp', 'mediump', 'lowp']);
export const STATEMENT_KEYWORDS = new Set([
	'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'discard', 'struct', 'precision',
	...DECLARATION_QUALIFIERS,
]);
export const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^=']);
export const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
	'*': 5, '/': 5, '%': 5, '+': 4, '-': 4, '<': 3, '>': 3, '<=': 3, '>=': 3, '==': 2, '!=': 2, '&&': 1, '^^': 1, '||': 1,
};
/** Tokens after which an expression starts fresh, any replacement fits without parentheses. */
const OPEN_CONTEXT = new Set(['(', '[', ',', ';', '{', '}', '?', ':', 'return', ...ASSIGN_OPS]);
const CLOSE_CONTEXT = new Set([')', ']', ',', ';', '?', ':']);
export const SWIZZLE_SETS = ['xyzw', 'rgba', 'stpq'] as const;

/** Blanks out comments with spaces of the same length, offsets and line numbers stay valid. */
export function stripComments(source: string): string {
	return source.replace(COMMENT_RE, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** Comment markers removed, lines joined with a markdown line break. */
function commentText(comments: string[]): string | null {
	const lines = comments
		.flatMap((comment) => comment.replace(/^\/\*\*?|\*\/$/g, '').replace(/^\/\/\/?/, '').split('\n'))
		.map((line) => line.replace(/^\s*\*?\s?/, '').trimEnd());
	const text = lines.join('\n').trim();
	return text ? text.replace(/\n/g, '  \n') : null;
}

/**
 * Token-level model of one GLSL buffer: functions, scoped declarations, structs, macros and their doc comments.
 * `shared` units are compiled in the same scope (the Common buffer is prepended to every pass, every pass uses Common).
 */
export class GlslUnit {
	readonly clean: string;
	readonly tokens: Token[] = [];
	/** Index of the matching bracket for every `(`, `)`, `[`, `]`, `{`, `}`, -1 otherwise. */
	readonly match: Int32Array;
	readonly functions: FunctionInfo[] = [];
	readonly declarations: Declaration[] = [];
	readonly structs = new Map<string, StructInfo>();
	readonly defines = new Map<string, MacroInfo>();
	readonly declarationStarts = new Set<number>();
	/** Name indexes, scope resolution runs for every identifier of the lint pass. */
	private readonly declarationsByName = new Map<string, Declaration[]>();
	private readonly functionsByName = new Map<string, FunctionInfo[]>();
	private readonly lineStarts: number[] = [0];
	private purityCache: Map<string, boolean> | null = null;

	constructor(readonly source: string, readonly shared: readonly GlslUnit[] = []) {
		this.clean = stripComments(source);
		for (let i = source.indexOf('\n'); i >= 0; i = source.indexOf('\n', i + 1)) this.lineStarts.push(i + 1);
		for (const match of this.clean.matchAll(TOKEN_RE)) {
			const kind: TokenKind = match[1] ? 'directive' : match[2] ? 'ident' : match[3] ? 'float' : match[4] ? 'int' : 'punct';
			this.tokens.push({ end: match.index + match[0].length, kind, start: match.index, text: match[0] });
			const define = kind === 'directive' ? DEFINE_RE.exec(match[0]) : null;
			if (define) {
				this.defines.set(define[1], {
					name: define[1],
					nameStart: match.index + match[0].indexOf(define[1], match[0].indexOf('define') + 6),
					params: define[2] ? define[2].slice(1, -1).split(',').map((param) => param.trim()).filter(Boolean) : null,
					tokenIndex: this.tokens.length - 1,
					value: define[3].replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim(),
				});
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
		for (const declaration of this.declarations) this.declarationsByName.set(declaration.name, [...(this.declarationsByName.get(declaration.name) ?? []), declaration]);
		for (const fn of this.functions) this.functionsByName.set(fn.name, [...(this.functionsByName.get(fn.name) ?? []), fn]);
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

	/** 1-based line and column of a source offset. */
	position(offset: number): { line: number; column: number } {
		let low = 0;
		let high = this.lineStarts.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if (this.lineStarts[middle] <= offset) low = middle;
			else high = middle - 1;
		}
		return { column: offset - this.lineStarts[low] + 1, line: low + 1 };
	}

	/** Index of the token touching `offset` (its end included, so the cursor right after a word still finds it), -1 between tokens. */
	tokenAt(offset: number): number {
		let low = 0;
		let high = this.tokens.length - 1;
		while (low <= high) {
			const middle = (low + high) >> 1;
			const token = this.tokens[middle];
			if (offset < token.start) high = middle - 1;
			else if (offset > token.end) low = middle + 1;
			else return middle;
		}
		return -1;
	}

	/**
	 * Comment documenting the construct spanning tokens [first, last]: the comment block right above it (no blank line in between),
	 * else a trailing comment on the line of `last`.
	 * @example `/** Signed distance to a box. *\/` above `float sdBox(…)` gives "Signed distance to a box."
	 */
	comment(first: number, last: number): string | null {
		const gapStart = this.tokens[first - 1]?.end ?? 0;
		const gap = this.source.slice(gapStart, this.tokens[first].start);
		const leading: string[] = [];
		let cursor = gap.length;
		for (const match of [...gap.matchAll(COMMENT_RE)].reverse()) {
			const between = gap.slice(match.index + match[0].length, cursor);
			if (/\n[ \t]*\n/.test(between) || (first > 0 && !gap.slice(0, match.index).includes('\n'))) break;
			leading.unshift(match[0]);
			cursor = match.index;
		}
		if (leading.length > 0) return commentText(leading);
		const token = this.tokens[last];
		const lineEnd = this.source.indexOf('\n', token.start);
		const rest = this.source.slice(token.kind === 'directive' ? token.start : token.end, lineEnd < 0 ? this.source.length : lineEnd);
		const trailing = (token.kind === 'directive' ? /(\/\/[^\n]*|\/\*.*?\*\/)/ : /^[ \t;,{]*(\/\/[^\n]*|\/\*.*?\*\/)/).exec(rest);
		return trailing ? commentText([trailing[1]]) : null;
	}

	isType(name: string): boolean {
		return BUILTIN_TYPES.has(name) || this.findStruct(name) !== null;
	}

	findStruct(name: string): StructInfo | null {
		return this.structs.get(name) ?? this.shared.find((unit) => unit.structs.has(name))?.structs.get(name) ?? null;
	}

	/** User functions with that name across this unit and the shared ones, overloads included. */
	findFunctions(name: string): { fn: FunctionInfo; unit: GlslUnit }[] {
		return [this, ...this.shared].flatMap((unit) => (unit.functionsByName.get(name) ?? []).map((fn) => ({ fn, unit })));
	}

	isMacro(name: string): boolean {
		return this.defines.has(name) || this.shared.some((unit) => unit.defines.has(name));
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
		const named = this.tokens[index + 1]?.kind === 'ident';
		const open = named ? index + 2 : index + 1;
		if (this.text(open) !== '{' || this.match[open] < 0) return index;
		const fields: StructInfo['fields'] = new Map();
		let type: string | null = null;
		for (let i = open + 1; i < this.match[open]; i++) {
			const token = this.tokens[i];
			if (token.text === ';') type = null;
			else if (token.kind === 'ident' && !DECLARATION_QUALIFIERS.has(token.text)) {
				if (type === null) type = token.text;
				else fields.set(token.text, { nameIndex: i, type });
			} else if (token.text === '[' && this.match[i] > i) i = this.match[i];
		}
		if (named) this.structs.set(this.text(index + 1), { fields, name: this.text(index + 1), nameIndex: index + 1, start: index });
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
			paramsClose: close,
			paramsOpen: i + 2,
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
		for (const declaration of this.declarationsByName.get(name) ?? []) {
			const visible = declaration.kind === 'param'
				? index > declaration.fn!.paramsOpen && index < declaration.scopeEnd
				: declaration.nameIndex <= index && index <= declaration.scopeEnd;
			if (visible && (!best || declaration.nameIndex > best.nameIndex)) best = declaration;
		}
		if (best) return best;
		for (const unit of this.shared) {
			const global = unit.declarationsByName.get(name)?.find((declaration) => declaration.kind === 'global' || declaration.kind === 'uniform');
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
		if (struct) return struct.fields.get(member)?.type ?? null;
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

	/**
	 * Type of any expression in `range`: operands split on top-level binary operators, comparisons give `bool`, and in arithmetic the
	 * vector or matrix operand wins over scalars (`matN * vecN` gives `vecN`).
	 * @example `uv * 2.0 + offset.xy` with `vec2 uv` gives `vec2`
	 */
	expressionType({ end, start }: Range): string | null {
		const operandTypes: (string | null)[] = [];
		let comparison = false;
		let i = start;
		while (i < end) {
			while (i < end && this.isUnary(i)) i++;
			if (this.text(i) === '(' && this.match[i] > i && this.match[i] < end) {
				let type = this.expressionType({ end: this.match[i], start: i + 1 });
				i = this.match[i] + 1;
				while (this.text(i) === '.' && this.tokens[i + 1]?.kind === 'ident' && i + 1 < end) {
					type = this.memberType(type, this.text(i + 1));
					i += 2;
				}
				operandTypes.push(type);
			} else {
				const operand = this.typeAfter(i);
				if (operand.end <= i || operand.end > end) return null;
				operandTypes.push(operand.type);
				i = operand.end;
			}
			if (i >= end) break;
			const precedence = BINARY_PRECEDENCE[this.text(i)];
			if (precedence === undefined) return null;
			if (precedence <= 3) comparison = true;
			i++;
		}
		if (comparison) return 'bool';
		if (operandTypes.some((type) => type === null)) return null;
		const vector = operandTypes.find((type) => /vec/.test(type!));
		return vector ?? operandTypes.find((type) => /^mat/.test(type!)) ?? operandTypes[0] ?? null;
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
			if (this.isMacro(token.text)) return false;
			if (this.text(i + 1) === '(' && !this.isType(token.text) && !(BUILTIN_DOCS[token.text] && this.findFunctions(token.text).length === 0) && !this.isPureFunction(token.text)) return false;
		}
		return true;
	}
}

const modelUnits = new WeakMap<editor.ITextModel, { unit: GlslUnit; version: number }>();

/** One parse per model version, shared by the analysis, hovers, completion and lint. */
export function modelUnit(model: editor.ITextModel): GlslUnit {
	const version = model.getVersionId();
	const cached = modelUnits.get(model);
	if (cached?.version === version) return cached.unit;
	const unit = new GlslUnit(model.getValue());
	modelUnits.set(model, { unit, version });
	return unit;
}
