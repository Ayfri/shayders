export interface GlslDoc {
	/** Overloads separated by `\n`, only the ones GLSL ES 1.00 (WebGL 1) has. */
	signature: string;
	/** One short sentence, also shown in the Built-ins panel. */
	description: string;
	/** Edge cases and tips, shown in hovers and in the expanded panel entry. */
	details?: string;
	returns?: string;
	params?: Record<string, string>;
	examples?: string[];
	/** Why a WebGL 1 fragment shader can't call it, reported by the linter. */
	unavailable?: string;
	/** `#extension` the function needs in WebGL 1, the linter offers to add it. */
	extension?: string;
}

/** Functions grouped by what they do, in the order the Built-ins panel lists them. */
export const BUILTIN_CATEGORIES = [
	{ label: 'Angles', names: ['radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan'] },
	{ label: 'Powers', names: ['pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt'] },
	{ label: 'Rounding and limits', names: ['abs', 'sign', 'floor', 'ceil', 'fract', 'mod', 'min', 'max', 'clamp'] },
	{ label: 'Blending', names: ['mix', 'step', 'smoothstep'] },
	{ label: 'Vectors', names: ['length', 'distance', 'dot', 'cross', 'normalize', 'faceforward', 'reflect', 'refract', 'matrixCompMult'] },
	{ label: 'Comparisons', names: ['lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual', 'equal', 'notEqual', 'any', 'all', 'not'] },
	{ label: 'Textures', names: ['texture2D', 'textureCube', 'texture2DProj', 'texture2DLodEXT', 'texture2DProjLodEXT', 'textureCubeLodEXT', 'texture2DGradEXT', 'textureCubeGradEXT'] },
	{ label: 'Pixel derivatives', names: ['dFdx', 'dFdy', 'fwidth'] },
] as const;

/** Every documented function, the WebGL 2 only ones included so the editor still recognizes them. */
export const BUILTIN_FUNCTION_NAMES = [
	...BUILTIN_CATEGORIES.flatMap((category) => category.names),
	'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'trunc', 'round', 'roundEven', 'modf', 'isnan', 'isinf',
	'outerProduct', 'transpose', 'determinant', 'inverse', 'texture2DLod', 'textureCubeLod', 'texture2DProjLod',
];

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

const ES3_ONLY = 'Only exists in WebGL 2 shaders (GLSL ES 3.00).';
const VERTEX_LOD = 'Only works in vertex shaders, use the `EXT` version instead (`texture2DLodEXT`, `textureCubeLodEXT`).';
const DERIVATIVES = 'GL_OES_standard_derivatives';
const TEXTURE_LOD = 'GL_EXT_shader_texture_lod';

export const BUILTIN_DOCS: Record<string, GlslDoc> = {
	// Angles
	radians: {
		signature: 'genType radians(genType degrees)',
		description: 'Turns degrees into radians.',
		examples: ['float a = radians(90.0);  // 1.5708'],
	},
	degrees: {
		signature: 'genType degrees(genType radians)',
		description: 'Turns radians into degrees.',
	},
	sin: {
		signature: 'genType sin(genType angle)',
		description: 'Sine of an angle in radians, between -1 and 1.',
		details: 'With `mediump`, big angles lose precision: if an animation starts to stutter after a while, keep the angle small with `mod(uTime, 6.2832)`.',
		examples: ['float wave = 0.5 + 0.5 * sin(uTime);  // goes back and forth between 0 and 1'],
	},
	cos: {
		signature: 'genType cos(genType angle)',
		description: 'Cosine of an angle in radians, between -1 and 1.',
		examples: ['vec3 rainbow = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0.0, 2.0, 4.0));'],
	},
	tan: {
		signature: 'genType tan(genType angle)',
		description: 'Tangent of an angle in radians.',
	},
	asin: {
		signature: 'genType asin(genType x)',
		description: 'Angle whose sine is *x*, between -π/2 and π/2.',
		details: 'Gives garbage when *x* is outside -1..1.',
	},
	acos: {
		signature: 'genType acos(genType x)',
		description: 'Angle whose cosine is *x*, between 0 and π.',
		details: 'Gives garbage when *x* is outside -1..1, `acos(clamp(dot(a, b), -1.0, 1.0))` stays safe.',
	},
	atan: {
		signature: 'genType atan(genType y, genType x)\ngenType atan(genType y_over_x)',
		description: 'Angle of the point *(x, y)*, between -π and π.',
		details: 'With a single argument (`y / x`) it only goes from -π/2 to π/2. Gives garbage when *x* and *y* are both 0.',
		params: { x: 'Horizontal position.', y: 'Vertical position.', y_over_x: 'The ratio `y / x`.' },
		examples: ['float angle = atan(uv.y, uv.x);  // angle around the center'],
	},
	sinh: { signature: 'genType sinh(genType x)', description: 'Hyperbolic sine: `(exp(x) - exp(-x)) / 2`.', unavailable: ES3_ONLY },
	cosh: { signature: 'genType cosh(genType x)', description: 'Hyperbolic cosine: `(exp(x) + exp(-x)) / 2`.', unavailable: ES3_ONLY },
	tanh: { signature: 'genType tanh(genType x)', description: 'Hyperbolic tangent: `sinh(x) / cosh(x)`.', unavailable: ES3_ONLY },
	asinh: { signature: 'genType asinh(genType x)', description: 'Inverse of `sinh`.', unavailable: ES3_ONLY },
	acosh: { signature: 'genType acosh(genType x)', description: 'Inverse of `cosh`.', unavailable: ES3_ONLY },
	atanh: { signature: 'genType atanh(genType x)', description: 'Inverse of `tanh`.', unavailable: ES3_ONLY },

	// Powers
	pow: {
		signature: 'genType pow(genType x, genType y)',
		description: '*x* to the power *y*.',
		details: 'Gives garbage when *x* is negative. For small fixed powers, `x * x` is faster than `pow(x, 2.0)`.',
		params: { x: 'Base, 0 or more.', y: 'Power.' },
		examples: ['vec3 corrected = pow(color, vec3(1.0 / 2.2));  // gamma correction'],
	},
	exp: { signature: 'genType exp(genType x)', description: 'The number *e* (2.718…) to the power *x*.', examples: ['float fog = exp(-distance * 0.1);  // fades with distance'] },
	log: { signature: 'genType log(genType x)', description: 'Natural logarithm, the inverse of `exp`.', details: '*x* must be above 0.' },
	exp2: { signature: 'genType exp2(genType x)', description: '2 to the power *x*, very fast.' },
	log2: { signature: 'genType log2(genType x)', description: 'Base 2 logarithm, the inverse of `exp2`.', details: '*x* must be above 0.' },
	sqrt: { signature: 'genType sqrt(genType x)', description: 'Square root.', details: '*x* must be 0 or more.' },
	inversesqrt: { signature: 'genType inversesqrt(genType x)', description: '`1.0 / sqrt(x)` in one fast step.', details: '*x* must be above 0.' },

	// Rounding and limits
	abs: { signature: 'genType abs(genType x)', description: 'Removes the minus sign.', examples: ['float d = abs(p.x) - 0.5;  // mirrors the shape around the vertical axis'] },
	sign: { signature: 'genType sign(genType x)', description: '-1.0, 0.0 or 1.0 depending on the sign of *x*.' },
	floor: { signature: 'genType floor(genType x)', description: 'Rounds down.', examples: ['vec2 cell = floor(uv * 10.0);  // which cell of a 10×10 grid'] },
	ceil: { signature: 'genType ceil(genType x)', description: 'Rounds up.' },
	fract: {
		signature: 'genType fract(genType x)',
		description: 'Part after the decimal point, between 0 and 1.',
		details: 'Same as `x - floor(x)`, so `fract(-0.25)` gives 0.75.',
		examples: ['vec2 local = fract(uv * 10.0);  // position inside each grid cell'],
	},
	trunc: { signature: 'genType trunc(genType x)', description: 'Rounds toward zero.', unavailable: ES3_ONLY },
	round: { signature: 'genType round(genType x)', description: 'Rounds to the nearest whole number.', unavailable: ES3_ONLY },
	roundEven: { signature: 'genType roundEven(genType x)', description: 'Rounds to the nearest whole number, halves go to the even one.', unavailable: ES3_ONLY },
	mod: {
		signature: 'genType mod(genType x, float y)\ngenType mod(genType x, genType y)',
		description: 'Remainder of *x* / *y*, with the sign of *y*.',
		details: 'Unlike `%` in C, `mod(-1.0, 3.0)` gives 2.0. The `%` operator doesn\'t exist in WebGL 1 shaders.',
		examples: ['vec2 tile = mod(p, 2.0) - 1.0;  // repeats space every 2 units'],
	},
	modf: { signature: 'genType modf(genType x, out genType i)', description: 'Splits *x* into its whole part (stored in *i*) and the rest (returned).', unavailable: ES3_ONLY },
	min: {
		signature: 'genType min(genType x, genType y)\ngenType min(genType x, float y)',
		description: 'Smaller of *x* and *y*, for each component.',
		examples: ['float d = min(sdSphere(p), sdBox(p));  // merges two shapes'],
	},
	max: {
		signature: 'genType max(genType x, genType y)\ngenType max(genType x, float y)',
		description: 'Larger of *x* and *y*, for each component.',
		examples: ['float light = max(dot(normal, lightDir), 0.0);'],
	},
	clamp: {
		signature: 'genType clamp(genType x, genType minVal, genType maxVal)\ngenType clamp(genType x, float minVal, float maxVal)',
		description: 'Keeps *x* between *minVal* and *maxVal*.',
		details: 'Same as `min(max(x, minVal), maxVal)`. Gives garbage when *minVal* is bigger than *maxVal*.',
		params: { maxVal: 'Highest allowed value.', minVal: 'Lowest allowed value.', x: 'Value to limit.' },
		examples: ['float v = clamp(2.5, 0.0, 1.0);  // 1.0', 'vec3 c = clamp(color, 0.0, 1.0);'],
	},
	isnan: { signature: 'genBType isnan(genType x)', description: 'True when *x* is not a number (NaN).', unavailable: ES3_ONLY },
	isinf: { signature: 'genBType isinf(genType x)', description: 'True when *x* is infinite.', unavailable: ES3_ONLY },

	// Blending
	mix: {
		signature: 'genType mix(genType x, genType y, genType a)\ngenType mix(genType x, genType y, float a)',
		description: 'Blends from *x* to *y*: 0 gives *x*, 1 gives *y*, 0.5 the middle.',
		details: 'Computes `x * (1.0 - a) + y * a`.',
		params: { a: 'How far to go from *x* to *y*.', x: 'Start value.', y: 'End value.' },
		examples: ['float v = mix(2.0, 4.0, 0.25);  // 2.5', 'vec3 sky = mix(bottomColor, topColor, uv.y);'],
	},
	step: {
		signature: 'genType step(genType edge, genType x)\ngenType step(float edge, genType x)',
		description: '0.0 when *x* is below *edge*, 1.0 otherwise.',
		params: { edge: 'Limit.', x: 'Value compared to the limit.' },
		examples: ['float inside = step(length(uv), 0.5);  // sharp disc'],
	},
	smoothstep: {
		signature: 'genType smoothstep(genType edge0, genType edge1, genType x)\ngenType smoothstep(float edge0, float edge1, genType x)',
		description: 'Goes smoothly from 0 to 1 while *x* goes from *edge0* to *edge1*.',
		details: 'Gives garbage when *edge0* is not smaller than *edge1*. For a curve going down, write `1.0 - smoothstep(a, b, x)`.',
		params: { edge0: 'Where the curve starts going up.', edge1: 'Where the curve reaches 1.', x: 'Input value.' },
		examples: ['float disc = 1.0 - smoothstep(0.49, 0.5, length(uv));  // disc with soft edges'],
	},

	// Vectors
	length: { signature: 'float length(genType x)', description: 'Length of a vector.', examples: ['float d = length(p) - radius;  // distance to a sphere'] },
	distance: {
		signature: 'float distance(genType p0, genType p1)',
		description: 'Distance between two points, same as `length(p0 - p1)`.',
		examples: ['float d = distance(vec2(0.0), vec2(3.0, 4.0));  // 5.0'],
	},
	dot: {
		signature: 'float dot(genType x, genType y)',
		description: 'Multiplies the components one by one and adds the results.',
		details: 'For two vectors of length 1 it gives the cosine of the angle between them. `dot(v, v)` is the length squared, faster than `length(v)` when you only compare distances.',
		examples: ['float light = max(dot(normal, lightDir), 0.0);'],
	},
	cross: { signature: 'vec3 cross(vec3 x, vec3 y)', description: 'Vector perpendicular to both *x* and *y*.' },
	normalize: {
		signature: 'genType normalize(genType x)',
		description: 'Same direction as *x*, with a length of 1.',
		details: 'Gives garbage for a vector of length 0.',
		examples: ['vec3 rayDir = normalize(vec3(uv, 1.0));'],
	},
	faceforward: {
		signature: 'genType faceforward(genType N, genType I, genType Nref)',
		description: 'Flips *N* so it faces the viewer: *N* when `dot(Nref, I) < 0`, otherwise `-N`.',
		params: { I: 'Direction of the incoming ray.', N: 'Normal to flip.', Nref: 'Normal used for the test.' },
	},
	reflect: {
		signature: 'genType reflect(genType I, genType N)',
		description: 'Bounces *I* off a surface like a mirror.',
		params: { I: 'Direction of the incoming ray.', N: 'Surface normal, length 1.' },
		examples: ['vec3 bounce = reflect(rayDir, normal);'],
	},
	refract: {
		signature: 'genType refract(genType I, genType N, float eta)',
		description: 'Bends *I* as it goes through a surface like glass or water.',
		details: 'Returns a zero vector when the ray can\'t get through the surface.',
		params: { eta: 'Ratio between the two materials, `1.0 / 1.33` from air into water.', I: 'Direction of the incoming ray, length 1.', N: 'Surface normal, length 1.' },
	},
	matrixCompMult: { signature: 'matN matrixCompMult(matN x, matN y)', description: 'Multiplies two matrices cell by cell, `x * y` is the real matrix product.' },
	outerProduct: { signature: 'matNxM outerProduct(vecM c, vecN r)', description: 'Matrix built from a column and a row vector.', unavailable: ES3_ONLY },
	transpose: { signature: 'matN transpose(matN m)', description: 'Swaps the rows and columns of a matrix.', unavailable: ES3_ONLY },
	determinant: { signature: 'float determinant(matN m)', description: 'Determinant of a matrix.', unavailable: ES3_ONLY },
	inverse: { signature: 'matN inverse(matN m)', description: 'Inverse of a matrix.', unavailable: ES3_ONLY },

	// Comparisons
	lessThan: { signature: 'bvecN lessThan(vecN x, vecN y)\nbvecN lessThan(ivecN x, ivecN y)', description: '`x < y` for each component.' },
	lessThanEqual: { signature: 'bvecN lessThanEqual(vecN x, vecN y)\nbvecN lessThanEqual(ivecN x, ivecN y)', description: '`x <= y` for each component.' },
	greaterThan: { signature: 'bvecN greaterThan(vecN x, vecN y)\nbvecN greaterThan(ivecN x, ivecN y)', description: '`x > y` for each component.' },
	greaterThanEqual: { signature: 'bvecN greaterThanEqual(vecN x, vecN y)\nbvecN greaterThanEqual(ivecN x, ivecN y)', description: '`x >= y` for each component.' },
	equal: { signature: 'bvecN equal(vecN x, vecN y)\nbvecN equal(ivecN x, ivecN y)\nbvecN equal(bvecN x, bvecN y)', description: '`x == y` for each component.' },
	notEqual: { signature: 'bvecN notEqual(vecN x, vecN y)\nbvecN notEqual(ivecN x, ivecN y)\nbvecN notEqual(bvecN x, bvecN y)', description: '`x != y` for each component.' },
	any: { signature: 'bool any(bvecN x)', description: 'True when at least one component is true.' },
	all: { signature: 'bool all(bvecN x)', description: 'True when every component is true.' },
	not: { signature: 'bvecN not(bvecN x)', description: 'Flips each component, true becomes false.' },

	// Textures
	texture2D: {
		signature: 'vec4 texture2D(sampler2D sampler, vec2 coord)\nvec4 texture2D(sampler2D sampler, vec2 coord, float bias)',
		description: 'Reads a color from a 2D texture.',
		details: '`(0, 0)` is the bottom-left corner and `(1, 1)` the top-right one, outside of that the wrap mode of the channel decides.',
		params: { bias: 'Positive values give a blurrier read.', coord: 'Position in the texture, from 0 to 1.', sampler: 'Texture to read: a channel or a buffer.' },
		examples: ['vec2 uv = gl_FragCoord.xy / uResolution;', 'vec4 previous = texture2D(uBufferA, uv);'],
	},
	textureCube: {
		signature: 'vec4 textureCube(samplerCube sampler, vec3 coord)\nvec4 textureCube(samplerCube sampler, vec3 coord, float bias)',
		description: 'Reads a color from a cube map, in a direction.',
		params: { bias: 'Positive values give a blurrier read.', coord: 'Direction to look at, its length doesn\'t matter.', sampler: 'Cube map to read.' },
	},
	texture2DProj: {
		signature: 'vec4 texture2DProj(sampler2D sampler, vec3 coord)\nvec4 texture2DProj(sampler2D sampler, vec4 coord)\nvec4 texture2DProj(sampler2D sampler, vec3 coord, float bias)\nvec4 texture2DProj(sampler2D sampler, vec4 coord, float bias)',
		description: 'Like `texture2D`, but divides *coord.xy* by the last component of *coord* first.',
	},
	texture2DLod: { signature: 'vec4 texture2DLod(sampler2D sampler, vec2 coord, float lod)', description: 'Reads a 2D texture at a chosen blur level.', unavailable: VERTEX_LOD },
	textureCubeLod: { signature: 'vec4 textureCubeLod(samplerCube sampler, vec3 coord, float lod)', description: 'Reads a cube map at a chosen blur level.', unavailable: VERTEX_LOD },
	texture2DProjLod: { signature: 'vec4 texture2DProjLod(sampler2D sampler, vec3 coord, float lod)', description: 'Like `texture2DProj`, at a chosen blur level.', unavailable: VERTEX_LOD },
	texture2DLodEXT: {
		signature: 'vec4 texture2DLodEXT(sampler2D sampler, vec2 coord, float lod)',
		description: 'Reads a 2D texture at a chosen blur level (mipmap).',
		extension: TEXTURE_LOD,
		params: { coord: 'Position in the texture, from 0 to 1.', lod: 'Blur level, 0 is the sharpest.', sampler: 'Texture to read.' },
	},
	texture2DProjLodEXT: {
		signature: 'vec4 texture2DProjLodEXT(sampler2D sampler, vec3 coord, float lod)\nvec4 texture2DProjLodEXT(sampler2D sampler, vec4 coord, float lod)',
		description: 'Like `texture2DProj`, at a chosen blur level.',
		extension: TEXTURE_LOD,
	},
	textureCubeLodEXT: {
		signature: 'vec4 textureCubeLodEXT(samplerCube sampler, vec3 coord, float lod)',
		description: 'Reads a cube map at a chosen blur level.',
		extension: TEXTURE_LOD,
	},
	texture2DGradEXT: {
		signature: 'vec4 texture2DGradEXT(sampler2D sampler, vec2 P, vec2 dPdx, vec2 dPdy)',
		description: 'Reads a 2D texture, you give how fast the position changes per pixel and the GPU picks the blur level from it.',
		extension: TEXTURE_LOD,
		params: { dPdx: 'Change of *P* from one pixel to the next horizontally.', dPdy: 'Change of *P* from one pixel to the next vertically.', P: 'Position in the texture, from 0 to 1.' },
	},
	textureCubeGradEXT: {
		signature: 'vec4 textureCubeGradEXT(samplerCube sampler, vec3 P, vec3 dPdx, vec3 dPdy)',
		description: 'Like `texture2DGradEXT`, for a cube map.',
		extension: TEXTURE_LOD,
	},

	// Pixel derivatives
	dFdx: {
		signature: 'genType dFdx(genType p)',
		description: 'How much *p* changes from this pixel to the next one horizontally.',
		extension: DERIVATIVES,
		details: 'Pixels are computed in 2×2 groups, so it can give garbage inside an `if` that only some of them take.',
	},
	dFdy: {
		signature: 'genType dFdy(genType p)',
		description: 'How much *p* changes from this pixel to the next one vertically.',
		extension: DERIVATIVES,
	},
	fwidth: {
		signature: 'genType fwidth(genType p)',
		description: 'How much *p* changes over one pixel, `abs(dFdx(p)) + abs(dFdy(p))`.',
		extension: DERIVATIVES,
		examples: ['float edge = fwidth(d);', 'float alpha = 1.0 - smoothstep(-edge, edge, d);  // smooth edges at any zoom'],
	},

	// Built-in variables
	gl_Position: { signature: 'vec4 gl_Position', description: '*(Vertex shaders)* Output position of the vertex.' },
	gl_PointSize: { signature: 'float gl_PointSize', description: '*(Vertex shaders)* Size of a point in pixels.' },
	gl_FragCoord: {
		signature: 'vec4 gl_FragCoord',
		description: '*(read-only)* Position of the current pixel: `.xy` in pixels from the bottom-left corner, at the pixel center (0.5, 1.5, …).',
		details: '`.z` and `.w` hold depth values, not useful for a fullscreen shader.',
		examples: ['vec2 uv = gl_FragCoord.xy / uResolution;  // 0 to 1 across the canvas', 'vec2 p = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;  // centered, not stretched'],
	},
	gl_FragColor: {
		signature: 'vec4 gl_FragColor',
		description: 'Color of the current pixel, as red, green, blue, alpha from 0 to 1.',
		details: 'Buffers keep values outside 0..1 between frames when the GPU supports float textures.',
	},
	gl_FrontFacing: { signature: 'bool gl_FrontFacing', description: '*(read-only)* Always true here, Shayders draws one flat rectangle.' },
	gl_PointCoord: { signature: 'vec2 gl_PointCoord', description: '*(read-only)* Only works when drawing points, so it has no meaning here.' },
	gl_FragData: { signature: 'vec4 gl_FragData[gl_MaxDrawBuffers]', description: 'Several outputs at once, only `gl_FragData[0]` works without `GL_EXT_draw_buffers`.' },
};

/** Uniforms Shayders feeds every frame, a shader only needs to declare the ones it reads. */
export const UNIFORM_DOCS: Record<string, { signature: string; description: string }> = {
	uTime: { signature: 'uniform float uTime', description: 'Seconds since the shader started, reset by Run.' },
	uResolution: { signature: 'uniform vec2 uResolution', description: 'Canvas size in pixels (width, height).' },
	uMouse: { signature: 'uniform vec3 uMouse', description: 'Mouse position in pixels from the bottom-left corner, like `gl_FragCoord`. `z` is 1.0 while a button is held.' },
	uDate: { signature: 'uniform vec4 uDate', description: 'Today\'s date: year, month (1-12), day (1-31), seconds since midnight.' },
	uFrameRate: { signature: 'uniform float uFrameRate', description: 'Frames per second, averaged over the last frames.' },
	uDeltaTime: { signature: 'uniform float uDeltaTime', description: 'Seconds since the previous frame.' },
	uFrameCount: { signature: 'uniform int uFrameCount', description: 'Frames drawn since the shader started, 1 on the first one. Handy to set up a buffer on the first frame.' },
	uAspect: { signature: 'uniform float uAspect', description: 'Width divided by height of the canvas.' },
	uChannel0: { signature: 'uniform sampler2D uChannel0', description: 'Texture of channel 0: an image, a video, the webcam or a buffer.' },
	uChannel1: { signature: 'uniform sampler2D uChannel1', description: 'Texture of channel 1: an image, a video, the webcam or a buffer.' },
	uChannel2: { signature: 'uniform sampler2D uChannel2', description: 'Texture of channel 2: an image, a video, the webcam or a buffer.' },
	uChannel3: { signature: 'uniform sampler2D uChannel3', description: 'Texture of channel 3: an image, a video, the webcam or a buffer.' },
	uBufferA: { signature: 'uniform sampler2D uBufferA', description: 'Image drawn by Buffer A, read it with `texture2D(uBufferA, gl_FragCoord.xy / uResolution)`.' },
	uBufferB: { signature: 'uniform sampler2D uBufferB', description: 'Image drawn by Buffer B, read it with `texture2D(uBufferB, gl_FragCoord.xy / uResolution)`.' },
	uBufferC: { signature: 'uniform sampler2D uBufferC', description: 'Image drawn by Buffer C, read it with `texture2D(uBufferC, gl_FragCoord.xy / uResolution)`.' },
	uBufferD: { signature: 'uniform sampler2D uBufferD', description: 'Image drawn by Buffer D, read it with `texture2D(uBufferD, gl_FragCoord.xy / uResolution)`.' },
};

export const BUILTIN_VARIABLE_DOC_ENTRIES = Object.entries(BUILTIN_DOCS).filter(
	([name]) => BUILTIN_VARIABLE_NAMES_FRAGMENT.includes(name as (typeof BUILTIN_VARIABLE_NAMES_FRAGMENT)[number])
);
