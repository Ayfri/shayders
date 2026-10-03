/**
 * Renders `static/og-image.png` (1200x630) with headless Chrome: a live WebGL shader background, the logo and the tagline.
 * @example bun scripts/og-image.ts
 * @example CHROME_PATH="/usr/bin/chromium" bun scripts/og-image.ts
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const WIDTH = 1200;
const HEIGHT = 630;
const ROOT = resolve(import.meta.dir, '..');
const OUTPUT = join(ROOT, 'static', 'og-image.png');
const CHROME_PATHS: Partial<Record<NodeJS.Platform, string>> = {
	darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	linux: '/usr/bin/google-chrome',
	win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
};

/** Hex tiles in the six logo colors, radiating from a focus on the right and shrinking towards the text side. */
const FRAGMENT_SHADER = `precision highp float;
uniform vec2 uResolution;

vec3 sectorColor(float index) {
	if (index < 0.5) return vec3(1.0, 0.584, 0.0);
	if (index < 1.5) return vec3(1.0, 0.231, 0.188);
	if (index < 2.5) return vec3(0.686, 0.322, 0.871);
	if (index < 3.5) return vec3(0.0, 0.478, 1.0);
	if (index < 4.5) return vec3(0.204, 0.78, 0.349);
	return vec3(1.0, 0.8, 0.0);
}

float hexDist(vec2 p) {
	p = abs(p);
	return max(dot(p, normalize(vec2(1.0, 1.732))), p.x);
}

void main() {
	vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * 7.0;
	vec2 r = vec2(1.0, 1.732);
	vec2 a = mod(uv, r) - 0.5 * r;
	vec2 b = mod(uv - 0.5 * r, r) - 0.5 * r;
	vec2 local = dot(a, a) < dot(b, b) ? a : b;
	vec2 id = uv - local;

	/** Off the lattice so no cell center sits on a sector boundary, where float noise flips its color per pixel. */
	vec2 focus = vec2(3.6, 0.433);
	vec2 toCell = id - focus;
	float angle = mod(atan(toCell.y, toCell.x), 6.28318);
	float dist = length(toCell);
	float size = mix(0.47, 0.0, smoothstep(0.5, 8.5, dist));
	float tile = smoothstep(size, size - 0.025, hexDist(local));
	float shade = 0.55 + 0.45 * smoothstep(size, 0.0, hexDist(local));

	vec3 color = sectorColor(floor(angle / 1.0472)) * shade;
	vec3 background = vec3(0.102) + 0.06 * exp(-dist * 0.35);
	gl_FragColor = vec4(mix(background, color, tile), 1.0);
}`;

function buildHtml(logoDataUrl: string): string {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;800&family=JetBrains+Mono:wght@400;700&display=block" rel="stylesheet">
<style>
	* { box-sizing: border-box; margin: 0; }
	body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #1a1a1a; color: #eeffff; font-family: Inter, sans-serif; }
	canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
	.fade { position: absolute; inset: 0; background: linear-gradient(90deg, #1a1a1a 0%, #1a1a1a 38%, #1a1a1ae0 50%, #1a1a1a00 72%); }
	main { position: absolute; inset: 0; padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; }
	.brand { display: flex; align-items: center; gap: 24px; }
	.brand img { width: 88px; height: 88px; }
	h1 { font-size: 88px; font-weight: 800; letter-spacing: -2px; line-height: 1; }
	p { margin-top: 28px; max-width: 560px; font-size: 34px; line-height: 1.3; color: #b2ccd6; }
	pre { margin-top: 40px; width: fit-content; padding: 20px 24px; border: 1px solid #323232; border-radius: 12px; background: #212121; font: 20px/1.6 'JetBrains Mono', monospace; color: #eeffff; }
	.k { color: #c792ea; font-style: italic; } .t { color: #ffcb6b; } .f { color: #82aaff; } .n { color: #f78c6c; } .u { color: #ff7b7b; } .o { color: #89ddff; } .p { color: #82aaff; font-style: italic; }
	footer { font: 700 24px 'JetBrains Mono', monospace; color: #8aa5b2; }
</style>
</head>
<body>
<canvas width="${WIDTH}" height="${HEIGHT}"></canvas>
<div class="fade"></div>
<main>
	<div>
		<div class="brand"><img src="${logoDataUrl}" alt=""><h1>Shayders</h1></div>
		<p>Write, preview and share GLSL shaders right in your browser.</p>
		<pre><span class="t">void</span> <span class="f">main</span><span class="o">()</span> <span class="o">{</span>
  <span class="t">vec3</span> col <span class="o">=</span> <span class="n">0.5</span> <span class="o">+</span> <span class="n">0.5</span> <span class="o">*</span> <span class="p">cos</span><span class="o">(</span><span class="u">uTime</span> <span class="o">+</span> <span class="t">vec3</span><span class="o">(</span><span class="n">0</span>, <span class="n">2</span>, <span class="n">4</span><span class="o">));</span>
  <span class="p">gl_FragColor</span> <span class="o">=</span> <span class="t">vec4</span><span class="o">(</span>col, <span class="n">1.0</span><span class="o">);</span>
<span class="o">}</span></pre>
	</div>
	<footer>shayders.ayfri.com</footer>
</main>
<script>
	const canvas = document.querySelector('canvas');
	const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
	const compile = (type, source) => {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
		return shader;
	};
	const program = gl.createProgram();
	gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'));
	gl.attachShader(program, compile(gl.FRAGMENT_SHADER, ${JSON.stringify(FRAGMENT_SHADER)}));
	gl.linkProgram(program);
	gl.useProgram(program);
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), canvas.width, canvas.height);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
</script>
</body>
</html>`;
}

const chromePath = process.env.CHROME_PATH ?? CHROME_PATHS[process.platform];
if (!chromePath) throw new Error(`No default Chrome path for ${process.platform}, set CHROME_PATH.`);

const logo = Buffer.from(await Bun.file(join(ROOT, 'src', 'lib', 'assets', 'logo.png')).arrayBuffer()).toString('base64');
const workDir = await mkdtemp(join(tmpdir(), 'shayders-og-'));
const htmlPath = join(workDir, 'og-image.html');
await Bun.write(htmlPath, buildHtml(`data:image/png;base64,${logo}`));
await mkdir(join(ROOT, 'static'), { recursive: true });

const chrome = Bun.spawn([
	chromePath,
	'--headless',
	'--hide-scrollbars',
	'--enable-unsafe-swiftshader',
	'--force-device-scale-factor=1',
	`--window-size=${WIDTH},${HEIGHT}`,
	'--virtual-time-budget=5000',
	`--screenshot=${OUTPUT}`,
	`file://${htmlPath.replaceAll('\\', '/')}`,
], { stderr: 'pipe', stdout: 'ignore' });

const exitCode = await chrome.exited;
await rm(workDir, { force: true, recursive: true });
if (exitCode !== 0) throw new Error(`Chrome exited with ${exitCode}: ${await new Response(chrome.stderr).text()}`);
console.log(`Wrote ${OUTPUT}`);
