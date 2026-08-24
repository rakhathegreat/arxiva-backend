import { Router } from 'express';
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js';
import { receiveItems } from './intake.service.js';

const router = Router();

// POST /intake — satu-satunya pintu tulis barang masuk (ADR-0002)
router.post('/', authMiddleware, async (req, res) => {
	try {
		const items = req.body?.items;
		if (!Array.isArray(items) || items.length === 0) {
			return res.status(400).json({ message: "Body wajib berisi array 'items' yang tidak kosong" });
		}
		if (items.length > 500) {
			return res.status(400).json({ message: 'Maksimal 500 item per batch' });
		}

		const results = await receiveItems(req.user, items);
		res.json({ results });
	} catch (error) {
		console.error('Error in intake:', error);
		res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
	}
});

export default router;
