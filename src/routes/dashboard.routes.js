import express from 'express';
import { getMitraPerformance, getDashboardSummary } from '../controllers/dashboard.controller.js';
import { authMiddleware } from '../shared/middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

/**
 * @swagger
 * /dashboard/stats/summary:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get aggregated dashboard summary
 *     description: Single lightweight payload with all dashboard stats (inventory counts, mitra distribution, request counts, recent requests/activity, daily transaction series, mitra performance). Aggregations run server-side.
 *     responses:
 *       200:
 *         description: Dashboard summary retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/stats/summary', getDashboardSummary);

/**
 * @swagger
 * /dashboard/stats/mitra-performance:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get mitra performance and BAST depletion metrics
 *     description: Retrieve aggregated metrics for partner BAST depletion lifespan
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/stats/mitra-performance', getMitraPerformance);

export default router;
