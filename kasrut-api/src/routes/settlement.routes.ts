import { Router } from 'express'
import { settlementController } from '../controllers/settlement.controller'
import { authenticateJWT }      from '../middleware/auth'

const router = Router()

// Requires auth — only CRM users query settlements (forms, dropdowns)
router.get('/search', authenticateJWT, settlementController.search)

export default router
