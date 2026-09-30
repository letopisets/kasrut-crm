import { establishmentCategoriesRepo } from '../db/establishmentCategories.repo'
import { asyncHandler } from '../lib/asyncHandler'

export const establishmentCategoryController = {
  list: asyncHandler(async (_req, res) => {
    const categories = await establishmentCategoriesRepo.findAll()
    res.json(categories)
  }),
}
