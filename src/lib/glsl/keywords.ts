export const GLSL_KEYWORDS: readonly string[] = [
	'attribute', 'const', 'uniform', 'varying',
	'break', 'continue', 'do', 'for', 'while', 'switch', 'case', 'default',
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

const ES3_KEYWORD = 'Only exists in WebGL 2 shaders, WebGL 1 rejects it.';

/** Hover docs for keywords, written for WebGL 1 fragment shaders (the precision ranges are the GLSL ES 1.00 minimums, section 4.5.2). */
export const KEYWORD_DOCS: Readonly<Record<string, string>> = {
	attribute: 'Per-vertex input, vertex shaders only.',
	break: 'Leaves the innermost loop.',
	case: ES3_KEYWORD,
	centroid: ES3_KEYWORD,
	const: 'Value that never changes, set once when declared. Constants can size arrays and limit loops.',
	continue: 'Skips to the next iteration of the innermost loop.',
	default: ES3_KEYWORD,
	discard: 'Throws the current pixel away, nothing gets written for it.',
	do: 'WebGL 1 only accepts `for` loops, write `for (int i = 0; i < MAX; i++) { …; if (done) break; }` instead.',
	else: 'Runs when the `if` condition is false.',
	false: 'Boolean value.',
	flat: ES3_KEYWORD,
	for: 'WebGL 1 only accepts simple loops: one `int` or `float` counter, a fixed start, a comparison with a constant and a fixed step, like `for (int i = 0; i < 64; i++)`. Use `break` to stop early.',
	highp: 'High precision, real 32-bit floats on almost every GPU. Use it for time, positions and random hashes.',
	if: 'Runs the next statement when the condition is true. On GPUs both sides often run anyway, `mix` or `step` can be faster for small choices.',
	in: 'Default for parameters: the function gets a copy of the value.',
	inout: 'The function gets the value and its changes are copied back to the caller.',
	invariant: 'Makes an output give exactly the same result in every shader, only useful in vertex shaders.',
	layout: ES3_KEYWORD,
	lowp: 'Low precision: values from -2 to 2 in steps of 1/256. Fine for colors, too rough for positions.',
	mediump: 'Medium precision: values up to ±16384 with about 3 correct digits. On phones `uTime` and pixel positions get choppy with it, use `highp` for them.',
	out: 'The function writes this parameter and the value is copied back to the caller. It starts empty.',
	precision: 'Sets the default precision of a type: `precision highp float;`. WebGL 1 fragment shaders need this line before using any float.',
	return: 'Leaves the function, with a value unless it returns `void`.',
	smooth: ES3_KEYWORD,
	struct: 'Groups values into a new type: `struct Hit { float d; vec3 color; };`, its name also builds one: `Hit(1.0, vec3(0.0))`.',
	switch: ES3_KEYWORD,
	true: 'Boolean value.',
	uniform: 'Value given by the app, the same for every pixel of a frame. Shayders fills its own uniforms (`uTime`, `uResolution`, …) every frame.',
	varying: 'Value sent by the vertex shader, Shayders\' vertex shader sends none.',
	while: 'WebGL 1 only accepts `for` loops, write `for (int i = 0; i < MAX; i++) { if (!condition) break; … }` instead.',
};

export const PREPROCESSOR_DOCS: Readonly<Record<string, string>> = {
	define: 'Defines a macro, object-like (`#define PI 3.14159`) or function-like (`#define SAT(x) clamp(x, 0.0, 1.0)`).',
	elif: 'Else-if branch of a conditional block.',
	else: 'Else branch of a conditional block.',
	endif: 'Closes a conditional block.',
	error: 'Stops compilation with a message.',
	extension: 'Turns on a WebGL 1 extension when the GPU supports it: `GL_OES_standard_derivatives` (`dFdx`, `dFdy`, `fwidth`), `GL_EXT_shader_texture_lod` (`texture2DLodEXT`, `texture2DGradEXT`, …), `GL_EXT_frag_depth` (`gl_FragDepthEXT`).',
	if: 'Compiles the block when the constant expression is non-zero: `#if __VERSION__ == 100`.',
	ifdef: 'Compiles the block when the macro is defined.',
	ifndef: 'Compiles the block when the macro is not defined.',
	line: 'Changes the line number reported in compiler errors.',
	pragma: 'Compiler hint such as `#pragma optimize(off)`, unknown ones are ignored.',
	undef: 'Removes a macro definition.',
	version: 'WebGL 1 only accepts `#version 100`, and only on the very first line, which the Common buffer takes when it has code.',
};

/** Macros every GLSL ES 1.00 compiler defines. */
export const PREDEFINED_MACRO_DOCS: Readonly<Record<string, string>> = {
	__FILE__: 'Source string number, always 0 in WebGL.',
	__LINE__: 'Current line number.',
	__VERSION__: 'GLSL version, `100` in WebGL 1.',
	GL_ES: 'Defined to 1 in every GLSL ES shader.',
	GL_FRAGMENT_PRECISION_HIGH: 'Defined to 1 when fragment shaders support `highp`.',
};
