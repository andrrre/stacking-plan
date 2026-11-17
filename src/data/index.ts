import { BuildingSchema } from '../shared/domain.schema.js'
import type { Building } from '../domain/types.js'
import oceanDriveTower from './ocean-drive-tower.json' with { type: 'json' }
import palmBayPlaza from './palm-bay-plaza.json' with { type: 'json' }
import biscayneSpire from './biscayne-spire.json' with { type: 'json' }
import mangroveCommons from './mangrove-commons.json' with { type: 'json' }
import flamingoExchange from './flamingo-exchange.json' with { type: 'json' }

/** Buildings shipped with the app, validated at load. The first one is the default. */
// Keep the non-empty tuple type: selectors and init rely on BUNDLED_BUILDINGS[0] being defined.
export const BUNDLED_BUILDINGS: readonly [Building, ...Building[]] = [
  BuildingSchema.parse(oceanDriveTower),
  BuildingSchema.parse(palmBayPlaza),
  BuildingSchema.parse(biscayneSpire),
  BuildingSchema.parse(mangroveCommons),
  BuildingSchema.parse(flamingoExchange),
]
