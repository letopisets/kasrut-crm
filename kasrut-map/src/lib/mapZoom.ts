// MapLibre renders 512px tiles, so its zoom scale sits one level below the
// classic 256px web-mercator scale that the rest of the app uses everywhere:
// viewport state, MARKER_VISIBILITY_ZOOM, DEFAULT_ZOOM/NAV_ZOOM, and the
// supercluster index (whose radius/extent are tuned to classic zooms).
// Convert only at the map boundary — app state never stores MapLibre zooms.

export function toMapZoom(classicZoom: number): number {
  return classicZoom - 1
}

export function toClassicZoom(mapLibreZoom: number): number {
  return mapLibreZoom + 1
}
