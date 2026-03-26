import { CHANNEL_UNIFORM_NAMES } from './shader-domain';

// Mapping of Shadertoy uniform names to our uniform names
const UNIFORM_MAP: [RegExp, string][] = [
	[/\biTimeDelta\b/g, 'uDeltaTime'],
	[/\biFrameRate\b/g, 'uFrameRate'],
	[/\biTime\b/g, 'uTime'],
	[/\biFrame\b/g, 'uFrameCount'],
	[/\biResolution\b/g, 'uResolution'],
	[/\biDate\b/g, 'uDate'],
	[/\biChannel0\b/g, 'uChannel0'],
	[/\biChannel1\b/g, 'uChannel1'],
	[/\biChannel2\b/g, 'uChannel2'],
	[/\biChannel3\b/g, 'uChannel3'],
];

// WebGL 1 does not support unsigned integer types, so imported shaders need
// to be downgraded to their signed equivalents.
const UNSIGNED_TYPE_MAP: [RegExp, string][] = [
	[/\buvec4\b/g, 'vec4'],
	[/\buvec3\b/g, 'vec3'],
	[/\buvec2\b/g, 'vec2'],
	[/\buint\b/g, 'float'],
];

// iMouse in Shadertoy is vec4(x, y, clickX, clickY)
// uMouse in shayders is vec3(x, y, pressed)
const IMOUSE_REPLACEMENT = 'vec4(uMouse.xy, uMouse.z > 0.5 ? uMouse.xy : vec2(0.0))';

const SIMPLE_OPERAND = String.raw`(?:[-+]?\([^()]*\)|[-+]?[a-zA-Z_]\w*(?:\[[^\[\]]+\]|\((?:[^()]|\([^()]*\))*\)|\.[a-zA-Z_][a-zA-Z0-9_]*)*|[-+]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?[fFuU]?)`;

type SourceSegment = { kind: 'code' | 'comment' | 'string' | 'preprocessor'; text: string };

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitSourceSegments(code: string): SourceSegment[] {
	const segments: SourceSegment[] = [];
	let index = 0;
	let codeStart = 0;
	let lineStart = true;

	const pushCode = (end: number) => {
		if (end > codeStart) {
			segments.push({ kind: 'code', text: code.slice(codeStart, end) });
		}
	};

	while (index < code.length) {
		const char = code[index];
		const next = code[index + 1];

		if (lineStart) {
			let cursor = index;
			while (cursor < code.length && (code[cursor] === ' ' || code[cursor] === '\t' || code[cursor] === '\r')) {
				cursor += 1;
			}

			if (code[cursor] === '#') {
				pushCode(cursor);
				const lineEnd = code.indexOf('\n', cursor);
				segments.push({ kind: 'preprocessor', text: lineEnd === -1 ? code.slice(cursor) : code.slice(cursor, lineEnd + 1) });
				index = lineEnd === -1 ? code.length : lineEnd + 1;
				codeStart = index;
				lineStart = true;
				continue;
			}
		}

		if (char === '/' && next === '/') {
			pushCode(index);
			const lineEnd = code.indexOf('\n', index);
			segments.push({ kind: 'comment', text: lineEnd === -1 ? code.slice(index) : code.slice(index, lineEnd + 1) });
			index = lineEnd === -1 ? code.length : lineEnd + 1;
			codeStart = index;
			lineStart = true;
			continue;
		}

		if (char === '/' && next === '*') {
			pushCode(index);
			const end = code.indexOf('*/', index + 2);
			const endIndex = end === -1 ? code.length : end + 2;
			segments.push({ kind: 'comment', text: code.slice(index, endIndex) });
			index = endIndex;
			codeStart = index;
			lineStart = code[index - 1] === '\n';
			continue;
		}

		if (char === '"' || char === '\'') {
			pushCode(index);
			const quote = char;
			let end = index + 1;
			while (end < code.length) {
				if (code[end] === '\\') {
					end += 2;
					continue;
				}
				if (code[end] === quote) {
					end += 1;
					break;
				}
				end += 1;
			}
			segments.push({ kind: 'string', text: code.slice(index, end) });
			index = end;
			codeStart = index;
			lineStart = code[index - 1] === '\n';
			continue;
		}

		if (char === '\n') {
			lineStart = true;
			index += 1;
			continue;
		}

		if (char !== ' ' && char !== '\t' && char !== '\r') {
			lineStart = false;
		}

		index += 1;
	}

	pushCode(code.length);
	return segments;
}

function transformCodeSegments(code: string, transform: (text: string) => string): string {
	return splitSourceSegments(code)
		.map((segment) => (segment.kind === 'comment' || segment.kind === 'string' ? segment.text : transform(segment.text)))
		.join('');
}

function replaceCodeRegex(code: string, pattern: RegExp, replacement: string): string {
	return transformCodeSegments(code, (segment) => segment.replace(pattern, replacement));
}

function replaceCodeWords(code: string, from: string, to: string): string {
	return replaceCodeRegex(code, new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g'), to);
}

function hasPrecisionDeclaration(code: string): boolean {
	return splitSourceSegments(code).some(
		(segment) => segment.kind === 'code' && /\bprecision\s+\w+\s+float\b/.test(segment.text),
	);
}

function findHeaderInsertionPoint(code: string): number {
	let index = 0;
	let lastDirectiveEnd = 0;
	let inBlockComment = false;

	while (index < code.length) {
		const lineEnd = code.indexOf('\n', index);
		const end = lineEnd === -1 ? code.length : lineEnd + 1;
		const line = code.slice(index, end);
		const trimmed = line.trimStart();

		if (inBlockComment) {
			if (line.includes('*/')) {
				inBlockComment = false;
			}
			index = end;
			continue;
		}

		if (trimmed === '') {
			index = end;
			continue;
		}

		if (trimmed.startsWith('/*')) {
			inBlockComment = !trimmed.includes('*/');
			index = end;
			continue;
		}

		if (trimmed.startsWith('//')) {
			index = end;
			continue;
		}

		if (trimmed.startsWith('#')) {
			lastDirectiveEnd = end;
			index = end;
			continue;
		}

		break;
	}

	return lastDirectiveEnd;
}

function insertHeader(code: string, header: string): string {
	const insertionPoint = findHeaderInsertionPoint(code);
	const prefix = code.slice(0, insertionPoint).trimEnd();
	const suffix = code.slice(insertionPoint).trimStart();
	return [prefix, header, suffix].filter(Boolean).join('\n\n');
}

function rewriteRepeatedPattern(code: string, pattern: RegExp, replacement: (...args: any[]) => string): string {
	return transformCodeSegments(code, (segment) => {
		let result = segment;
		let previous = '';

		while (result !== previous) {
			previous = result;
			result = result.replace(pattern, replacement);
		}

		return result;
	});
}

function rewriteBinaryOperator(code: string, operator: string, replacement: (left: string, right: string) => string): string {
	const operatorPattern = operator === '|'
		? '\\|(?!\\||=)'
		: operator === '&'
			? '&(?!&|=)'
			: operator === '^'
				? '\\^(?!=)'
				: operator === '%'
					? '%(?!=)'
					: escapeRegExp(operator);
	return rewriteRepeatedPattern(code, new RegExp(`(${SIMPLE_OPERAND})\\s*${operatorPattern}\\s*(${SIMPLE_OPERAND})`, 'g'), (_, left: string, right: string) => replacement(left, right));
}

function rewriteUnaryOperator(code: string, operator: string, replacement: (operand: string) => string): string {
	return rewriteRepeatedPattern(code, new RegExp(`\\${escapeRegExp(operator)}\\s*(${SIMPLE_OPERAND})`, 'g'), (_: string, operand: string) => replacement(operand));
}

function rewriteCompoundAssignment(code: string, operator: string, replacement: (left: string, right: string) => string): string {
	return rewriteRepeatedPattern(code, new RegExp(`(${SIMPLE_OPERAND})\\s*${escapeRegExp(operator)}=\\s*(${SIMPLE_OPERAND})`, 'g'), (_: string, left: string, right: string) => `${left} = ${replacement(left, right)}`);
}

function normalizeNumericLiterals(code: string): string {
	return transformCodeSegments(code, (segment) => segment.split('\n').map((line) => {
		if (/\bint\b|\bfor\s*\(\s*int\b/.test(line)) return line;
		return line.replace(/(?<![\w.])(?:0[xX][0-9a-fA-F]+|\d+)\b(?!\s*[.eEfFuU])/g, '$&.0');
	}).join('\n'));
}

const COMPAT_HELPERS = `float compatMod(float a,float b){return mod(a,b);}int compatMod(int a,int b){return int(mod(float(a),float(b)));}
float bitNot(float a){return -a-1.0;}
float bitXor(float a,float b){float r=0.0,p=1.0;for(int i=0;i<32;i++){bool oa=mod(a,2.0)>=1.0;bool ob=mod(b,2.0)>=1.0;if(oa!=ob)r+=p;a=floor(a/2.0);b=floor(b/2.0);p*=2.0;}return r;}
float bitOr(float a,float b){float r=0.0,p=1.0;for(int i=0;i<32;i++){if(mod(a,2.0)>=1.0||mod(b,2.0)>=1.0)r+=p;a=floor(a/2.0);b=floor(b/2.0);p*=2.0;}return r;}
float bitAnd(float a,float b){float r=0.0,p=1.0;for(int i=0;i<32;i++){if(mod(a,2.0)>=1.0&&mod(b,2.0)>=1.0)r+=p;a=floor(a/2.0);b=floor(b/2.0);p*=2.0;}return r;}
float bitShiftLeft(float a,float b){for(int i=0;i<32;i++)if(float(i)<b)a*=2.0;return a;}
float bitShiftRight(float a,float b){for(int i=0;i<32;i++)if(float(i)<b)a/=2.0;return a;}`;

const UNIFORM_HEADER = `precision mediump float;
uniform float uAspect;
uniform float uDeltaTime;
uniform float uFrameRate;
uniform float uTime;
uniform int uFrameCount;
uniform vec2 uResolution;
uniform vec3 uMouse;
uniform vec4 uDate;`;

export function isShadertoyShader(code: string): boolean {
	return /void\s+mainImage\s*\(/.test(code);
}

export function convertFromShadertoy(code: string): string {
	let result = code;

	// Remove Shadertoy-style uniform declarations (uniform <type> i<Name>;)
	result = replaceCodeRegex(result, /^[ \t]*uniform\s+\S+\s+i[A-Z][A-Za-z0-9]*\s*;[^\n]*/gm, '');

	// Replace Shadertoy uniforms with our uniforms (order matters: longer names first)
	for (const [pattern, replacement] of UNIFORM_MAP) {
		result = replaceCodeRegex(result, pattern, replacement);
	}

	for (const [pattern, replacement] of UNSIGNED_TYPE_MAP) {
		result = replaceCodeRegex(result, pattern, replacement);
	}

	// Drop the unsigned literal suffix used by Shadertoy shaders.
	result = replaceCodeRegex(result, /\b(0[xX][0-9a-fA-F]+|\d+)\s*[uU]\b/g, '$1');

	// iMouse is a vec4 in Shadertoy, our uMouse is vec3 - emit a compatible vec4 expression
	result = replaceCodeWords(result, 'iMouse', IMOUSE_REPLACEMENT);

	const needsCompatHelpers = /(?:%|\^|\||&|~|<<|>>)/.test(result);

	// Convert common infix math operators into GLSL function calls.
	// GLSL ES 1.0 lacks the bitwise operators and `%` on floats, so we map
	// the forms that appear in imported Shadertoy-style snippets.
	for (const [operator, replacement] of [
		['%', (left: string, right: string) => `compatMod(float(${left}), float(${right}))`],
		['^', (left: string, right: string) => `bitXor(float(${left}), float(${right}))`],
		['|', (left: string, right: string) => `bitOr(float(${left}), float(${right}))`],
		['&', (left: string, right: string) => `bitAnd(float(${left}), float(${right}))`],
		['<<', (left: string, right: string) => `bitShiftLeft(float(${left}), float(${right}))`],
		['>>', (left: string, right: string) => `bitShiftRight(float(${left}), float(${right}))`],
	] as const) {
		result = rewriteBinaryOperator(result, operator, replacement);
		result = rewriteCompoundAssignment(result, operator, replacement);
	}
	result = rewriteUnaryOperator(result, '~', (operand) => `bitNot(float(${operand}))`);
	result = normalizeNumericLiterals(result);

	// texture() is GLSL ES 3.0 - WebGL 1 requires texture2D() for sampler2D
	result = replaceCodeRegex(result, /\btexture\s*\(/g, 'texture2D(');

	// Detect which channel samplers are actually used and emit their declarations
	const channelDecls = CHANNEL_UNIFORM_NAMES.filter((ch) => new RegExp(`\\b${escapeRegExp(ch)}\\b`).test(result))
		.map((ch) => `uniform sampler2D ${ch};`)
		.join('\n');

	// Build header
	let header = UNIFORM_HEADER;
	if (channelDecls) header += '\n' + channelDecls;
	if (needsCompatHelpers) header += '\n\n' + COMPAT_HELPERS;

	// Add the header if no precision declaration is present
	if (!hasPrecisionDeclaration(result)) {
		result = insertHeader(result.trim(), header);
	} else {
		// Inject channel declarations right after the existing precision line
		if (channelDecls || needsCompatHelpers) {
			const additions = [channelDecls, needsCompatHelpers ? COMPAT_HELPERS : ''].filter(Boolean).join('\n\n');
			result = replaceCodeRegex(result, /(precision\s+\w+\s+float\s*;)/, `$1\n${additions}`);
		}
		result = result.trim();
	}

	// Replace mainImage function signature and parameters
	// Extract parameter names: void mainImage(out vec4 fragColor, in vec2 fragCoord)
	const mainImageRegex = /void\s+mainImage\s*\(\s*out\s+(?:lowp|mediump|highp\s+)?vec4\s+(\w+)\s*,\s*in\s+vec2\s+(\w+)\s*\)/;
	const match = mainImageRegex.exec(result);

	if (match) {
		const fragColorVar = match[1];
		const fragCoordVar = match[2];

		// Replace function signature
		result = replaceCodeRegex(result, mainImageRegex, 'void main()');

		// Replace all occurrences of the parameter names with the built-in variables
		result = replaceCodeWords(result, fragColorVar, 'gl_FragColor');
		result = replaceCodeWords(result, fragCoordVar, 'gl_FragCoord.xy');
	}

	return result;
}
