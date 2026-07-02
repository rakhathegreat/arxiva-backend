import express from 'express';
import {
    getLocations,
    createLocation,
    updateLocation,
    createLevel,
    updateLevel,
    toggleLocation,
    toggleLevel,
    deleteLocation,
    deleteLevel
} from '../controllers/location.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

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
 * /locations/{id}/levels:
 *   post:
 *     tags: [Locations]
 *     summary: Create level
 *     description: Create a new level inside a location.
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
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Level 1
 *               capacity:
 *                 type: integer
 *                 example: 30
 *               brandRule:
 *                 type: string
 *                 example: Samsung
 *     responses:
 *       201:
 *         description: Level created successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Internal server error
 */
router.post('/:id/levels', authMiddleware, createLevel);

/**
 * @swagger
 * /locations/{id}/levels/{levelId}:
 *   put:
 *     tags: [Locations]
 *     summary: Update level
 *     description: Update an existing level inside a location.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: levelId
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
 *                 example: Level 2
 *               capacity:
 *                 type: integer
 *                 example: 40
 *     responses:
 *       200:
 *         description: Level updated successfully
 *       404:
 *         description: Level not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id/levels/:levelId', authMiddleware, updateLevel);

/**
 * @swagger
 * /locations/{id}/levels/{levelId}/toggle:
 *   patch:
 *     tags: [Locations]
 *     summary: Toggle level status
 *     description: Activate or deactivate a level.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: levelId
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
 *                 example: false
 *     responses:
 *       200:
 *         description: Level status updated successfully
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/levels/:levelId/toggle', authMiddleware, toggleLevel);

/**
 * @swagger
 * /locations/{id}/levels/{levelId}:
 *   delete:
 *     tags: [Locations]
 *     summary: Delete level
 *     description: Delete an existing level from a location.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: levelId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Level deleted successfully
 *       404:
 *         description: Level not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id/levels/:levelId', authMiddleware, deleteLevel);

export default router;
