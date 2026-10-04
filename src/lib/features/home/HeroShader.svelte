<script lang="ts" module>
	const HERO_CODE = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uMouse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.0 + 0.17;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec2 m = (uMouse.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * 0.06;
  vec2 p = uv * 1.6;
  vec2 q = vec2(fbm(p + t), fbm(p - t + 4.2));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.7 * t + 0.3 * m), fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.5 * t));
  float f = fbm(p + 3.0 * r);
  vec3 col = mix(vec3(0.02, 0.03, 0.06), vec3(0.0, 0.55, 0.7), clamp(f * f * 2.2, 0.0, 1.0));
  col = mix(col, vec3(0.7, 0.2, 0.85), clamp(length(q) * 0.55 - 0.15, 0.0, 1.0) * 0.6);
  col = mix(col, vec3(0.95, 0.97, 1.0), clamp(r.x * r.x * r.x - 0.1, 0.0, 1.0) * 0.5);
  col += 0.18 * vec3(0.2, 0.8, 1.0) * exp(-5.0 * length(uv - m));
  col *= 1.0 - 0.35 * dot(uv, uv);
  gl_FragColor = vec4(col, 1.0);
}`;

	const MOUSE_EASING = 0.06;
</script>

<script lang="ts">
	import { ShaderPreviewRenderer } from '#features/shaders/preview/preview-renderer.js';

	let { class: className = '' }: { class?: string } = $props();

	/** Runs only while on screen, the pointer glow eases toward the cursor so entering the hero never makes it jump. */
	function attachHero(canvas: HTMLCanvasElement) {
		const renderer = new ShaderPreviewRenderer(canvas, [{ code: HERO_CODE, id: 'image', label: 'Image' }], [], canvas.clientWidth, canvas.clientHeight);
		const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const host = canvas.parentElement ?? canvas;
		const mouse = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
		const target = { ...mouse };
		let frame = 0;

		const ease = () => {
			mouse.x += (target.x - mouse.x) * MOUSE_EASING;
			mouse.y += (target.y - mouse.y) * MOUSE_EASING;
			renderer.setMouse(mouse.x, mouse.y);
			frame = requestAnimationFrame(ease);
		};
		const setVisible = (visible: boolean) => {
			cancelAnimationFrame(frame);
			renderer.setHovered(visible);
			if (visible) ease();
		};
		const onPointerMove = (event: PointerEvent) => {
			const rect = canvas.getBoundingClientRect();
			target.x = event.clientX - rect.left;
			target.y = rect.height - (event.clientY - rect.top);
		};

		renderer.setMouse(mouse.x, mouse.y);
		const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && !reducedMotion));
		observer.observe(canvas);
		host.addEventListener('pointermove', onPointerMove);
		return () => {
			observer.disconnect();
			host.removeEventListener('pointermove', onPointerMove);
			cancelAnimationFrame(frame);
			renderer.destroy();
		};
	}
</script>

<canvas {@attach attachHero} aria-hidden="true" class="block h-full w-full {className}"></canvas>
