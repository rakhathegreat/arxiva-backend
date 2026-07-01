import express from 'express';
import { 
    getBrands, 
    getBrandById, 
    createBrand, 
    updateBrand, 
    deleteBrand 
} from '../controllers/brand.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/', getBrands);
router.get('/:id', getBrandById);

router.post('/', authMiddleware, roleMiddleware(['ADMIN']), createBrand);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), updateBrand);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), deleteBrand);

export default router;
