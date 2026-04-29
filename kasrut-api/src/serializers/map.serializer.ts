import type { MapRestaurantPage, MapRestaurantRow } from '../db/map.repo'

export const serializeMapRestaurant = (r: MapRestaurantRow) => ({
  id:           r.id,
  name:         r.name,
  address:      r.address,
  city:         r.city,
  lat:          r.lat,
  lng:          r.lng,
  foodType:     r.foodType,
  kashrutLevel: r.kashrutLevel,
  hechsher:     r.hechsher,
  phone:        r.phone ?? null,
  hours:        r.hours ?? null,
})

export const serializeMapRestaurants = (rs: MapRestaurantRow[]) =>
  rs.map(serializeMapRestaurant)

export const serializeMapRestaurantsPage = (page: MapRestaurantPage) => ({
  restaurants: serializeMapRestaurants(page.restaurants),
  total: page.total,
  limit: page.limit,
  limited: page.limited,
})
