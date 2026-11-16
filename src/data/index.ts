import { BuildingSchema } from '../shared/domain.schema'
import type { Building } from '../domain/types'
import oceanDriveTower from './ocean-drive-tower.json'
import palmBayPlaza from './palm-bay-plaza.json'
import biscayneSpire from './biscayne-spire.json'
import mangroveCommons from './mangrove-commons.json'
import flamingoExchange from './flamingo-exchange.json'

/** Buildings shipped with the app, validated at load. The first one is the default. */
// Keep the non-empty tuple type: selectors and init rely on BUNDLED_BUILDINGS[0] being defined.
export const BUNDLED_BUILDINGS: readonly [Building, ...Building[]] = [
  BuildingSchema.parse(oceanDriveTower),
  BuildingSchema.parse(palmBayPlaza),
  BuildingSchema.parse(biscayneSpire),
  BuildingSchema.parse(mangroveCommons),
  BuildingSchema.parse(flamingoExchange),
]
