import express from 'express';
import { getItems, getItemById, createItem, updateItem, deleteItem } from '../controllers/item.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/', getItems);
router.get('/:id', getItemById);

// Biarkan autentikasi fleksibel jika diperlukan, atau gunakan authMiddleware
router.post('/', createItem);
router.put('/:id', updateItem);
router.delete('/:id', deleteItem);

export default router;
