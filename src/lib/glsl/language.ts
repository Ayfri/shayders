import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';
import { BUILTIN_FUNCTION_NAMES, BUILTIN_VARIABLE_NAMES } from '$lib/glsl/builtins';

// Shared type pattern reused across tokenizer rules (built-in types only)
const T_BUILTIN = 'float|int|uint|bool|void|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?|sampler\\w*';

export const conf = {
	comments: {
		lineComment: '//',
		blockComment: ['/*', '*/'],
	},
	brackets: [
		['{', '}'],
		['[', ']'],
		['(', ')'],
	],
	autoClosingPairs: [
		{ open: '[', close: ']' },
		{ open: '{', close: '}' },
		{ open: '(', close: ')' },
		{ open: "'", close: "'", notIn: ['string', 'comment'] },
		{ open: '"',  close: '"',  notIn: ['string'] },
	],
	surroundingPairs: [
		{ open: '{', close: '}' },
		{ open: '[', close: ']' },
		{ open: '(', close: ')' },
		{ open: '"', close: '"' },
		{ open: "'", close: "'" },
	],
	indentationRules: {
		increaseIndentPattern: /^\s*(\bcase\b.*:|\bdefault\b.*:|.*\{[^}]*)\s*$/,
		decreaseIndentPattern: /^\s*\}.*$/,
	},
	wordPattern: /(-?\d*\.\d\w*)|([a-zA-Z_]\w*)/,
} satisfies Monaco.languages.LanguageConfiguration;

export function buildLanguage(extraTypes: string[] = [], uniforms: string[] = []): Monaco.languages.IMonarchLanguage {
	// Extend the type regex with any user-defined struct names so that rules
	// matching `<type> <name>` also work for struct-typed declarations.
	const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const T = extraTypes.length > 0
		? `${T_BUILTIN}|${extraTypes.map(escRe).join('|')}`
		: T_BUILTIN;

	return {
		tokenPostfix: '.glsl',
		defaultToken: 'invalid',

		keywords: [
			'attribute', 'const', 'uniform', 'varying',
			'break', 'continue', 'do', 'for', 'while',
			'if', 'else', 'in', 'out', 'inout',
			'true', 'false',
			'lowp', 'mediump', 'highp', 'precision', 'invariant',
			'discard', 'return', 'struct',
			'layout', 'flat', 'smooth', 'centroid',
		],

		types: [
			'float', 'int', 'uint', 'void', 'bool',
			'mat2', 'mat3', 'mat4',
			'mat2x2', 'mat2x3', 'mat2x4',
			'mat3x2', 'mat3x3', 'mat3x4',
			'mat4x2', 'mat4x3', 'mat4x4',
			'vec2', 'vec3', 'vec4',
			'ivec2', 'ivec3', 'ivec4',
			'uvec2', 'uvec3', 'uvec4',
			'bvec2', 'bvec3', 'bvec4',
			'sampler2D', 'samplerCube', 'sampler3D',
			'sampler2DShadow', 'samplerCubeShadow',
			...extraTypes,
		],

		uniforms,

		builtins: [
			...BUILTIN_FUNCTION_NAMES,
			...BUILTIN_VARIABLE_NAMES,
		],

		operators: [
			'=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
			'&&', '||', '^^', '++', '--',
			'+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>',
			'+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=',
		],

		symbols: /[=><!~?:&|+\-*/^%]+/,

		tokenizer: {
			root: [
				// Preprocessor directives
				// Match the whole #directive line as one token (no state needed, no optional groups)
				[/#[ \t]*(?:define|undef|if|ifdef|ifndef|elif|else|endif|version|extension|pragma|line|error)\b[^\n]*/, 'meta.preprocessor'],

				// Qualified declarations WITH precision qualifier
				// uniform|attribute|varying  lowp|mediump|highp  <type>  <name>
				[
					new RegExp(`(uniform|attribute|varying)(\\s+)(lowp|mediump|highp)(\\s+)(${T})(\\s+)([a-zA-Z_]\\w*)`),
					['keyword', 'white', 'keyword', 'white', 'keyword.type', 'white', 'variable.uniform'],
				],

				// Qualified declarations WITHOUT precision qualifier
				// uniform|attribute|varying  <type>  <name>
				[
					new RegExp(`(uniform|attribute|varying)(\\s+)(${T})(\\s+)([a-zA-Z_]\\w*)`),
					['keyword', 'white', 'keyword.type', 'white', 'variable.uniform'],
				],

				// Struct declarations and struct-typed variable declarations: struct Name
				[/(struct)(\s+)([a-zA-Z_]\w*)/, ['keyword', 'white', 'keyword.type']],

				// Function declarations: <type> <name>(
				[
					new RegExp(`(${T})(\\s+)([a-zA-Z_]\\w*)(?=\\s*\\()`),
					['keyword.type', 'white', 'entity.name.function'],
				],
				// Function calls: identifier immediately followed by '(' (not a keyword/type/builtin)
				[
					/[a-zA-Z_]\w*(?=\s*\()/,
					{
						cases: {
							'@keywords':  'keyword',
							'@types':     'keyword.type',
							'@builtins':  'predefined',
							'@uniforms':  'variable.uniform',
							'@default':   'entity.name.function',
						},
					},
				],
				// Identifiers / keywords / types / builtins
				[
					/[a-zA-Z_]\w*/,
					{
						cases: {
							'@keywords':  'keyword',
							'@types':     'keyword.type',
							'@builtins':  'predefined',
							'@uniforms':  'variable.uniform',
							'@default':   'identifier',
						},
					},
				],

				// Whitespace & comments
				{ include: '@whitespace' },

				// Brackets & operators
				[/[{}()[\]]/, '@brackets'],
				[/[<>](?!@symbols)/,  '@brackets'],
				[/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],

				// Numbers
				[/\d*\.\d+(?:[eE][+-]?\d+)?[fF]?/, 'number.float'],
				[/\d+\.\d*(?:[eE][+-]?\d+)?[fF]?/, 'number.float'],
				[/0[xX][0-9a-fA-F]+[uU]?/, 'number.hex'],
				[/\d+[uUfF]?/, 'number'],

				// Delimiters
				[/[;,.]/, 'delimiter'],
			],

			whitespace: [
				[/[ \t\r\n]+/, 'white'],
				[/\/\*/,        'comment', '@blockComment'],
				[/\/\/[^\n]*/,  'comment'],
			],

			blockComment: [
				[/[^/*]+/, 'comment'],
				[/\/\*/,   'comment', '@push'],
				[/\*\//,   'comment', '@pop'],
				[/[/*]/,   'comment'],
			],
		},
	} satisfies Monaco.languages.IMonarchLanguage;
}

export const language = buildLanguage();
