import express from 'express';
import {
    getLocations,
    createLocation,
    updateLocation,
    toggleLocation,
    deleteLocation,
    migrateLocationItems
} from '../controllers/location.controller.js';
import { authMiddleware, roleMiddleware } from '../shared/middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /locations:
 *   get:
 *     tags: [Locations]
 *     summary: Get all locations
 *     description: Retrieve all storage locations and their levels.
 *     responses:
 *       200:
 *         description: Locations retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/', getLocations);

/**
 * @swagger
 * /locations:
 *   post:
 *     tags: [Locations]
 *     summary: Create location
 *     description: Create a new storage location or rack.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Gudang A
 *               type:
 *                 type: string
 *                 example: Kardus
 *               capacity:
 *                 type: integer
 *                 example: 50
 *               brandRule:
 *                 type: string
 *                 example: Samsung
 *     responses:
 *       201:
 *         description: Location created successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Internal server error
 */
router.post('/', authMiddleware, createLocation);

/**
 * @swagger
 * /locations/{id}:
 *   put:
 *     tags: [Locations]
 *     summary: Update location
 *     description: Update an existing storage location.
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
 *               name:
 *                 type: string
 *                 example: Gudang B
 *               capacity:
 *                 type: integer
 *                 example: 80
 *               brandRule:
 *                 type: string
 *                 example: Apple
 *     responses:
 *       200:
 *         description: Location updated successfully
 *       404:
 *         description: Location not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authMiddleware, updateLocation);

/**
 * @swagger
 * /locations/{id}/toggle:
 *   patch:
 *     tags: [Locations]
 *     summary: Toggle location status
 *     description: Activate or deactivate a storage location.
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
 *             required: [isActive]
 *             properties:
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Location status updated successfully
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/toggle', authMiddleware, toggleLocation);

/**
 * @swagger
 * /locations/{id}:
 *   delete:
 *     tags: [Locations]
 *     summary: Delete location
 *     description: Delete an existing storage location.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Location deleted successfully
 *       404:
 *         description: Location not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authMiddleware, deleteLocation);

/**
 * @swagger
 * /locations/{id}/migrate-items:
 *   post:
 *     tags: [Locations]
 *     summary: Migrate all items to another location (admin only)
 *     description: Move every item from the source location into the target location within one transaction. Rejected entirely when target capacity is insufficient.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Source location id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetLocationId]
 *             properties:
 *               targetLocationId:
 *                 type: integer
 *                 example: 12
 *     responses:
 *       200:
 *         description: Items migrated successfully
 *       400:
 *         description: Invalid migration (same location, empty source, inactive target, etc.)
 *       409:
 *         description: Target capacity insufficient
 */
router.post('/:id/migrate-items', authMiddleware, roleMiddleware(['ADMIN']), migrateLocationItems);

export default router;
