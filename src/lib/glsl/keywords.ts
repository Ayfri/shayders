export const GLSL_KEYWORDS: readonly string[] = [
	'attribute', 'const', 'uniform', 'varying',
	'break', 'continue', 'do', 'for', 'while',
	'if', 'else', 'in', 'out', 'inout',
	'true', 'false',
	'lowp', 'mediump', 'highp', 'precision', 'invariant',
	'discard', 'return', 'struct',
	'layout', 'flat', 'smooth', 'centroid',
];

export const GLSL_PREPROCESSOR: readonly string[] = [
	'#define', '#undef',
	'#if', '#ifdef', '#ifndef', '#else', '#elif', '#endif',
	'#version', '#extension', '#pragma', '#line', '#error',
];
