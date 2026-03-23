import { BUFFER_UNIFORM_NAMES, CHANNEL_UNIFORM_NAMES } from '$features/shaders/model/shader-domain';

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

