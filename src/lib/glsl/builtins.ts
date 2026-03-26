export interface GlslDoc {
	/** Overloads separated by `\n`. */
	signature: string;
	description: string;
	returns?: string;
	params?: Record<string, string>;
	examples?: string[];
}

export const BUILTIN_FUNCTION_NAMES = [
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
] as const;

export const BUILTIN_VARIABLE_NAMES_FRAGMENT = [
	'gl_FragCoord',
	'gl_FragColor',
	'gl_FrontFacing',
	'gl_PointCoord',
	'gl_FragData',
] as const;

export const BUILTIN_VARIABLE_NAMES_VERTEX = [
	'gl_Position',
	'gl_PointSize',
] as const;

export const BUILTIN_VARIABLE_NAMES = [...BUILTIN_VARIABLE_NAMES_FRAGMENT];

export const BUILTIN_DOCS: Record<string, GlslDoc> = {
	// Trigonometric
	radians:     { signature: 'genType radians(genType degrees)', description: 'Converts degrees to radians (`π / 180 × degrees`).' },
	degrees:     { signature: 'genType degrees(genType radians)', description: 'Converts radians to degrees (`180 / π × radians`).' },
	sin:         { signature: 'genType sin(genType angle)', description: 'Returns the sine of *angle* (in radians).' },
	cos:         { signature: 'genType cos(genType angle)', description: 'Returns the cosine of *angle* (in radians).' },
	tan:         { signature: 'genType tan(genType angle)', description: 'Returns the tangent of *angle* (in radians).' },
	asin:        { signature: 'genType asin(genType x)', description: 'Arc sine of *x* in radians. Range: [−π/2, π/2].' },
	acos:        { signature: 'genType acos(genType x)', description: 'Arc cosine of *x* in radians. Range: [0, π].' },
	atan:        { signature: 'genType atan(genType y_over_x)\ngenType atan(genType y, genType x)', description: 'Arc tangent. Two-argument form computes `atan(y/x)` with correct quadrant handling.' },
	sinh:        { signature: 'genType sinh(genType x)', description: 'Hyperbolic sine: `(eˣ − e⁻ˣ) / 2`.' },
	cosh:        { signature: 'genType cosh(genType x)', description: 'Hyperbolic cosine: `(eˣ + e⁻ˣ) / 2`.' },
	tanh:        { signature: 'genType tanh(genType x)', description: 'Hyperbolic tangent: `sinh(x) / cosh(x)`.' },
	asinh:       { signature: 'genType asinh(genType x)', description: 'Arc hyperbolic sine.' },
	acosh:       { signature: 'genType acosh(genType x)', description: 'Arc hyperbolic cosine. *x* must be ≥ 1.' },
	atanh:       { signature: 'genType atanh(genType x)', description: 'Arc hyperbolic tangent. |*x*| must be < 1.' },

	// Exponential
	pow:         { signature: 'genType pow(genType x, genType y)', description: 'Returns `x^y`. *x* must be > 0.' },
	exp:         { signature: 'genType exp(genType x)', description: 'Returns `eˣ`.' },
	log:         { signature: 'genType log(genType x)', description: 'Returns `ln(x)`. *x* must be > 0.' },
	exp2:        { signature: 'genType exp2(genType x)', description: 'Returns `2^x`.' },
	log2:        { signature: 'genType log2(genType x)', description: 'Returns `log₂(x)`. *x* must be > 0.' },
	sqrt:        { signature: 'genType sqrt(genType x)', description: 'Returns `√x`. *x* must be ≥ 0.' },
	inversesqrt: { signature: 'genType inversesqrt(genType x)', description: 'Returns `1 / √x`. *x* must be > 0.' },

	// Common
	abs:         { signature: 'genType abs(genType x)\ngenIType abs(genIType x)', description: 'Returns the absolute value of *x*.' },
	sign:        { signature: 'genType sign(genType x)\ngenIType sign(genIType x)', description: 'Returns −1, 0, or 1 depending on the sign of *x*.' },
	floor:       { signature: 'genType floor(genType x)', description: 'Returns the largest integer ≤ *x*.' },
	trunc:       { signature: 'genType trunc(genType x)', description: 'Truncates *x* toward zero.' },
	round:       { signature: 'genType round(genType x)', description: 'Returns the nearest integer to *x* (round half away from zero).' },
	roundEven:   { signature: 'genType roundEven(genType x)', description: 'Returns the nearest integer, rounding half toward the nearest even integer (banker\'s rounding).' },
	ceil:        { signature: 'genType ceil(genType x)', description: 'Returns the smallest integer ≥ *x*.' },
	fract:       { signature: 'genType fract(genType x)', description: 'Returns `x − floor(x)` (fractional part).' },
	mod:         { signature: 'genType mod(genType x, float y)\ngenType mod(genType x, genType y)', description: 'Returns `x − y × floor(x/y)` (GLSL modulus, always same sign as *y*).' },
	modf:        { signature: 'genType modf(genType x, out genType i)', description: 'Separates *x* into its integer and fractional parts. Returns the fractional part, writes the integer part to *i*.' },
	min:         { signature: 'genType min(genType x, genType y)\ngenType min(genType x, float y)', description: 'Returns the smaller of *x* and *y*.' },
	max:         { signature: 'genType max(genType x, genType y)\ngenType max(genType x, float y)', description: 'Returns the larger of *x* and *y*.' },
	clamp:       {
		signature: 'genType clamp(genType x, genType minVal, genType maxVal)\ngenType clamp(genType x, float minVal, float maxVal)',
		description: 'Clamps *x* to `[minVal, maxVal]`.',
		returns: 'The input value clamped to the closed interval `[minVal, maxVal]` component-wise.',
		params: {
			x: 'Input value to clamp.',
			minVal: 'Lower inclusive bound.',
			maxVal: 'Upper inclusive bound.',
		},
		examples: [
			'float v = clamp(2.5, 0.0, 1.0);  // result: 1.0',
			'vec3 c = clamp(color, vec3(0.0), vec3(1.0));',
		],
	},
	mix:         {
		signature: 'genType mix(genType x, genType y, genType a)\ngenType mix(genType x, genType y, float a)\ngenType mix(genType x, genType y, genBType a)',
		description: 'Linear interpolation: `x*(1−a) + y*a`. Boolean overload selects *x* (false) or *y* (true) per component.',
		returns: 'Interpolated value between *x* and *y*.',
		params: {
			x: 'Start value.',
			y: 'End value.',
			a: 'Interpolation factor or boolean selector.',
		},
		examples: [
			'float value = mix(2.0, 4.0, 0.25);  // result: 2.5',
			'vec3 color = mix(vec3(0.0), vec3(1.0), 0.35);  // result: vec3(0.35)',
		],
	},
	step:        { signature: 'genType step(genType edge, genType x)\ngenType step(float edge, genType x)', description: 'Returns 0 if `x < edge`, else 1.' },
	smoothstep:  { signature: 'genType smoothstep(genType edge0, genType edge1, genType x)\ngenType smoothstep(float edge0, float edge1, genType x)', description: 'Smooth Hermite interpolation 0→1 for `edge0 < x < edge1`.' },
	isnan:       { signature: 'genBType isnan(genType x)', description: 'Returns true if *x* is NaN.' },
	isinf:       { signature: 'genBType isinf(genType x)', description: 'Returns true if *x* is ±∞.' },

	// Geometric
	length:      { signature: 'float length(genType x)', description: 'Euclidean length of vector *x*.' },
	distance:    {
		signature: 'float distance(genType p0, genType p1)',
		description: 'Euclidean distance between *p0* and *p1*.',
		returns: 'Non-negative scalar distance.',
		params: {
			p0: 'First point/vector.',
			p1: 'Second point/vector.',
		},
		examples: [
			'float d = distance(vec2(0.0), vec2(3.0, 4.0));  // result: 5.0',
		],
	},
	dot:         { signature: 'float dot(genType x, genType y)', description: 'Dot product (sum of component-wise products).' },
	cross:       { signature: 'vec3 cross(vec3 x, vec3 y)', description: 'Cross product of *x* and *y* (3D only).' },
	normalize:   {
		signature: 'genType normalize(genType x)',
		description: 'Returns *x* scaled so its length is 1.',
		returns: 'Unit-length vector in the same direction as *x*.',
		params: {
			x: 'Input vector.',
		},
		examples: [
			'vec2 n = normalize(vec2(3.0, 4.0));  // result: vec2(0.6, 0.8)',
		],
	},
	faceforward: { signature: 'genType faceforward(genType N, genType I, genType Nref)', description: 'Returns *N* if `dot(Nref, I) < 0`, otherwise −*N*.' },
	reflect:     { signature: 'genType reflect(genType I, genType N)', description: 'Reflection of incident *I* off surface with normal *N*: `I − 2·dot(N,I)·N`. *N* must be normalized.' },
	refract:     { signature: 'genType refract(genType I, genType N, float eta)', description: 'Refraction vector for incident *I*, normal *N*, and refractive index ratio *eta*. *I* and *N* must be normalized.' },

	// Matrix
	matrixCompMult:    { signature: 'matN matrixCompMult(matN x, matN y)', description: 'Component-wise matrix multiplication (NOT linear-algebra mul; use `*` for that).' },
	outerProduct:      { signature: 'matNxM outerProduct(vecM c, vecN r)', description: 'Outer product of column vector *c* and row vector *r*.' },
	transpose:         { signature: 'matNxM transpose(matMxN m)', description: 'Returns the transpose of matrix *m*.' },
	determinant:       { signature: 'float determinant(matN m)', description: 'Returns the determinant of *m*.' },
	inverse:           { signature: 'matN inverse(matN m)', description: 'Returns the inverse of *m*. If *m* is singular the result is undefined.' },

	// Vector relational
	lessThan:          { signature: 'bvecN lessThan(vecN x, vecN y)\nbvecN lessThan(ivecN x, ivecN y)', description: 'Component-wise `x < y`.' },
	lessThanEqual:     { signature: 'bvecN lessThanEqual(vecN x, vecN y)\nbvecN lessThanEqual(ivecN x, ivecN y)', description: 'Component-wise `x ≤ y`.' },
	greaterThan:       { signature: 'bvecN greaterThan(vecN x, vecN y)\nbvecN greaterThan(ivecN x, ivecN y)', description: 'Component-wise `x > y`.' },
	greaterThanEqual:  { signature: 'bvecN greaterThanEqual(vecN x, vecN y)\nbvecN greaterThanEqual(ivecN x, ivecN y)', description: 'Component-wise `x ≥ y`.' },
	equal:             { signature: 'bvecN equal(vecN x, vecN y)\nbvecN equal(ivecN x, ivecN y)', description: 'Component-wise `x == y`.' },
	notEqual:          { signature: 'bvecN notEqual(vecN x, vecN y)\nbvecN notEqual(ivecN x, ivecN y)', description: 'Component-wise `x ≠ y`.' },
	any:               { signature: 'bool any(bvecN x)', description: 'Returns true if any component of *x* is true.' },
	all:               { signature: 'bool all(bvecN x)', description: 'Returns true if all components of *x* are true.' },
	not:               { signature: 'bvecN not(bvecN x)', description: 'Component-wise logical NOT.' },

	// Texture (GLSL ES 1.0 / WebGL 1)
	texture2D:         {
		signature: 'vec4 texture2D(sampler2D sampler, vec2 coord)\nvec4 texture2D(sampler2D sampler, vec2 coord, float bias)',
		description: 'Samples a 2D texture at normalized coordinates *coord*. Optional *bias* is added to the computed LOD.',
		returns: 'Sampled texel as RGBA.',
		params: {
			sampler: '2D texture sampler.',
			coord: 'Normalized UV coordinates.',
			bias: 'Optional LOD bias.',
		},
		examples: [
			'vec2 uv = gl_FragCoord.xy / uResolution;',
			'vec4 tex = texture2D(uChannel0, uv);',
		],
	},
	textureCube:       { signature: 'vec4 textureCube(samplerCube sampler, vec3 coord)\nvec4 textureCube(samplerCube sampler, vec3 coord, float bias)', description: 'Samples a cube-map texture. *coord* is used as a direction vector.' },
	texture2DProj:     { signature: 'vec4 texture2DProj(sampler2D sampler, vec3 coord)\nvec4 texture2DProj(sampler2D sampler, vec4 coord)', description: 'Projective 2D texture lookup. Divides `.st` by `.q` (or `.p`).' },
	texture2DLod:      { signature: 'vec4 texture2DLod(sampler2D sampler, vec2 coord, float lod)', description: 'Explicit-LOD 2D texture lookup (vertex shader only in ES 1.0).' },
	textureCubeLod:    { signature: 'vec4 textureCubeLod(samplerCube sampler, vec3 coord, float lod)', description: 'Explicit-LOD cube-map lookup (vertex shader only in ES 1.0).' },
	texture2DProjLod:  { signature: 'vec4 texture2DProjLod(sampler2D sampler, vec3 coord, float lod)', description: 'Explicit-LOD projective 2D texture lookup.' },

	// Built-in variables
	gl_Position:       { signature: 'vec4 gl_Position', description: '*(Vertex)* Clip-space output position. Must be written in every vertex shader.' },
	gl_PointSize:      { signature: 'float gl_PointSize', description: '*(Vertex)* Diameter of rasterised points in pixels.' },
	gl_FragCoord:      { signature: 'vec4 gl_FragCoord', description: '*(read-only)* Window-space position. `.xy` = pixel coords, `.z` = depth [0,1], `.w` = 1/w_clip.' },
	gl_FragColor:      { signature: 'vec4 gl_FragColor', description: 'Output colour of the fragment. Alpha determines blending.' },
	gl_FrontFacing:    { signature: 'bool gl_FrontFacing', description: '*(read-only)* `true` if the fragment belongs to a front-facing primitive.' },
	gl_PointCoord:     { signature: 'vec2 gl_PointCoord', description: '*(read-only)* Position within a point-sprite quad. Range [0,1] per axis.' },
	gl_FragData:       { signature: 'vec4 gl_FragData[n]', description: 'Output array for MRT (multiple render targets). Use with `GL_EXT_draw_buffers`.' },
};

// Shayders-specific built-in uniforms injected automatically into every shader.
export const UNIFORM_DOCS: Record<string, { signature: string; description: string }> = {
	uTime:       { signature: 'uniform float uTime',          description: 'Elapsed time in seconds since shader start.' },
	uResolution: { signature: 'uniform vec2 uResolution',    description: 'Canvas dimensions in pixels (width × height).' },
	uMouse:      { signature: 'uniform vec3 uMouse',          description: 'Mouse position (x, y) in pixels. Z is 1.0 while the mouse button is pressed, 0.0 otherwise.' },
	uDate:       { signature: 'uniform vec4 uDate',           description: 'Date/time as (year, month, day, hours × 3600 + minutes × 60 + seconds).' },
	uFrameRate:  { signature: 'uniform float uFrameRate',    description: 'Frames per second (calculated from delta time).' },
	uDeltaTime:  { signature: 'uniform float uDeltaTime',    description: 'Time elapsed since the last frame, in seconds.' },
	uFrameCount: { signature: 'uniform int uFrameCount',     description: 'Total number of frames rendered since shader start.' },
	uAspect:     { signature: 'uniform float uAspect',       description: 'Canvas aspect ratio (width / height).' },
	uChannel0:   { signature: 'uniform sampler2D uChannel0', description: 'Channel 0 texture input (image or video).' },
	uChannel1:   { signature: 'uniform sampler2D uChannel1', description: 'Channel 1 texture input (image or video).' },
	uChannel2:   { signature: 'uniform sampler2D uChannel2', description: 'Channel 2 texture input (image or video).' },
	uChannel3:   { signature: 'uniform sampler2D uChannel3', description: 'Channel 3 texture input (image or video).' },
	uBufferA:    { signature: 'uniform sampler2D uBufferA',  description: 'Buffer A offscreen texture. Sample: `texture2D(uBufferA, gl_FragCoord.xy / uResolution)`' },
	uBufferB:    { signature: 'uniform sampler2D uBufferB',  description: 'Buffer B offscreen texture. Sample: `texture2D(uBufferB, gl_FragCoord.xy / uResolution)`' },
	uBufferC:    { signature: 'uniform sampler2D uBufferC',  description: 'Buffer C offscreen texture. Sample: `texture2D(uBufferC, gl_FragCoord.xy / uResolution)`' },
	uBufferD:    { signature: 'uniform sampler2D uBufferD',  description: 'Buffer D offscreen texture. Sample: `texture2D(uBufferD, gl_FragCoord.xy / uResolution)`' },
};

export const BUILTIN_VARIABLE_DOC_ENTRIES = Object.entries(BUILTIN_DOCS).filter(
	([name]) => BUILTIN_VARIABLE_NAMES_FRAGMENT.includes(name as (typeof BUILTIN_VARIABLE_NAMES_FRAGMENT)[number])
);

export const BUILTIN_FUNCTION_DOC_ENTRIES = Object.entries(BUILTIN_DOCS).filter(
	([name]) => (BUILTIN_FUNCTION_NAMES as readonly string[]).includes(name)
);
