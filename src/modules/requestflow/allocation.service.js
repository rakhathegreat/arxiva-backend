/**
 * Alokasi barang fisik ke sebuah Request (POST /requests/:id/allocate).
 * Idempoten: setiap panggilan me-reset alokasi lama lewat `releaseAllocations`.
 */
import prisma from '../../shared/prisma.js';
import { releaseAllocations } from './requestflow.service.js';
import { regenerateDraftBast } from '../bastdoc/handlers.js';

export const allocateItems = async (req, res) => {
	try {
		const { id } = req.params;
		const { itemIds } = req.body;
		const user = req.user;

		if (user.role !== 'ADMIN') {
			return res
				.status(403)
				.json({ message: 'Hanya admin yang dapat mengalokasikan barang' });
		}

		const request = await prisma.request.findUnique({
			where: { id },
			include: { requestItems: true },
		});

		if (!request || (request.status !== 'MENUNGGU' && request.status !== 'SIAP')) {
			return res
				.status(400)
				.json({ message: 'Request tidak valid atau belum bisa dialokasi' });
		}

		await prisma.$transaction(async (tx) => {
			// Reset existing allocations for this request to make this operation idempotent
			await releaseAllocations(tx, request);
			request.requestItems.forEach((ri) => (ri.fulfilledQuantity = 0));

			for (const itemId of itemIds) {
				const item = await tx.item.findUnique({
					where: { id: itemId },
					include: { model: true },
				});

				if (!item || item.status !== 'tersedia') {
					throw new Error(`Item ${itemId} tidak tersedia atau tidak ada.`);
				}

				// Temukan requestItem yang cocok berdasarkan kategori
				let reqItem = request.requestItems.find(
					(ri) => ri.materialCategoryId === item.model.materialCategoryId,
				);

				// Jika tidak ada, buat RequestItem baru (Auto-inject)
				if (!reqItem) {
					reqItem = await tx.requestItem.create({
						data: {
							requestId: id,
							materialCategoryId: item.model.materialCategoryId,
							brandId: item.model.brandId,
							modelId: item.model.id,
							quantity: 0, // 0 karena ini tambahan di luar wishlist awal
							fulfilledQuantity: 0,
						},
					});
					// Tambahkan ke array agar tidak dibuat berulang kali untuk barang sejenis
					request.requestItems.push(reqItem);
				}

				await tx.requestAllocation.create({
					data: {
						requestItemId: reqItem.id,
						itemId,
						allocatedById: user.id,
					},
				});

				await tx.requestItem.update({
					where: { id: reqItem.id },
					data: { fulfilledQuantity: { increment: 1 } },
				});
			}
		});

		// Komposisi berubah → sinkronkan BAST draft bila sudah terbit (status SIAP).
		if (request.status === 'SIAP') {
			try {
				await regenerateDraftBast(id, user);
			} catch (draftErr) {
				console.error('Gagal meregenerasi BAST draft:', draftErr);
			}
		}

		res.json({ message: 'Alokasi berhasil' });
	} catch (error) {
		console.error('Error in allocateItems:', error);
		if (error.code === 'P2002') {
			return res.status(400).json({
				message: 'Double booking: Salah satu barang sudah dialokasikan ke request lain.',
			});
		}
		res.status(error.code === 'CAPACITY_FULL' ? 409 : 500).json({
			message: error.message || 'Internal server error',
		});
	}
};
