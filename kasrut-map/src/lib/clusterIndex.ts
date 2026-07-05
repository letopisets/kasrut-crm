import Supercluster from 'supercluster'
import type { MapRestaurant, MapViewport } from '@/types'

export interface ClusterRenderItem {
  type:          'cluster'
  id:            number
  count:         number
  position:      [number, number]   // [lat, lng]
  expansionZoom: number             // zoom at which this cluster splits apart
}

export interface RestaurantRenderItem {
  type:       'restaurant'
  restaurant: MapRestaurant
}

export type RenderItem = ClusterRenderItem | RestaurantRenderItem

// Pins stay clustered up to and including this zoom; from CLUSTER_MAX_ZOOM + 1
// every establishment renders as an individual pin.
const CLUSTER_MAX_ZOOM = 15
// Cluster catchment radius in true screen pixels — pins closer than this
// merge. Supercluster measures radius against `extent`-sized tiles, so with
// Leaflet's 256px tiles extent must be 256 for radius to mean CSS pixels.
const CLUSTER_RADIUS_PX = 60
const TILE_EXTENT = 256
// With this many establishments or fewer, clustering is skipped entirely and
// every pin renders individually (still viewport-culled). Keeps small filtered
// result sets readable at the zoom where markers first appear.
const SMALL_SET_BYPASS = 120
// Extra margin around the viewport so pins are already mounted when a pan
// reveals nearby area (viewport state only updates on moveend). Half a
// viewport per side masks typical drags; longer flings fill in on moveend.
const VIEWPORT_PAD_RATIO = 0.5
// Hard cap for cluster expansion so a click never zooms past the tile layer.
const MAX_EXPANSION_ZOOM = 19

const WORLD_BOUNDS: [number, number, number, number] = [-180, -85, 180, 85]

interface RestaurantProps {
  restaurant: MapRestaurant
  [name: string]: unknown
}

export interface RestaurantClusterIndex {
  index: Supercluster<RestaurantProps>
  /** Number of points loaded into the index (selected pin excluded). */
  size:  number
}

/**
 * Builds a spatial cluster index over the given restaurants. The selected
 * restaurant is excluded so it can always be rendered as its own pin without
 * being swallowed by a cluster (and without inflating cluster counts).
 *
 * Input is re-sorted by id before loading: supercluster's greedy clustering
 * depends on point order, and the caller's array is distance-sorted (its
 * order shifts as the user moves). A stable order keeps cluster anchors,
 * counts and cluster_ids identical across rebuilds for the same data set.
 */
export function buildClusterIndex(
  restaurants: MapRestaurant[],
  selectedId?: string,
): RestaurantClusterIndex {
  const stable = restaurants
    .filter(r => r.id !== selectedId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const index = new Supercluster<RestaurantProps>({
    radius:  CLUSTER_RADIUS_PX,
    extent:  TILE_EXTENT,
    maxZoom: CLUSTER_MAX_ZOOM,
  })

  index.load(stable.map(r => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
    properties: { restaurant: r },
  })))

  return { index, size: stable.length }
}

function paddedBbox(viewport: MapViewport): [number, number, number, number] {
  const { north, south, east, west } = viewport.bounds
  const latPad = (north - south) * VIEWPORT_PAD_RATIO
  const lngPad = (east - west) * VIEWPORT_PAD_RATIO
  return [
    Math.max(-180, west - lngPad),
    Math.max(-85,  south - latPad),
    Math.min(180,  east + lngPad),
    Math.min(85,   north + latPad),
  ]
}

/**
 * Returns the clusters and individual pins visible in the given viewport
 * (padded by VIEWPORT_PAD_RATIO on each side). Off-screen restaurants are
 * culled here — they never reach the DOM.
 */
export function getRenderItems(
  { index, size }: RestaurantClusterIndex,
  viewport: MapViewport | null,
  fallbackZoom: number,
): RenderItem[] {
  const bbox = viewport ? paddedBbox(viewport) : WORLD_BOUNDS
  // Querying past CLUSTER_MAX_ZOOM yields individual (but still culled) pins.
  const zoom = size <= SMALL_SET_BYPASS
    ? CLUSTER_MAX_ZOOM + 1
    : Math.floor(viewport?.zoom ?? fallbackZoom)

  return index.getClusters(bbox, zoom).map((feature): RenderItem => {
    const [lng, lat] = feature.geometry.coordinates
    if (feature.properties.cluster) {
      const clusterId = feature.properties.cluster_id as number
      return {
        type: 'cluster',
        id: clusterId,
        count: feature.properties.point_count as number,
        position: [lat, lng],
        expansionZoom: Math.min(
          index.getClusterExpansionZoom(clusterId),
          MAX_EXPANSION_ZOOM,
        ),
      }
    }
    return { type: 'restaurant', restaurant: (feature.properties as RestaurantProps).restaurant }
  })
}
