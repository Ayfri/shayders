import { VERTEX_CODE } from './gl-utils.js';

export type CompileResult = { error: string; program: null } | { error: ''; program: WebGLProgram };

interface PendingCompile {
	fragment: WebGLShader;
	program: WebGLProgram;
	resolve: (result: CompileResult) => void;
}

/**
 * Compiles fragment programs without stalling the page when `KHR_parallel_shader_compile` is available (ANGLE compiles HLSL
 * on a worker thread), any status query before `COMPLETION_STATUS_KHR` reports done would block until the driver finishes.
 */
export class ProgramCompiler {
	private readonly parallel: KHR_parallel_shader_compile | null;
	private readonly pending = new Set<PendingCompile>();
	private vertex: WebGLShader | null = null;

	public constructor(private readonly gl: WebGLRenderingContext) {
		this.parallel = gl.getExtension('KHR_parallel_shader_compile');
	}

	public compile(source: string): Promise<CompileResult> {
		const { gl } = this;
		const { promise, resolve } = Promise.withResolvers<CompileResult>();
		if (!this.vertex) {
			this.vertex = gl.createShader(gl.VERTEX_SHADER);
			if (this.vertex) {
				gl.shaderSource(this.vertex, VERTEX_CODE);
				gl.compileShader(this.vertex);
			}
		}
		const fragment = gl.createShader(gl.FRAGMENT_SHADER);
		const program = gl.createProgram();
		if (!this.vertex || !fragment || !program) {
			resolve({ error: 'WebGL could not allocate a shader program', program: null });
			return promise;
		}

		gl.shaderSource(fragment, source);
		gl.compileShader(fragment);
		gl.attachShader(program, this.vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		this.pending.add({ fragment, program, resolve });
		if (!this.parallel) this.poll();
		return promise;
	}

	/** Settles every finished compile, meant to run once per frame. */
	public poll(): void {
		const { gl } = this;
		for (const job of this.pending) {
			if (this.parallel && !gl.getProgramParameter(job.program, this.parallel.COMPLETION_STATUS_KHR)) continue;
			this.pending.delete(job);
			if (gl.getProgramParameter(job.program, gl.LINK_STATUS)) {
				gl.deleteShader(job.fragment);
				job.resolve({ error: '', program: job.program });
				continue;
			}
			const error = (gl.getShaderInfoLog(job.fragment) || gl.getProgramInfoLog(job.program) || 'Unknown error').trim();
			gl.deleteShader(job.fragment);
			gl.deleteProgram(job.program);
			job.resolve({ error, program: null });
		}
	}

	/** Pending promises never settle after this, their callers are torn down with the context. */
	public destroy(): void {
		for (const job of this.pending) {
			this.gl.deleteShader(job.fragment);
			this.gl.deleteProgram(job.program);
		}
		this.pending.clear();
		if (this.vertex) this.gl.deleteShader(this.vertex);
		this.vertex = null;
	}
}
