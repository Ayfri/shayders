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
	[/\buvec4\b/g, 'ivec4'],
	[/\buvec3\b/g, 'ivec3'],
	[/\buvec2\b/g, 'ivec2'],
	[/\buint\b/g, 'int'],
];

// iMouse in Shadertoy is vec4(x, y, clickX, clickY)
// uMouse in shayders is vec3(x, y, pressed)
const IMOUSE_REPLACEMENT = 'vec4(uMouse.xy, uMouse.z > 0.5 ? uMouse.xy : vec2(0.0))';

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
	result = result.replace(/^[ \t]*uniform\s+\S+\s+i[A-Z][A-Za-z0-9]*\s*;[^\n]*/gm, '');

	// Replace Shadertoy uniforms with our uniforms (order matters: longer names first)
	for (const [pattern, replacement] of UNIFORM_MAP) {
		result = result.replace(pattern, replacement);
	}

	for (const [pattern, replacement] of UNSIGNED_TYPE_MAP) {
		result = result.replace(pattern, replacement);
	}

	// Drop the unsigned literal suffix used by Shadertoy shaders.
	result = result.replace(/\b(0[xX][0-9a-fA-F]+|\d+)\s*[uU]\b/g, '$1');

	// iMouse is a vec4 in Shadertoy, our uMouse is vec3 — emit a compatible vec4 expression
	result = result.replace(/\biMouse\b/g, IMOUSE_REPLACEMENT);

	// texture() is GLSL ES 3.0 — WebGL 1 requires texture2D() for sampler2D
	result = result.replace(/\btexture\s*\(/g, 'texture2D(');

	// Detect which channel samplers are actually used and emit their declarations
	const channelDecls = CHANNEL_UNIFORM_NAMES.filter((ch) => new RegExp(`\\b${ch}\\b`).test(result))
		.map((ch) => `uniform sampler2D ${ch};`)
		.join('\n');

	// Build header
	let header = UNIFORM_HEADER;
	if (channelDecls) header += '\n' + channelDecls;

	// Add the header if no precision declaration is present
	if (!/precision\s+\w+\s+float/.test(result)) {
		result = header + '\n\n' + result.trim();
	} else {
		// Inject channel declarations right after the existing precision line
		if (channelDecls) {
			result = result.replace(
				/(precision\s+\w+\s+float\s*;)/,
				`$1\n${channelDecls}`
			);
		}
		result = result.trim();
	}

	// Replace mainImage function signature and parameters
	// Extract parameter names: void mainImage(out vec4 fragColor, in vec2 fragCoord)
	const mainImageRegex = /void\s+mainImage\s*\(\s*out\s+vec4\s+(\w+)\s*,\s*in\s+vec2\s+(\w+)\s*\)/;
	const match = result.match(mainImageRegex);

	if (match) {
		const fragColorVar = match[1];
		const fragCoordVar = match[2];

		// Replace function signature
		result = result.replace(mainImageRegex, 'void main()');

		// Replace all occurrences of the parameter names with the built-in variables
		result = result.replace(new RegExp(`\\b${fragColorVar}\\b`, 'g'), 'gl_FragColor');
		result = result.replace(new RegExp(`\\b${fragCoordVar}\\b`, 'g'), 'gl_FragCoord.xy');
	}

	return result;
}
