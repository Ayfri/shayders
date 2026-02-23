<script lang="ts">
	import { onMount } from 'svelte';
	import type { ShaderBuffer } from '$lib/components/ShaderCanvas.svelte';

	interface Props {
		buffers: ShaderBuffer[];
		shaderId: string;
		name: string;
	}

	let { buffers, shaderId, name }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let isHovered = $state(false);
	let mouseX = $state(0);
	let mouseY = $state(0);

	let gl: WebGLRenderingContext | null = null;
	let program: WebGLProgram | null = null;
	let frameCount = 0;
	let freezeTime = 0;
	let startTime = Date.now();

	const BUFFER_NAMES = ['uBufferA', 'uBufferB', 'uBufferC', 'uBufferD'];

	function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader | null {
		const shader = gl.createShader(type);
		if (!shader) return null;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error('Shader error:', gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}

	function createProgram(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram | null {
		const vertexSrc = `
			precision highp float;
			attribute vec2 position;
			void main() { gl_Position = vec4(position, 0.0, 1.0); }
		`;
		const vs = compileShader(gl, vertexSrc, gl.VERTEX_SHADER);
		const fs = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);

		if (!vs || !fs) return null;

		const prog = gl.createProgram();
		if (!prog) return null;

		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);

		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error('Program error:', gl.getProgramInfoLog(prog));
			return null;
		}

		gl.deleteShader(vs);
		gl.deleteShader(fs);
		return prog;
	}

	onMount(() => {
		if (!canvas) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		canvas.width = w;
		canvas.height = h;

		gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
		if (!gl) return;

		const imageBuffer = buffers.find((b) => b.id === 'image');
		if (!imageBuffer) return;

		program = createProgram(gl, imageBuffer.code);
		if (!program) return;

		const posLoc = gl.getAttribLocation(program, 'position');
		const vao = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vao);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(posLoc);

		const animate = () => {
			if (!gl || !program) return requestAnimationFrame(animate);

			const now = Date.now();
			const elapsed = (now - startTime) / 1000;
			const time = isHovered ? elapsed : freezeTime;

			if (!isHovered && frameCount === 0) {
				freezeTime = elapsed;
			}

			gl.useProgram(program);
			gl.uniform1f(gl.getUniformLocation(program, 'uTime'), time);
			gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), w, h);
			gl.uniform3f(
				gl.getUniformLocation(program, 'uMouse'),
				isHovered ? mouseX : -1,
				isHovered ? mouseY : -1,
				isHovered ? 1 : 0
			);
			gl.uniform1i(gl.getUniformLocation(program, 'uFrameCount'), frameCount);
			gl.uniform1f(gl.getUniformLocation(program, 'uAspect'), w / h);

			gl.viewport(0, 0, w, h);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

			frameCount++;
			requestAnimationFrame(animate);
		};

		animate();
	});

	function handleMouseMove(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		mouseX = e.clientX - rect.left;
		mouseY = rect.height - (e.clientY - rect.top);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<canvas
	bind:this={canvas}
	class="w-full h-full block bg-black rounded cursor-pointer"
	onmouseenter={() => (isHovered = true)}
	onmouseleave={() => (isHovered = false)}
	onmousemove={handleMouseMove}
	title={name}
></canvas>
