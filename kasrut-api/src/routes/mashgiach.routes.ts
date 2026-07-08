import { Router } from 'express'
import { mashgiachController } from '../controllers/mashgiach.controller'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()
// The mashgichim registry is an owner/rabbanut function (mirrors the CRM's own
// access model — the mashgiach role has no mashgichim tab). Without requireRole
// here, a mashgiach-role token could enumerate every tenant's mashgichim PII,
// since read-scoping only narrows the 'rabbanut' role.
router.get('/',            authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.list)
router.get('/:id',         authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.getOne)
router.post('/',           authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.create)
router.patch('/:id',       authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.update)
router.delete('/:id',      authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.remove)
router.post('/:id/toggle', authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.toggle)
router.post('/:id/assign', authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.assign)
export default router
