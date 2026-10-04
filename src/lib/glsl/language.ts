import type * as Monaco from 'monaco-editor/editor';
import { BUILTIN_FUNCTION_NAMES, BUILTIN_VARIABLE_NAMES, UNIFORM_DOCS } from '#lib/glsl/builtins.js';

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
		{ open: '/*', close: ' */', notIn: ['string', 'comment'] },
	],
	surroundingPairs: [
		{ open: '{', close: '}' },
		{ open: '[', close: ']' },
		{ open: '(', close: ')' },
	],
	folding: {
		markers: {
			start: /^\s*(?:\/\/\s*#?region\b|#\s*if)/,
			end: /^\s*(?:\/\/\s*#?endregion\b|#\s*endif)/,
		},
	},
	indentationRules: {
		increaseIndentPattern: /^\s*(\bcase\b.*:|\bdefault\b.*:|.*\{[^}]*)\s*$/,
		decreaseIndentPattern: /^\s*\}.*$/,
	},
	wordPattern: /(-?\d*\.\d\w*)|([a-zA-Z_]\w*)/,
} satisfies Monaco.languages.LanguageConfiguration;

/**
 * Lexical grammar only, it never depends on the document: user structs, functions, uniforms, macros and parameters
 * are colored by the semantic tokens provider so typing never recompiles the tokenizer.
 */
export const language = {
	tokenPostfix: '.glsl',
	defaultToken: 'invalid',

	keywords: [
		'attribute', 'const', 'uniform', 'varying', 'buffer', 'shared',
		'in', 'out', 'inout', 'centroid', 'flat', 'smooth', 'invariant', 'layout',
		'lowp', 'mediump', 'highp', 'precision', 'struct',
	],

	controlKeywords: ['break', 'case', 'continue', 'default', 'discard', 'do', 'else', 'for', 'if', 'return', 'switch', 'while'],

	constants: ['true', 'false'],

	types: [
		'void', 'bool', 'int', 'uint', 'float',
		'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4',
		'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
		'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DArray', 'sampler2DShadow', 'samplerCubeShadow', 'sampler2DArrayShadow',
		'isampler2D', 'isampler3D', 'isamplerCube', 'isampler2DArray', 'usampler2D', 'usampler3D', 'usamplerCube', 'usampler2DArray',
	],

	builtins: [...BUILTIN_FUNCTION_NAMES, ...BUILTIN_VARIABLE_NAMES, 'texture', 'textureLod'],

	uniforms: Object.keys(UNIFORM_DOCS),

	operators: [
		'=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
		'&&', '||', '^^', '++', '--',
		'+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>',
		'+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=',
	],

	symbols: /[=><!~?:&|+\-*/^%]+/,

	tokenizer: {
		root: [
			[/(#\s*define)(\s+)([a-zA-Z_]\w*)/, ['meta.preprocessor', 'white', 'macro']],
			[/#\s*[a-zA-Z_]\w*/, 'meta.preprocessor'],

			/** Members and swizzles (`p.xy`, `light.color`), checked before numbers so `.5` stays a float. */
			[/(\.)([a-zA-Z_]\w*)/, ['delimiter', 'variable.property']],

			[
				/[a-zA-Z_]\w*(?=\s*\()/,
				{
					cases: {
						'@controlKeywords': 'keyword.control',
						'@keywords': 'keyword',
						'@types': 'keyword.type',
						'@builtins': 'predefined',
						'@default': 'entity.name.function',
					},
				},
			],
			[
				/[a-zA-Z_]\w*/,
				{
					cases: {
						'@controlKeywords': 'keyword.control',
						'@keywords': 'keyword',
						'@constants': 'constant.language',
						'@types': 'keyword.type',
						'@builtins': 'predefined',
						'@uniforms': 'variable.uniform',
						'@default': 'identifier',
					},
				},
			],

			{ include: '@whitespace' },

			[/[{}()[\]]/, '@brackets'],
			[/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],

			[/(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?[fF]?/, 'number.float'],
			[/\d+[eE][+-]?\d+[fF]?/, 'number.float'],
			[/0[xX][0-9a-fA-F]+[uU]?/, 'number.hex'],
			[/\d+[uUfF]?/, 'number'],

			[/[;,.]/, 'delimiter'],
			[/\\$/, 'meta.preprocessor'],
		],

		whitespace: [
			[/[ \t\r\n]+/, 'white'],
			[/\/\*/, 'comment', '@blockComment'],
			[/\/\/.*$/, 'comment'],
		],

		blockComment: [
			[/[^/*]+/, 'comment'],
			[/\*\//, 'comment', '@pop'],
			[/[/*]/, 'comment'],
		],
	},
} satisfies Monaco.languages.IMonarchLanguage;
