import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.d.ts';

export const conf: Monaco.languages.LanguageConfiguration = {
    comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
    ],
    autoClosingPairs: [
        { open: '[', close: ']' },
        { open: '{', close: '}' },
        { open: '(', close: ')' },
        { open: "'", close: "'", notIn: ['string', 'comment'] },
        { open: '"', close: '"', notIn: ['string'] }
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
    ]
};

export const language = <Monaco.languages.IMonarchLanguage>{
    tokenPostfix: '.glsl',

    // Set defaultToken to invalid to see what you do not tokenize yet
    defaultToken: 'invalid',

    keywords: [
        'attribute', 'const', 'uniform', 'varying', 'break', 'continue', 'do',
        'for', 'while', 'if', 'else', 'in', 'out', 'inout', 'true', 'false',
        'lowp', 'mediump', 'highp', 'precision', 'invariant',
        'discard', 'return', 'struct'
    ],

    types: [
        'float', 'int', 'void', 'bool',
        'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4',
        'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
        'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4',
        'bvec2', 'bvec3', 'bvec4', 'sampler2D', 'samplerCube', 'sampler3D'
    ],

    builtins: [
        'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
        'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt', 'abs', 'sign',
        'floor', 'ceil', 'fract', 'mod', 'min', 'max', 'clamp', 'mix', 'step',
        'smoothstep', 'length', 'distance', 'dot', 'cross', 'normalize', 'faceforward',
        'reflect', 'refract', 'matrixCompMult', 'lessThan', 'lessThanEqual',
        'greaterThan', 'greaterThanEqual', 'equal', 'notEqual', 'any', 'all', 'not',
        'texture2D', 'textureCube', 'texture2DProj', 'texture2DLod', 'textureCubeLod',
        'texture2DProjLod', 'gl_Position', 'gl_PointSize', 'gl_FragCoord',
        'gl_FrontFacing', 'gl_PointCoord', 'gl_FragColor', 'gl_FragData'
    ],

    operators: [
        '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', '++', '--',
        '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>='
    ],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    tokenizer: {
        root: [
            // Uniform declaration: uniform <type> <name>
            // All characters must be in consecutive groups for Monarch
            [
                /(uniform)(\s+)(float|int|bool|void|vec[234]|ivec[234]|bvec[234]|mat[234](?:x[234])?|sampler(?:2D|3D|Cube))(\s+)([a-zA-Z_]\w*)/,
                ['keyword', 'white', 'keyword.type', 'white', 'variable.uniform']
            ],

            // Function declaration: <type> <name>(
            [
                /(float|int|bool|void|vec[234]|ivec[234]|bvec[234]|mat[234](?:x[234])?)(\s+)([a-zA-Z_]\w*)(?=\s*\()/,
                ['keyword.type', 'white', 'entity.name.function']
            ],

            // Identifiers and keywords
            [
                /[a-zA-Z_]\w*/,
                {
                    cases: {
                        '@keywords': 'keyword',
                        '@types': 'keyword.type',
                        '@builtins': 'predefined',
                        '@default': 'identifier'
                    }
                }
            ],

            // Whitespace
            { include: '@whitespace' },

            // Preprocessor directives (macros)
            [/#.*/, 'macro'],

            // Delimiters and operators
            [/[{}()[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [
                /@symbols/,
                {
                    cases: {
                        '@operators': 'operator',
                        '@default': ''
                    }
                }
            ],

            // Numbers (floats and ints)
            [/\d*\.\d+([eE][+-]?\d+)?/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/\d+/, 'number'],

            // Delimiters
            [/[;,.]/, 'delimiter']
        ],

        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment']
        ],

        comment: [
            [/[^/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'],
            [/\*\//, 'comment', '@pop'],
            [/[/*]/, 'comment']
        ]
    }
};
