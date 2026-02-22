import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';

export const conf: Monaco.languages.LanguageConfiguration = {
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
};

export const language = <Monaco.languages.IMonarchLanguage>{
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
	],

	builtins: [
		'radians', 'degrees', 'sin', 'cos', 'tan',
		'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
		'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
		'abs', 'sign', 'floor', 'trunc', 'round', 'roundEven', 'ceil', 'fract',
		'mod', 'modf', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
		'isnan', 'isinf',
		'length', 'distance', 'dot', 'cross', 'normalize',
		'faceforward', 'reflect', 'refract',
		'matrixCompMult', 'outerProduct', 'transpose', 'determinant', 'inverse',
		'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual',
		'equal', 'notEqual', 'any', 'all', 'not',
		'texture2D', 'textureCube', 'texture2DProj',
		'texture2DLod', 'textureCubeLod', 'texture2DProjLod',
		// Built-in variables
		'gl_Position', 'gl_PointSize', 'gl_FragCoord',
		'gl_FrontFacing', 'gl_PointCoord', 'gl_FragColor', 'gl_FragData',
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
				/(uniform|attribute|varying)(\s+)(lowp|mediump|highp)(\s+)(float|int|uint|bool|void|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?|sampler\w*)(\s+)([a-zA-Z_]\w*)/,
				['keyword', 'white', 'keyword', 'white', 'keyword.type', 'white', 'variable.uniform'],
			],

			// Qualified declarations WITHOUT precision qualifier
			// uniform|attribute|varying  <type>  <name>
			[
				/(uniform|attribute|varying)(\s+)(float|int|uint|bool|void|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?|sampler\w*)(\s+)([a-zA-Z_]\w*)/,
				['keyword', 'white', 'keyword.type', 'white', 'variable.uniform'],
			],

			// Function declarations: <type> <name>(
			[
				/(float|int|uint|bool|void|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?)(\s+)([a-zA-Z_]\w*)(?=\s*\()/,
				['keyword.type', 'white', 'entity.name.function'],
			],

			// Identifiers / keywords / types / builtins
			[
				/[a-zA-Z_]\w*/,
				{
					cases: {
						'@keywords': 'keyword',
						'@types':    'keyword.type',
						'@builtins': 'predefined',
						'@default':  'identifier',
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
};
