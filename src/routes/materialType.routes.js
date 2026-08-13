import express from 'express';
import {
    getMaterialTypes,
    getMaterialTypeById,
    createMaterialType,
    updateMaterialType,
    deleteMaterialType
} from '../controllers/materialType.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getMaterialTypes);
router.get('/:id', getMaterialTypeById);
router.post('/', roleMiddleware(['ADMIN']), createMaterialType);
router.put('/:id', roleMiddleware(['ADMIN']), updateMaterialType);
router.delete('/:id', roleMiddleware(['ADMIN']), deleteMaterialType);

export default router;
