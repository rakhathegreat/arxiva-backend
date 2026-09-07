import express from 'express';
import { brandHandlers } from '../modules/masterdata/handlers.js';
import { authMiddleware, roleMiddleware } from '../shared/middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /brands:
 *   get:
 *     tags: [Brands]
 *     summary: Get all brands
 *     description: Retrieve a list of all brands, including their category info.
 *     responses:
 *       200:
 *         description: Brands retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/', brandHandlers.list);

/**
 * @swagger
 * /brands/{id}:
 *   get:
 *     tags: [Brands]
 *     summary: Get brand by ID
 *     description: Retrieve a single brand using its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Brand retrieved successfully
 *       404:
 *         description: Brand not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', brandHandlers.getById);

/**
 * @swagger
 * /brands:
 *   post:
 *     tags: [Brands]
 *     summary: Create brand
 *     description: Create a new brand.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nama, origin, identifier]
 *             properties:
 *               nama:
 *                 type: string
 *                 example: Samsung
 *               origin:
 *                 type: string
 *                 example: Korea
 *               identifier:
 *                 type: string
 *                 example: SAMS
 *     responses:
 *       201:
 *         description: Brand created successfully
 *       400:
 *         description: Invalid request or duplicate brand
 *       500:
 *         description: Internal server error
 */
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), brandHandlers.create);

/**
 * @swagger
 * /brands/{id}:
 *   put:
 *     tags: [Brands]
 *     summary: Update brand
 *     description: Update details of an existing brand.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nama:
 *                 type: string
 *                 example: Samsung Update
 *               origin:
 *                 type: string
 *                 example: Korea Selatan
 *               identifier:
 *                 type: string
 *                 example: SAMS2
 *     responses:
 *       200:
 *         description: Brand updated successfully
 *       404:
 *         description: Brand not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), brandHandlers.update);

/**
 * @swagger
 * /brands/{id}:
 *   delete:
 *     tags: [Brands]
 *     summary: Delete brand
 *     description: Delete a brand by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Brand deleted successfully
 *       404:
 *         description: Brand not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), brandHandlers.remove);

export default router;
