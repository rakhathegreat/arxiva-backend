import express from 'express';
import {
	getReconProgress,
	postReconProgress,
	deleteReconProgress,
	getReconReports,
	postReconReports,
} from '../controllers/recon.controller.js';
import { authMiddleware } from '../shared/middlewares/auth.middleware.js';

// ─── Router: /recon-progress ──────────────────────────────────────────────────

const progressRouter = express.Router();
progressRouter.use(authMiddleware);

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
progressRouter.get('/', getReconProgress);

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
 *               capturedAt: { type: string, description: ISO timestamp when photo was taken }
 *               timestamp: { type: string, description: legacy alias for capturedAt }
 *     responses:
 *       200: { description: Recon record saved }
 *       403: { description: Item not owned by user }
 *       413: { description: Photo exceeds 1MB }
 */
progressRouter.post('/', postReconProgress);

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
progressRouter.delete('/', deleteReconProgress);

// ─── Router: /recon-reports ───────────────────────────────────────────────────

const reportsRouter = express.Router();
reportsRouter.use(authMiddleware);

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
reportsRouter.get('/', getReconReports);

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
 *                     capturedAt: { type: string }
 *                     timestamp: { type: string, description: legacy alias for capturedAt }
 *     responses:
 *       201: { description: Report saved }
 */
reportsRouter.post('/', postReconReports);

export { progressRouter, reportsRouter };

