import express from 'express';
import { 
    getCategories, 
    getCategoryById, 
    createCategory, 
    updateCategory, 
    deleteCategory 
} from '../controllers/category.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public route or protected route? Let's make GET public, and POST/PUT/DELETE protected for ADMIN
// If the user wants it to be fully protected, they can move authMiddleware up. 
// Assuming categories can be viewed by anyone but managed by ADMIN.

router.get('/', getCategories);
router.get('/:id', getCategoryById);

router.post('/', authMiddleware, roleMiddleware(['ADMIN']), createCategory);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), updateCategory);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), deleteCategory);

export default router;
