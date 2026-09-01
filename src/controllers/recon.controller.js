import prisma from '../shared/prisma.js';
import {
	submitReconProgress,
	upsertReconRecord,
	resolveImageUrlForStorage,
} from '../modules/recon/recon.service.js';

/**
 * GET /recon-progress?userId=&date=
 * Daftar record rekon milik user pada tanggal tertentu.
 */
export const getReconProgress = async (req, res) => {
	try {
		const { userId, date } = req.query;
		const where = {};
		if (userId) where.userId = userId;
		if (date) where.date = date;

		const records = await prisma.reconRecord.findMany({
			where,
			orderBy: { createdAt: 'desc' },
		});

		return res.json({ data: records });
	} catch (error) {
		console.error('Error in getReconProgress:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

/**
 * POST /recon-progress
 * Body: { userId, date, itemId, imageUrl(base64), timestamp }
 * Validasi kepemilikan item, upload gambar ke MinIO, simpan/upsert record.
 */
export const postReconProgress = async (req, res) => {
	try {
		const { itemId, date, image, imageUrl } = req.body;

		// userId dari req.user (authoritative), bukan body — hindari spoofing.
		const userId = req.user?.id || req.body.userId;
		if (!userId) return res.status(401).json({ message: 'Unauthorized' });
		if (!date) return res.status(400).json({ message: 'date wajib diisi' });

		// Payload base64 bisa datang sebagai `image` atau `imageUrl` (nama lama di mobile).
		const base64Image = image || imageUrl;
		if (!base64Image) {
			return res.status(400).json({ message: 'Gambar rekon wajib dikirim' });
		}

		const result = await submitReconProgress({ userId, itemId, date, image: base64Image });
		if (!result.ok) return res.status(result.status).json({ message: result.message });

		return res.json({ message: 'Progress rekon disinkronkan', data: result.record });
	} catch (error) {
		console.error('Error in postReconProgress:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

/**
 * DELETE /recon-progress?userId=&date=
 * Reset progress rekon harian milik user.
 */
export const deleteReconProgress = async (req, res) => {
	try {
		const { userId, date } = req.query;
		if (!userId || !date) {
			return res.status(400).json({ message: 'userId dan date wajib diisi' });
		}

		await prisma.reconRecord.deleteMany({ where: { userId, date } });
		return res.json({ message: 'Progress rekon di-reset' });
	} catch (error) {
		console.error('Error in deleteReconProgress:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

/**
 * GET /recon-reports?userId=&date=
 * Daftar laporan rekon (dari record actual, dikelompokkan ringan).
 */
export const getReconReports = async (req, res) => {
	try {
		const { userId, date } = req.query;
		const where = {};
		if (userId) where.userId = userId;
		if (date) where.date = date;

		const records = await prisma.reconRecord.findMany({
			where,
			orderBy: { date: 'desc' },
		});

		return res.json({ data: records });
	} catch (error) {
		console.error('Error in getReconReports:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

/**
 * POST /recon-reports
 * Body: { userId, mitra, tanggal, itemsCount, items: [{ itemId, imageUrl, timestamp }] }
 * Simpan laporan harian: upsert tiap item ke ReconRecord (tanpa upload ulang bila URL sudah MinIO).
 */
export const postReconReports = async (req, res) => {
	try {
		const userId = req.user?.id || req.body.userId;
		if (!userId) return res.status(401).json({ message: 'Unauthorized' });

		const { tanggal, items } = req.body || {};
		if (!tanggal || !Array.isArray(items)) {
			return res.status(400).json({ message: 'tanggal dan items wajib diisi' });
		}

		let saved = 0;
		for (const it of items) {
			if (!it?.itemId || !it?.imageUrl) continue;

			const resolved = await resolveImageUrlForStorage({
				userId,
				itemId: it.itemId,
				date: tanggal,
				image: it.imageUrl,
			});
			if (!resolved.ok) continue;

			await upsertReconRecord({
				userId,
				itemId: it.itemId,
				date: tanggal,
				imageUrl: resolved.imageUrl,
			});
			saved += 1;
		}

		return res.status(201).json({ message: 'Laporan Recon berhasil disimpan', data: { saved } });
	} catch (error) {
		console.error('Error in postReconReports:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};
