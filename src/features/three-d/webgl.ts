// Whether this browser can draw the 3D building. three.js needs WebGL 2. Probed once per page: the probe
// context is released straight away so it does not count against the browser's context limit.

let cached: boolean | null = null

function probe(): boolean {
  if (typeof window === 'undefined' || typeof window.WebGL2RenderingContext === 'undefined') return false
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

export function canUseWebGL(): boolean {
  cached ??= probe()
  return cached
}
