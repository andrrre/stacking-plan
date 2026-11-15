import { Color, MeshBasicMaterial, Vector3 } from 'three'

// A flat (unlit) material for suite boxes and slabs: the front face shows the token colour exactly, the top
// is 13% lighter and the sides 12% darker (in sRGB, so hues hold: an orange top stays orange), so the boxes read as solids while the colours stay true
// to the legend. Patterns and edges are drawn in the fragment shader: the vacant hatch and committed pattern
// in world units (the same density on every box), the expiring/committed solid edge and the potential dashed
// edge in screen pixels (crisp at any zoom). Ghosting (desaturated, translucent) is a 0..1 uniform so it can
// fade. No textures, so nothing to load.

const VERTEX_DECL = /* glsl */ `
varying vec3 vSmPos;
varying vec3 vSmNormal;
void main() {`

const VERTEX_BODY = /* glsl */ `#include <project_vertex>
vSmPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSmNormal = normal;`

const FRAGMENT_DECL = /* glsl */ `
uniform vec3 uPatColor; uniform float uPatAlpha; uniform float uPatKind; uniform float uPatPeriod; uniform float uPatRatio;
uniform vec3 uEdgeColor; uniform float uEdgeAlpha; uniform float uEdgePx; uniform float uEdgeDash;
uniform vec3 uBoxMin; uniform vec3 uBoxMax; uniform float uGhost; uniform float uHover; uniform float uShade;
varying vec3 vSmPos;
varying vec3 vSmNormal;

// Face-local coordinates (world units) and the face size, from the dominant normal axis.
vec2 smFaceUv(out vec2 size) {
  vec3 p = vSmPos - uBoxMin;
  vec3 s = uBoxMax - uBoxMin;
  vec3 n = abs(vSmNormal);
  if (n.z > 0.5) { size = s.xy; return p.xy; }
  if (n.x > 0.5) { size = s.zy; return p.zy; }
  size = s.xz; return p.xz;
}

float smStripes(vec2 uv) {
  float t = (uPatKind < 1.5 ? uv.x + uv.y : uv.x - uv.y) / uPatPeriod;
  float d = abs(fract(t) - 0.5) * 2.0;
  float aa = fwidth(d);
  return smoothstep(1.0 - uPatRatio - aa, 1.0 - uPatRatio + aa, d);
}

float smEdge(vec2 uv, vec2 size) {
  vec2 lo = min(uv, size - uv);
  float dist = min(lo.x, lo.y);
  float px = max(fwidth(dist), 1e-5);
  float band = 1.0 - smoothstep(uEdgePx - 0.5, uEdgePx + 0.5, dist / px);
  float along = lo.x < lo.y ? uv.y : uv.x;
  float dash = step(0.5, fract(along / max(fwidth(along), 1e-5) / 9.0));
  return band * mix(1.0, dash, uEdgeDash);
}

void main() {`

// Mixing happens in (approximate) sRGB, as CSS does, so the hatch and the shading match the 2D swatches.
const FRAGMENT_BODY = /* glsl */ `#include <color_fragment>
{
  vec2 size;
  vec2 uv = smFaceUv(size);
  vec3 c = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
  if (uPatKind > 0.5) c = mix(c, pow(uPatColor, vec3(1.0 / 2.2)), smStripes(uv) * uPatAlpha);
  c = mix(c, pow(uEdgeColor, vec3(1.0 / 2.2)), smEdge(uv, size) * uEdgeAlpha);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, mix(vec3(lum), vec3(0.86), 0.62), uGhost);
  if (uShade > 0.5) {
    if (vSmNormal.y > 0.5) c = mix(c, vec3(1.0), 0.13);
    else if (abs(vSmNormal.x) > 0.5) c *= 0.88;
    else if (vSmNormal.z < -0.5 || vSmNormal.y < -0.5) c *= 0.8;
  }
  c = mix(c, vec3(1.0), 0.16 * uHover);
  diffuseColor.rgb = pow(c, vec3(2.2));
  diffuseColor.a *= mix(1.0, 0.5, uGhost);
}`

export class SuiteMaterial extends MeshBasicMaterial {
  readonly u = {
    uPatColor: { value: new Color() },
    uPatAlpha: { value: 0 },
    uPatKind: { value: 0 }, // 0 none, 1 hatch, 2 committed
    uPatPeriod: { value: 0.18 },
    uPatRatio: { value: 0.375 },
    uEdgeColor: { value: new Color() },
    uEdgeAlpha: { value: 0 },
    uEdgePx: { value: 1 },
    uEdgeDash: { value: 0 },
    uBoxMin: { value: new Vector3() },
    uBoxMax: { value: new Vector3(1, 1, 1) },
    uGhost: { value: 0 },
    uHover: { value: 0 },
    uShade: { value: 1 },
  }

  constructor() {
    super({ transparent: true })
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.u)
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', VERTEX_DECL)
        .replace('#include <project_vertex>', VERTEX_BODY)
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', FRAGMENT_DECL)
        .replace('#include <color_fragment>', FRAGMENT_BODY)
    }
  }

  // Every instance compiles to the same program, so 600 suites share one shader.
  customProgramCacheKey(): string {
    return 'stackmatch-suite-v2'
  }
}
