export const defaultImageShader = `precision mediump float;
uniform float uAspect;
uniform float uDeltaTime;
uniform float uFrameRate;
uniform float uTime;
uniform int uFrameCount;
uniform vec2 uResolution;
uniform vec3 uMouse;
uniform vec4 uDate;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 mouse = uMouse.xy / uResolution;
  float dist = length(uv - mouse);
  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0, 2, 4));
  col += 0.3 * (1.0 - dist * 3.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export const defaultBufferShader = `precision mediump float;
uniform float uTime;
uniform vec2 uResolution;
// Buffers above this one in the tab order are available as uBufferA, uBufferB, etc. (sampler2D)
// Sample with: texture2D(uBufferA, gl_FragCoord.xy / uResolution)

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(uTime), 1.0);
}`;

export const defaultCommonCode = `// Common -- code prepended to every shader
// precision mediump float;
// #define PI 3.14159265359
`;
