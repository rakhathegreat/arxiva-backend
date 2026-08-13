import express from 'express';
import {
    getMaterialModels,
    getMaterialModelById,
    createMaterialModel,
    updateMaterialModel,
    deleteMaterialModel
} from '../controllers/materialModel.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /material-models:
 *   get:
 *     tags: [MaterialModels]
 *     summary: Get all material models
 *     description: Retrieve a list of all material models.
 *     responses:
 *       200:
 *         description: Material models retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/', getMaterialModels);

/**
 * @swagger
 * /material-models/{id}:
 *   get:
 *     tags: [MaterialModels]
 *     summary: Get material model by ID
 *     description: Retrieve a single material model using its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Material model retrieved successfully
 *       404:
 *         description: Material model not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', getMaterialModelById);

/**
 * @swagger
 * /material-models:
 *   post:
 *     tags: [MaterialModels]
 *     summary: Create material model
 *     description: Create a new material model.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nama, materialCategoryId, brandId]
 *             properties:
 *               nama:
 *                 type: string
 *                 example: HG8245H
 *               materialCategoryId:
 *                 type: integer
 *                 example: 1
 *               brandId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Material model created successfully
 *       400:
 *         description: Invalid request or duplicate name
 *       500:
 *         description: Internal server error
 */
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), createMaterialModel);

/**
 * @swagger
 * /material-models/{id}:
 *   put:
 *     tags: [MaterialModels]
 *     summary: Update material model
 *     description: Update details of an existing material model.
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
 *                 example: EG8145V5
 *               materialCategoryId:
 *                 type: integer
 *                 example: 2
 *               brandId:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       200:
 *         description: Material model updated successfully
 *       404:
 *         description: Material model not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), updateMaterialModel);

/**
 * @swagger
 * /material-models/{id}:
 *   delete:
 *     tags: [MaterialModels]
 *     summary: Delete material model
 *     description: Delete a material model by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Material model deleted successfully
 *       404:
 *         description: Material model not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), deleteMaterialModel);

export default router;
