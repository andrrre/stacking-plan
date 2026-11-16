// The pedestrian figure's proportions, shared by the crowd (heights) and the walk (poses).

/**
 * Fractions of the figure's height, except `height` (world units: one floor = 1, so 0.44 is a tall person on
 * a short storey; the crowd caps it where the sightline to the lowest facade labels needs less).
 */
export const FIGURE = {
  height: 0.44,
  leg: 0.47, // hip height
  shoulder: 0.8, // top of the torso
  head: 0.075, // head radius
  swing: 0.42, // largest leg swing either side of vertical (radians)
  armSwing: 0.7, // arm swing as a share of the leg swing
}
