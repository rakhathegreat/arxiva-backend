import express from 'express';
import { getItems, getItemById, getItemHistory, createItem, updateItem, deleteItem } from '../controllers/item.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /items:
 *   get:
 *     tags: [Items]
 *     summary: Get items with pagination, search, and RBAC
 *     description: Retrieve items filtered by query parameters and authenticated user role.
 */
router.get('/', authMiddleware, getItems);

/**
 * @swagger
 * /items/{id}/history:
 *   get:
 *     tags: [Items]
 *     summary: Get transaction history for a specific item
 */
router.get('/:id/history', authMiddleware, getItemHistory);

/**
 * @swagger
 * /items/{id}:
 *   get:
 *     tags: [Items]
 *     summary: Get item by ID
 */
router.get('/:id', authMiddleware, getItemById);

/**
 * @swagger
 * /items:
 *   post:
 *     tags: [Items]
 *     summary: Create item
 */
router.post('/', authMiddleware, createItem);

/**
 * @swagger
 * /items/{id}:
 *   put:
 *     tags: [Items]
 *     summary: Update item
 */
router.put('/:id', authMiddleware, updateItem);

/**
 * @swagger
 * /items/{id}:
 *   delete:
 *     tags: [Items]
 *     summary: Delete item
 */
router.delete('/:id', authMiddleware, deleteItem);

export default router;
