import { defaultBufferShader, defaultCommonCode, defaultImageShader } from '$features/shaders/model/default-shaders';
import { BUFFER_UNIFORM_NAMES } from '$features/shaders/model/shader-domain';
import { createEmptyChannels, type ChannelEntry, type ShaderBuffer } from '$features/shaders/model/shader-content';
import { addUniformLine, removeUniformLine } from './uniforms';

export const DEFAULT_IMAGE_BUFFER = {
	code: defaultImageShader,
	id: 'image',
	label: 'Image',
} as const satisfies ShaderBuffer;

export function addCommonBuffer(buffers: ShaderBuffer[]): ShaderBuffer[] {
	const nextBuffers = [...buffers];
	nextBuffers.splice(nextBuffers.findIndex((buffer) => buffer.id === 'image'), 0, {
		code: defaultCommonCode,
		id: 'common',
		label: 'Common',
	});
	return nextBuffers;
}

export function addUserBuffer(buffers: ShaderBuffer[]): { activeBufferId: string; buffers: ShaderBuffer[] } {
	const nextIndex = findNextBufferIndex(buffers);
	const nextId = `buf${nextIndex}`;
	const newUniformName = BUFFER_UNIFORM_NAMES[listUserBuffers(buffers).length];

	return {
		activeBufferId: nextId,
		buffers: [
			...buffers.map((buffer) => (
				buffer.id === 'common'
					? buffer
					: { ...buffer, code: addUniformLine(buffer.code, newUniformName, 'sampler2D') }
			)),
			{ code: defaultBufferShader, id: nextId, label: `Buffer ${nextIndex}` },
		],
	};
}

export function applyChannelUniform(buffers: ShaderBuffer[], channelId: number, isActive: boolean): ShaderBuffer[] {
	const uniformName = `uChannel${channelId}`;
	return buffers.map((buffer) => {
		if (buffer.id === 'common') return buffer;
		return {
			...buffer,
			code: isActive
				? addUniformLine(buffer.code, uniformName, 'sampler2D')
				: removeUniformLine(buffer.code, uniformName),
		};
	});
}

export function duplicateBufferAfter(buffers: ShaderBuffer[], id: string): { activeBufferId: string; buffers: ShaderBuffer[] } {
	const source = buffers.find((buffer) => buffer.id === id);
	if (!source) return { activeBufferId: id, buffers };

	const activeBufferId = `buf${findNextBufferIndex(buffers)}`;
	const nextBuffers = [...buffers];
	nextBuffers.splice(nextBuffers.findIndex((buffer) => buffer.id === id) + 1, 0, {
		code: source.code,
		id: activeBufferId,
		label: `${source.label} copy`,
	});
	return { activeBufferId, buffers: nextBuffers };
}

export function resolveInitialBuffers(initialBuffers?: ShaderBuffer[]): ShaderBuffer[] {
	return initialBuffers?.length ? initialBuffers : [{ ...DEFAULT_IMAGE_BUFFER }];
}

export function resolveInitialChannels(initialChannels?: ChannelEntry[]): ChannelEntry[] {
	return initialChannels?.length ? initialChannels.map((channel) => ({ ...channel })) : createEmptyChannels();
}

export function removeUserBuffer(
	buffers: ShaderBuffer[],
	activeBufferId: string,
	id: string,
): { activeBufferId: string; buffers: ShaderBuffer[] } {
	const userBuffers = listUserBuffers(buffers);
	const removedIndex = userBuffers.findIndex((buffer) => buffer.id === id);
	const removedUniform = removedIndex >= 0 ? BUFFER_UNIFORM_NAMES[removedIndex] : null;

	return {
		activeBufferId: activeBufferId === id ? 'image' : activeBufferId,
		buffers: buffers
			.filter((buffer) => buffer.id !== id)
			.map((buffer) => {
				if (buffer.id === 'common' || !removedUniform) return buffer;
				return { ...buffer, code: removeUniformLine(buffer.code, removedUniform) };
			}),
	};
}

export function withLatestBufferCode(
	buffers: ShaderBuffer[],
	activeBufferId: string,
	editorValue: string,
): ShaderBuffer[] {
	return buffers.map((buffer) => (
		buffer.id === activeBufferId ? { ...buffer, code: editorValue } : buffer
	));
}

function findNextBufferIndex(buffers: ShaderBuffer[]): number {
	let nextIndex = 1;
	while (buffers.some((buffer) => buffer.id === `buf${nextIndex}`)) nextIndex += 1;
	return nextIndex;
}

function listUserBuffers(buffers: ShaderBuffer[]): ShaderBuffer[] {
	return buffers.filter((buffer) => buffer.id !== 'common' && buffer.id !== 'image');
}


