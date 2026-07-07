import express from 'express';
import { getRequests, getRequestById, createRequest, updateRequestStatus } from '../controllers/request.controller.js';

const router = express.Router();

/**
 * @swagger
 * /requests:
 *   get:
 *     tags: [Requests]
 *     summary: Get all requests
 *     description: Retrieve a list of request records.
 *     responses:
 *       200:
 *         description: Requests retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/', getRequests);

/**
 * @swagger
 * /requests/{id}:
 *   get:
 *     tags: [Requests]
 *     summary: Get request by ID
 *     description: Retrieve a single request by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Request retrieved successfully
 *       404:
 *         description: Request not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', getRequestById);

/**
 * @swagger
 * /requests:
 *   post:
 *     tags: [Requests]
 *     summary: Create request
 *     description: Create a new inventory request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [requesterId, items]
 *             properties:
 *               requesterId:
 *                 type: string
 *               notes:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     categoryId:
 *                       type: integer
 *                     brandId:
 *                       type: integer
 *                     quantity:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Request created successfully
 *       500:
 *         description: Internal server error
 */
router.post('/', createRequest);

/**
 * @swagger
 * /requests/{id}/status:
 *   put:
 *     tags: [Requests]
 *     summary: Update request status
 *     description: Update status for an existing request.
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 example: DISETUJUI
 *     responses:
 *       200:
 *         description: Request status updated successfully
 *       400:
 *         description: Invalid status
 *       500:
 *         description: Internal server error
 */
router.put('/:id/status', updateRequestStatus);

export default router;
