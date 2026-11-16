import { BufferGeometry, Color, Float32BufferAttribute, LineBasicMaterial, MeshBasicMaterial } from 'three'

// Materials and shading for the sketched city. Flat (unlit) basic materials, patched to fade with distance
// from the building and towards the tops of the tallest neighbours (into the stage background, which shows
// through the transparent canvas, so a skyline behind the roof stays faint), and to dim as a whole (floor
// view, separated floors). One set of uniforms is shared by every city material, so a
// single write fades or dims the whole city.

type U = { value: number }
export type FadeUniforms = { uFadeNear: U; uFadeFar: U; uHazeTop: U; uDim: U }

export const fadeUniforms = (): FadeUniforms => ({ uFadeNear: { value: 26 }, uFadeFar: { value: 78 }, uHazeTop: { value: 1e6 }, uDim: { value: 1 } })

/**
 * `dim`: the whole city (1 as drawn, lower further back); `hazeTop`: the height at which the neighbours have
 * faded by half. Uniform writes, picked up by the next frame.
 */
export function setFade(u: FadeUniforms, dim: number, hazeTop: number): void {
  u.uDim.value = dim
  u.uHazeTop.value = hazeTop
}

const VERTEX_DECL = /* glsl */ `
uniform float uFadeNear; uniform float uFadeFar; uniform float uHazeTop;
varying float vCityFade;
void main() {`

// Distance in plan (x, z) from the building's centre and height, after any instance transform.
const VERTEX_BODY = /* glsl */ `#include <project_vertex>
{
  vec4 cfWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  cfWorld = instanceMatrix * cfWorld;
  #endif
  cfWorld = modelMatrix * cfWorld;
  vCityFade = (1.0 - smoothstep(uFadeNear, uFadeFar, length(cfWorld.xz))) * (1.0 - 0.5 * smoothstep(0.2 * uHazeTop, uHazeTop, cfWorld.y));
}`

const FRAGMENT_DECL = /* glsl */ `
uniform float uDim;
varying float vCityFade;
void main() {`

const FRAGMENT_BODY = /* glsl */ `#include <color_fragment>
diffuseColor.a *= vCityFade * uDim;`

function withFade<M extends MeshBasicMaterial | LineBasicMaterial>(m: M, u: FadeUniforms, key: string): M {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader.replace('void main() {', VERTEX_DECL).replace('#include <project_vertex>', VERTEX_BODY)
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', FRAGMENT_DECL).replace('#include <color_fragment>', FRAGMENT_BODY)
  }
  m.customProgramCacheKey = () => `stackmatch-city-${key}`
  return m
}

/** A see-through fill (vertex-shaded white boxes tinted `hex`) that still hides the lines behind it. */
export const fillMaterial = (hex: string, opacity: number, u: FadeUniforms, depthWrite = true) =>
  withFade(new MeshBasicMaterial({ color: hex, vertexColors: true, transparent: true, opacity, depthWrite }), u, 'fill')

/**
 * Writes the blocks' depth and nothing else, after their see-through fills are drawn, so the lines behind a
 * block are hidden while the building (drawn earlier) is not. Pushed back a little so a block's own edges,
 * which lie on its faces, still draw; a block faded to nothing is discarded and hides nothing.
 */
export const depthMaterial = (u: FadeUniforms) => withFade(new MeshBasicMaterial({
  colorWrite: false, depthWrite: true, transparent: true, alphaTest: 0.01, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
}), u, 'depth')

/** A flat, unshaded surface (roads). */
export const flatMaterial = (hex: string, opacity: number, u: FadeUniforms) =>
  withFade(new MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false }), u, 'flat')

export const lineMaterial = (hex: string, opacity: number, u: FadeUniforms) =>
  withFade(new LineBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false }), u, 'line')

/**
 * Bakes flat shading into a fresh geometry as vertex colours, by normal: the top lightest, the front a little
 * darker, the sides and back darker still, so a white box reads as a solid without lights.
 */
export function shadeByNormal<G extends BufferGeometry>(g: G, shades = { top: 1, front: 0.95, side: 0.9, back: 0.86 }): G {
  const n = g.getAttribute('normal')
  const c = new Color()
  const out: number[] = []
  for (let i = 0; i < n.count; i++) {
    const [x, y, z] = [n.getX(i), n.getY(i), n.getZ(i)]
    const s = y > 0.5 ? shades.top : z > 0.5 ? shades.front : Math.abs(x) > 0.5 ? shades.side : shades.back
    c.setScalar(s)
    out.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new Float32BufferAttribute(out, 3))
  return g
}
