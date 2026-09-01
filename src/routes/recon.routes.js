import express from 'express';
import {
	getReconProgress,
	postReconProgress,
	deleteReconProgress,
	getReconReports,
	postReconReports,
} from '../controllers/recon.controller.js';
import { authMiddleware } from '../shared/middlewares/auth.middleware.js';

const router = express.Router();

// Semua endpoint recon butuh autentikasi.
router.use(authMiddleware);

/**
 * @swagger
 * /recon-progress:
 *   get:
 *     tags: [Recon]
 *     summary: Get daily recon progress filtered by user/date
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         schema: { type: string, example: YYYY-MM-DD }
 *     responses:
 *       200: { description: List of recon records }
 */
router.get('/', getReconProgress);

/**
 * @swagger
 * /recon-progress:
 *   post:
 *     tags: [Recon]
 *     summary: Submit a single item recon (base64 photo → MinIO URL)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               itemId: { type: string }
 *               date: { type: string, example: YYYY-MM-DD }
 *               image: { type: string, description: base64 data URL of the photo }
 *               imageUrl: { type: string, description: legacy alias for image }
 *               timestamp: { type: string }
 *     responses:
 *       200: { description: Recon record saved }
 *       403: { description: Item not owned by user }
 *       413: { description: Photo exceeds 1MB }
 */
router.post('/', postReconProgress);

/**
 * @swagger
 * /recon-progress:
 *   delete:
 *     tags: [Recon]
 *     summary: Reset a user's recon progress for a date
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         schema: { type: string, example: YYYY-MM-DD }
 *     responses:
 *       200: { description: Progress reset }
 */
router.delete('/', deleteReconProgress);

/**
 * @swagger
 * /recon-reports:
 *   get:
 *     tags: [Recon]
 *     summary: Get recon reports filtered by user/date
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         schema: { type: string, example: YYYY-MM-DD }
 *     responses:
 *       200: { description: List of recon records }
 */
router.get('/reports', getReconReports);

/**
 * @swagger
 * /recon-reports:
 *   post:
 *     tags: [Recon]
 *     summary: Submit a daily recon report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: string }
 *               mitra: { type: string }
 *               tanggal: { type: string, example: YYYY-MM-DD }
 *               itemsCount: { type: integer }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     itemId: { type: string }
 *                     imageUrl: { type: string }
 *                     timestamp: { type: string }
 *     responses:
 *       201: { description: Report saved }
 */
router.post('/reports', postReconReports);

export default router;
