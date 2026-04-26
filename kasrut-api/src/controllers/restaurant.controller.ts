import type { Request, Response, NextFunction } from 'express'
import { restaurantsRepo } from '../db/restaurants.repo'
import { serializeRestaurant, serializeRestaurants } from '../serializers/restaurant.serializer'
import { invalidatePattern } from '../lib/cache'
import { validate } from '../lib/validate'
import { createRestaurantSchema, updateRestaurantSchema } from '../schemas'

const invalidateMapCache = () => invalidatePattern('map:restaurants:*')

export const restaurantController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, string>
      const rabbanutId  = req.user?.role === 'rabbanut'  ? req.user.rabbanutId : q.rabbanutId
      const mashgiachId = req.user?.role === 'mashgiach' ? req.user.sub        : undefined

      const restaurants = mashgiachId
        ? await restaurantsRepo.findByMashgiach(mashgiachId)
        : await restaurantsRepo.findAll({ rabbanutId, status: q.status })

      res.json(serializeRestaurants(restaurants))
    } catch (e) { next(e) }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const r = await restaurantsRepo.findById(req.params.id)
      if (!r) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeRestaurant(r))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(createRestaurantSchema, req.body)
      if (req.user?.role === 'rabbanut' && body.rabbanutId !== req.user.rabbanutId) {
        res.status(403).json({ error: 'Forbidden' }); return
      }
      const r = await restaurantsRepo.create(body)
      void invalidateMapCache()
      res.status(201).json(serializeRestaurant(r))
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(updateRestaurantSchema, req.body)
      const r = await restaurantsRepo.update(req.params.id, body)
      if (!r) { res.status(404).json({ error: 'Not found' }); return }
      void invalidateMapCache()
      res.json(serializeRestaurant(r))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await restaurantsRepo.remove(req.params.id)
      if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
      if (result === 'conflict')  { res.status(409).json({ error: 'Cannot delete restaurant' }); return }
      void invalidateMapCache()
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
