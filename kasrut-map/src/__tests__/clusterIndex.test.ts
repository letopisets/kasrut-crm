import { describe, it, expect } from 'vitest'
import { buildClusterIndex, getRenderItems } from '@/lib/clusterIndex'
import type { RenderItem } from '@/lib/clusterIndex'
import type { MapRestaurant, MapViewport } from '@/types'

let seq = 0
function restaurant(lat: number, lng: number): MapRestaurant {
  seq += 1
  return {
    id: `r${String(seq).padStart(4, '0')}`,
    name: `Restaurant ${seq}`,
    address: 'Test st. 1',
    city: 'Jerusalem',
    lat,
    lng,
    foodType: 'meat',
    category: 'restaurant',
    kashrutLevel: 'mehadrin',
    hechsher: 'Test',
  }
}

/** A tight blob of restaurants around a center point (well inside one cluster radius). */
function blob(lat: number, lng: number, count: number): MapRestaurant[] {
  return Array.from({ length: count }, (_, i) =>
    restaurant(lat + i * 0.00001, lng + i * 0.00001))
}

function viewport(center: [number, number], span: number, zoom: number): MapViewport {
  return {
    bounds: {
      north: center[0] + span / 2,
      south: center[0] - span / 2,
      east:  center[1] + span / 2,
      west:  center[1] - span / 2,
    },
    zoom,
  }
}

const JERUSALEM: [number, number] = [31.7767, 35.2345]
const TEL_AVIV:  [number, number] = [32.0853, 34.7818]

// Result sets above this size cluster; at or below they render as raw pins
// (mirrors SMALL_SET_BYPASS in clusterIndex.ts).
const BYPASS = 120

function counts(items: RenderItem[]) {
  return {
    clusters:    items.filter(i => i.type === 'cluster').length,
    restaurants: items.filter(i => i.type === 'restaurant').length,
    total: items.reduce(
      (sum, i) => sum + (i.type === 'cluster' ? i.count : 1), 0),
  }
}

describe('buildClusterIndex + getRenderItems', () => {
  it('merges a dense blob into one cluster at city zoom', () => {
    const index = buildClusterIndex(blob(...JERUSALEM, BYPASS + 30))
    const items = getRenderItems(index, viewport(JERUSALEM, 0.1, 13), 13)

    const c = counts(items)
    expect(c.clusters).toBe(1)
    expect(c.restaurants).toBe(0)
    expect(c.total).toBe(BYPASS + 30)
  })

  it('renders individual pins at zoom 16 and above (no clustering)', () => {
    const index = buildClusterIndex(blob(...JERUSALEM, BYPASS + 30))
    const items = getRenderItems(index, viewport(JERUSALEM, 0.02, 16), 16)

    const c = counts(items)
    expect(c.clusters).toBe(0)
    expect(c.restaurants).toBe(BYPASS + 30)
  })

  it('skips clustering entirely for small result sets', () => {
    const index = buildClusterIndex(blob(...JERUSALEM, BYPASS))
    const items = getRenderItems(index, viewport(JERUSALEM, 0.1, 13), 13)

    const c = counts(items)
    expect(c.clusters).toBe(0)
    expect(c.restaurants).toBe(BYPASS)
  })

  it('culls restaurants outside the padded viewport', () => {
    const inside = blob(...JERUSALEM, 3)
    const telAviv = blob(...TEL_AVIV, 5) // ~55 km away
    const index = buildClusterIndex([...inside, ...telAviv])

    // 0.1° viewport padded by 50% → 0.2° reach; Tel Aviv is ~0.3-0.5° away.
    const items = getRenderItems(index, viewport(JERUSALEM, 0.1, 16), 16)

    expect(counts(items).total).toBe(3)
  })

  it('keeps restaurants inside the 50% viewport padding', () => {
    const vp = viewport(JERUSALEM, 0.1, 16) // pad = 0.05 per side
    const justOutside = restaurant(vp.bounds.north + 0.01, JERUSALEM[1])
    const farOutside  = restaurant(vp.bounds.north + 0.2,  JERUSALEM[1])
    const index = buildClusterIndex([justOutside, farOutside])

    const items = getRenderItems(index, vp, 16)

    expect(counts(items).total).toBe(1)
    expect(items[0]).toMatchObject({ type: 'restaurant', restaurant: { id: justOutside.id } })
  })

  it('excludes the selected restaurant from the index', () => {
    const restaurants = blob(...JERUSALEM, 5)
    const selected = restaurants[2]
    const index = buildClusterIndex(restaurants, selected.id)
    const items = getRenderItems(index, viewport(JERUSALEM, 0.1, 13), 13)

    expect(index.size).toBe(4)
    expect(counts(items).total).toBe(4)
    for (const item of items) {
      if (item.type === 'restaurant') expect(item.restaurant.id).not.toBe(selected.id)
    }
  })

  it('reports an expansion zoom deeper than the viewing zoom for clusters', () => {
    const index = buildClusterIndex(blob(...JERUSALEM, BYPASS + 30))
    const zoom = 12
    const items = getRenderItems(index, viewport(JERUSALEM, 0.2, zoom), zoom)

    const cluster = items.find(i => i.type === 'cluster')
    expect(cluster).toBeDefined()
    if (cluster?.type === 'cluster') {
      expect(cluster.expansionZoom).toBeGreaterThan(zoom)
      expect(cluster.expansionZoom).toBeLessThanOrEqual(19)
    }
  })

  it('splits distant groups into separate clusters', () => {
    const jerusalem = blob(...JERUSALEM, 80)
    const telAviv   = blob(...TEL_AVIV, 70)
    const index = buildClusterIndex([...jerusalem, ...telAviv])

    // Wide view containing both cities.
    const items = getRenderItems(index, viewport([31.93, 35.0], 1.5, 9), 9)

    const c = counts(items)
    expect(c.clusters).toBe(2)
    expect(c.total).toBe(150)
  })

  it('produces identical clusters regardless of input array order', () => {
    const restaurants = [...blob(...JERUSALEM, 80), ...blob(...TEL_AVIV, 70)]
    const reversed = [...restaurants].reverse()
    const vp = viewport([31.93, 35.0], 1.5, 9)

    const a = getRenderItems(buildClusterIndex(restaurants), vp, 9)
    const b = getRenderItems(buildClusterIndex(reversed), vp, 9)

    expect(a).toEqual(b)
  })

  it('falls back to world bounds when viewport is null', () => {
    const index = buildClusterIndex(blob(...JERUSALEM, 10))
    const items = getRenderItems(index, null, 13)

    expect(counts(items).total).toBe(10)
  })

  it('handles an empty restaurant list', () => {
    const index = buildClusterIndex([])
    expect(getRenderItems(index, viewport(JERUSALEM, 0.1, 13), 13)).toEqual([])
  })
})
