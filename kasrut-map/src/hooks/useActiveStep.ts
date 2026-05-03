import { useMemo } from 'react'
import type { RouteData, RouteStep } from '@/types'

interface ActiveStep {
  index:           number
  step:            RouteStep
  distanceToStep:  number   // metres from user to the upcoming step's pivot point
  remainingDist:   number   // metres remaining along route to destination
  remainingTime:   number   // seconds remaining
  arrived:         boolean  // true once user is within 25m of destination
}

const ARRIVAL_RADIUS_METERS = 25

function haversine([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Tracks the user's progress along a route. Picks the step whose pivot point
 * is the closest point on the route ahead of the user, and returns the
 * remaining distance/time based on cumulative step lengths.
 */
export function useActiveStep(
  route: RouteData | null,
  position: [number, number] | null,
): ActiveStep | null {
  return useMemo(() => {
    if (!route || !position || route.steps.length === 0) return null

    // Find the index of the route geometry point closest to the user.
    let nearestIdx = 0
    let nearestDist = Infinity
    for (let i = 0; i < route.geometry.length; i += 1) {
      const d = haversine(position, route.geometry[i])
      if (d < nearestDist) {
        nearestDist = d
        nearestIdx = i
      }
    }

    // Walk forward from the nearest geometry point and find the next step
    // whose pivot lies ahead. Steps don't carry geometry indices, so we
    // approximate by mapping step order to geometry progress proportionally.
    const totalGeo = Math.max(route.geometry.length - 1, 1)
    const progress = nearestIdx / totalGeo
    const stepIdx = Math.min(
      Math.floor(progress * route.steps.length),
      route.steps.length - 1,
    )

    const upcoming = route.steps[stepIdx]
    const distanceToStep = haversine(position, route.geometry[Math.min(nearestIdx + 1, route.geometry.length - 1)])

    let remainingDist = 0
    let remainingTime = 0
    for (let i = stepIdx; i < route.steps.length; i += 1) {
      remainingDist += route.steps[i].distance
      remainingTime += route.steps[i].duration
    }
    // Adjust by how far through the current segment we are
    remainingDist = Math.max(remainingDist - (1 - progress * route.steps.length + stepIdx) * upcoming.distance, 0)

    const destination = route.geometry[route.geometry.length - 1]
    const distToDest = haversine(position, destination)
    const arrived = distToDest <= ARRIVAL_RADIUS_METERS

    return {
      index: stepIdx,
      step: upcoming,
      distanceToStep,
      remainingDist: arrived ? 0 : Math.max(remainingDist, distToDest),
      remainingTime: arrived ? 0 : remainingTime,
      arrived,
    }
  }, [route, position])
}
