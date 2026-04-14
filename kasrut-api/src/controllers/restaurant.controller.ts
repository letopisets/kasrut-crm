import type { Request, Response, NextFunction } from 'express'
import { restaurantsRepo } from '../db/restaurants.repo'
import { serializeRestaurant, serializeRestaurants } from '../serializers/restaurant.serializer'

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
      const body = req.body as Parameters<typeof restaurantsRepo.create>[0]
      if (req.user?.role === 'rabbanut' && body.rabbanutId !== req.user.rabbanutId) {
        res.status(403).json({ error: 'Forbidden' }); return
      }
      const r = await restaurantsRepo.create(body)
      res.status(201).json(serializeRestaurant(r))
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const r = await restaurantsRepo.update(req.params.id, req.body)
      if (!r) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeRestaurant(r))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await restaurantsRepo.remove(req.params.id)
      if (!ok) { res.status(404).json({ error: 'Not found' }); return }
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
