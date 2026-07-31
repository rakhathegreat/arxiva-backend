import express from 'express';
import { getMitraPerformance } from '../controllers/dashboard.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

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
