import { BUFFER_UNIFORM_NAMES, CHANNEL_UNIFORM_NAMES } from '$features/shaders/model/shader-domain';
import type { ShaderBuffer } from '$features/shaders/model/shader-content';

export interface ProgramLocs {
	aPosition: number;
	buffers: (WebGLUniformLocation | null)[];
	channels: (WebGLUniformLocation | null)[];
	uAspect: WebGLUniformLocation | null;
	uDate: WebGLUniformLocation | null;
	uDeltaTime: WebGLUniformLocation | null;
	uFrameCount: WebGLUniformLocation | null;
	uFrameRate: WebGLUniformLocation | null;
	uMouse: WebGLUniformLocation | null;
	uResolution: WebGLUniformLocation | null;
	uTime: WebGLUniformLocation | null;
}

export interface InternalBufState {
	fbo: [WebGLFramebuffer | null, WebGLFramebuffer | null];
	locs: ProgramLocs | null;
	prevIdx: number;
	program: WebGLProgram | null;
	texture: [WebGLTexture | null, WebGLTexture | null];
}

interface StandardUniformValues {
	deltaTime?: number;
	elapsed: number;
	fps?: number;
	frameCount: number;
	height: number;
	isMouseDown: boolean;
	mouseX: number;
	mouseY: number;
	now?: Date;
	width: number;
}

interface BuildBufferStatesInput {
	buffers: ShaderBuffer[];
	commonCode: string;
	fboTextureType: number;
	gl: WebGLRenderingContext;
	height: number;
	renderOrder: string[];
	width: number;
}

interface BuildBufferStatesOutput {
	errors: string[];
	states: Map<string, InternalBufState>;
}

const VERTEX_CODE = `attribute vec4 aPosition;
void main() {
	gl_Position = aPosition;
}`;

export function buildLocs(gl: WebGLRenderingContext, program: WebGLProgram): ProgramLocs {
	return {
		aPosition: gl.getAttribLocation(program, 'aPosition'),
		buffers: BUFFER_UNIFORM_NAMES.map((name) => gl.getUniformLocation(program, name)),
		channels: CHANNEL_UNIFORM_NAMES.map((name) => gl.getUniformLocation(program, name)),
		uAspect: gl.getUniformLocation(program, 'uAspect'),
		uDate: gl.getUniformLocation(program, 'uDate'),
		uDeltaTime: gl.getUniformLocation(program, 'uDeltaTime'),
		uFrameCount: gl.getUniformLocation(program, 'uFrameCount'),
		uFrameRate: gl.getUniformLocation(program, 'uFrameRate'),
		uMouse: gl.getUniformLocation(program, 'uMouse'),
		uResolution: gl.getUniformLocation(program, 'uResolution'),
		uTime: gl.getUniformLocation(program, 'uTime'),
	};
}

export function buildProgram(
	gl: WebGLRenderingContext,
	code: string,
	label: string,
): { err: string; program: WebGLProgram | null } {
	const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_CODE);
	if (!vertex) return { err: `[${label}] vertex compile error`, program: null };

	const fragment = compileShader(gl, gl.FRAGMENT_SHADER, code);
	if (!fragment) {
		const fallback = gl.createShader(gl.FRAGMENT_SHADER);
		if (!fallback) return { err: `[${label}] fragment compile error`, program: null };
		gl.shaderSource(fallback, code);
		gl.compileShader(fallback);
		const err = gl.getShaderInfoLog(fallback) ?? 'Unknown error';
		gl.deleteShader(fallback);
		return { err: `[${label}] ${err}`, program: null };
	}

	const program = gl.createProgram();
	if (!program) return { err: `[${label}] createProgram failed`, program: null };
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		return { err: `[${label}] ${gl.getProgramInfoLog(program) ?? 'link error'}`, program: null };
	}

	return { err: '', program };
}

export function createFbo(
	gl: WebGLRenderingContext,
	width: number,
	height: number,
	textureType: number,
): { fbo: WebGLFramebuffer; texture: WebGLTexture } | null {
	const texture = gl.createTexture();
	if (!texture) return null;

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, textureType, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.bindTexture(gl.TEXTURE_2D, null);

	const fbo = gl.createFramebuffer();
	if (!fbo) {
		gl.deleteTexture(texture);
		return null;
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return { fbo, texture };
}

export function createQuadBuffer(gl: WebGLRenderingContext): WebGLBuffer | null {
	const quadBuffer = gl.createBuffer();
	if (!quadBuffer) return null;

	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	return quadBuffer;
}

export function bindBufferTextures(
	gl: WebGLRenderingContext,
	locs: ProgramLocs,
	currentTarget: string,
	order: string[],
	getBufferTexture: (id: string) => WebGLTexture | null,
): void {
	for (let index = 0; index < order.length && index < BUFFER_UNIFORM_NAMES.length; index += 1) {
		gl.activeTexture(gl.TEXTURE0 + index);
		if (order[index] === currentTarget) {
			gl.bindTexture(gl.TEXTURE_2D, null);
			continue;
		}

		const loc = locs.buffers[index];
		const texture = getBufferTexture(order[index]);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		if (loc && texture) gl.uniform1i(loc, index);
	}
}

export function applyStandardUniforms(
	gl: WebGLRenderingContext,
	locs: ProgramLocs,
	values: StandardUniformValues,
): void {
	if (locs.uTime) gl.uniform1f(locs.uTime, values.elapsed);
	if (locs.uResolution) gl.uniform2f(locs.uResolution, values.width, values.height);
	if (locs.uMouse) gl.uniform3f(locs.uMouse, values.mouseX, values.mouseY, values.isMouseDown ? 1 : 0);
	if (locs.uFrameCount) gl.uniform1i(locs.uFrameCount, values.frameCount);
	if (locs.uAspect) gl.uniform1f(locs.uAspect, values.width / values.height);
	if (locs.uFrameRate && values.fps !== undefined) gl.uniform1f(locs.uFrameRate, values.fps);
	if (locs.uDeltaTime && values.deltaTime !== undefined) gl.uniform1f(locs.uDeltaTime, values.deltaTime);

	if (locs.uDate && values.now) {
		const secondsOfDay = values.now.getHours() * 3600 + values.now.getMinutes() * 60 + values.now.getSeconds();
		gl.uniform4f(locs.uDate, values.now.getFullYear(), values.now.getMonth() + 1, values.now.getDate(), secondsOfDay);
	}
}

export function resizeBufferTextures(
	gl: WebGLRenderingContext,
	bufferStates: ReadonlyMap<string, InternalBufState>,
	width: number,
	height: number,
	textureType: number,
): void {
	for (const [id, state] of bufferStates.entries()) {
		if (id === 'image') continue;

		for (const texture of state.texture) {
			if (!texture) continue;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, textureType, null);
			gl.bindTexture(gl.TEXTURE_2D, null);
		}
	}
}

export function drawQuad(gl: WebGLRenderingContext, quadBuffer: WebGLBuffer | null, positionLocation: number): void {
	if (!quadBuffer || positionLocation < 0) return;
	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function destroyBufferStates(gl: WebGLRenderingContext, bufferStates: Map<string, InternalBufState>): void {
	for (const state of bufferStates.values()) {
		if (state.program) gl.deleteProgram(state.program);
		for (let index = 0; index < 2; index += 1) {
			if (state.fbo[index]) gl.deleteFramebuffer(state.fbo[index]);
			if (state.texture[index]) gl.deleteTexture(state.texture[index]);
		}
	}
	bufferStates.clear();
}

export function buildBufferStates(input: BuildBufferStatesInput): BuildBufferStatesOutput {
	const errors: string[] = [];
	const states = new Map<string, InternalBufState>();

	for (const id of input.renderOrder) {
		const buffer = input.buffers.find((candidate) => candidate.id === id);
		if (!buffer) continue;

		const source = input.commonCode ? `${input.commonCode}\n${buffer.code}` : buffer.code;
		const { err, program } = buildProgram(input.gl, source, buffer.label);
		if (err) errors.push(err);

		const state: InternalBufState = {
			fbo: [null, null],
			locs: program ? buildLocs(input.gl, program) : null,
			prevIdx: 0,
			program,
			texture: [null, null],
		};

		if (id !== 'image') {
			const first = createFbo(input.gl, input.width, input.height, input.fboTextureType);
			const second = createFbo(input.gl, input.width, input.height, input.fboTextureType);
			if (first) {
				state.fbo[0] = first.fbo;
				state.texture[0] = first.texture;
			}
			if (second) {
				state.fbo[1] = second.fbo;
				state.texture[1] = second.texture;
			}
		}

		states.set(id, state);
	}

	return { errors, states };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}
