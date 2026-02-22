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
        'for', 'while', 'if', 'else', 'in', 'out', 'inout', 'float', 'int', 'void',
        'bool', 'true', 'false', 'lowp', 'mediump', 'highp', 'precision', 'invariant',
        'discard', 'return', 'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4',
        'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4', 'vec2', 'vec3',
        'vec4', 'ivec2', 'ivec3', 'ivec4', 'bvec2', 'bvec3', 'bvec4', 'sampler2D',
        'samplerCube', 'sampler3D', 'struct'
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
            // Identifiers and keywords
            [
                /[a-zA-Z_]\w*/,
                {
                    cases: {
                        '@keywords': 'keyword',
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
            [/[{}()\[\]]/, '@brackets'],
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
            [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
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
            [/[^\/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'],
            ['\\*/', 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ]
    }
};
