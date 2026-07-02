import express from 'express';
import { getItems, getItemById, createItem, updateItem, deleteItem } from '../controllers/item.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /items:
 *   get:
 *     tags: [Items]
 *     summary: Get all items
 *     description: Retrieve a list of all inventory items.
 *     responses:
 *       200:
 *         description: Items retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/', getItems);

/**
 * @swagger
 * /items/{id}:
 *   get:
 *     tags: [Items]
 *     summary: Get item by ID
 *     description: Retrieve a single item by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item retrieved successfully
 *       404:
 *         description: Item not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', getItemById);

/**
 * @swagger
 * /items:
 *   post:
 *     tags: [Items]
 *     summary: Create item
 *     description: Create a new inventory item.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serialNumber, kategori, merek]
 *             properties:
 *               serialNumber:
 *                 type: string
 *                 example: SN-001
 *               kategori:
 *                 type: string
 *                 example: Elektronik
 *               merek:
 *                 type: string
 *                 example: Samsung
 *               status:
 *                 type: string
 *                 example: Tersedia
 *               lokasiPenyimpanan:
 *                 type: string
 *                 example: Gudang A - Level 1
 *               tanggalMasuk:
 *                 type: string
 *                 format: date
 *                 example: 2026-07-02
 *               tanggalKeluar:
 *                 type: string
 *                 format: date
 *                 example: ""
 *               mitra:
 *                 type: string
 *                 example: Mitra A
 *     responses:
 *       201:
 *         description: Item created successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Internal server error
 */
// Biarkan autentikasi fleksibel jika diperlukan, atau gunakan authMiddleware
router.post('/', createItem);

/**
 * @swagger
 * /items/{id}:
 *   put:
 *     tags: [Items]
 *     summary: Update item
 *     description: Update an existing inventory item.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serialNumber:
 *                 type: string
 *                 example: SN-001
 *               kategori:
 *                 type: string
 *                 example: Elektronik
 *               merek:
 *                 type: string
 *                 example: Samsung
 *               status:
 *                 type: string
 *                 example: Diluar
 *     responses:
 *       200:
 *         description: Item updated successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Item not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', updateItem);

/**
 * @swagger
 * /items/{id}:
 *   delete:
 *     tags: [Items]
 *     summary: Delete item
 *     description: Delete an existing inventory item.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item deleted successfully
 *       404:
 *         description: Item not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', deleteItem);

export default router;
