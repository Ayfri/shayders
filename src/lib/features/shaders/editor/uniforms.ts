import { UNIFORM_DOCS } from '#lib/glsl/builtins.js';
import { BUFFER_UNIFORM_NAMES } from '#features/shaders/model/shader-domain.js';
import type { ShaderBuffer } from '#features/shaders/model/shader-content.js';

export interface UniformDescriptor {
	description?: string;
	name: string;
	type: string;
}

export const UNIFORM_CATALOG_BASE = [
	{ name: 'uAspect', type: 'float' },
	{ name: 'uChannel0', type: 'sampler2D' },
	{ name: 'uChannel1', type: 'sampler2D' },
	{ name: 'uChannel2', type: 'sampler2D' },
	{ name: 'uChannel3', type: 'sampler2D' },
	{ name: 'uDate', type: 'vec4' },
	{ name: 'uDeltaTime', type: 'float' },
	{ name: 'uFrameCount', type: 'int' },
	{ name: 'uFrameRate', type: 'float' },
	{ name: 'uMouse', type: 'vec3' },
	{ name: 'uResolution', type: 'vec2' },
	{ name: 'uTime', type: 'float' },
] as const satisfies readonly UniformDescriptor[];

export function addUniformLine(code: string, name: string, type: string): string {
	if (new RegExp(`\\buniform\\s+\\S+\\s+${name}\\s*;`).test(code)) return code;

	const line = `uniform ${type} ${name};`;
	const lines = code.split('\n');
	let insertAt = 0;
	let lastPrecision = -1;
	let lastUniform = -1;

	for (let i = 0; i < lines.length; i += 1) {
		if (/^\s*precision\s/.test(lines[i])) lastPrecision = i;
		if (/^\s*uniform\s/.test(lines[i])) lastUniform = i;
	}

	if (lastUniform >= 0) insertAt = lastUniform + 1;
	else if (lastPrecision >= 0) insertAt = lastPrecision + 1;

	lines.splice(insertAt, 0, line);
	return lines.join('\n');
}

/** Lists every known uniform sorted by name, live values are looked up separately so this only reruns on code edits. */
export function buildUniformCatalog(buffers: ShaderBuffer[], code: string): UniformDescriptor[] {
	const catalog: UniformDescriptor[] = [...UNIFORM_CATALOG_BASE];
	const userBuffers = buffers.filter((buffer) => buffer.id !== 'common' && buffer.id !== 'image');
	const knownNames = new Set<string>(catalog.map(({ name }) => name));

	userBuffers.forEach((buffer, index) => {
		const name = BUFFER_UNIFORM_NAMES[index];
		if (!name) return;

		catalog.push({
			description: `Image drawn by "${buffer.label}", read it with \`texture2D(${name}, gl_FragCoord.xy / uResolution)\`.`,
			name,
			type: 'sampler2D',
		});
		knownNames.add(name);
	});

	for (const uniform of parseUniforms(code)) {
		if (knownNames.has(uniform.name)) continue;
		catalog.push(uniform);
		knownNames.add(uniform.name);
	}

	return catalog
		.map(({ description, name, type }) => ({ description: description ?? UNIFORM_DOCS[name]?.description, name, type }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseUniforms(code: string): UniformDescriptor[] {
	const regex = /^\s*uniform\s+(\w+)\s+(\w+)\s*;/gm;
	const results: UniformDescriptor[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(code)) !== null) {
		results.push({ name: match[2], type: match[1] });
	}

	return results;
}

export function removeUniformLine(code: string, name: string): string {
	return code.replace(
		new RegExp(`[ \\t]*uniform\\s+\\S+\\s+${name}\\s*;[ \\t]*\\n?`, 'm'),
		'',
	);
}

