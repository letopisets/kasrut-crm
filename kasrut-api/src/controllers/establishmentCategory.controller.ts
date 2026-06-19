import type { Request, Response } from 'express'
import { establishmentCategoriesRepo } from '../db/establishmentCategories.repo'

export const establishmentCategoryController = {
  async list(_req: Request, res: Response) {
    const categories = await establishmentCategoriesRepo.findAll()
    res.json(categories)
  },
}
