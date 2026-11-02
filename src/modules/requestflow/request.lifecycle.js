/**
 * Siklus hidup Request: pembuatan (POST /requests) dan perubahan status
 * (PUT /requests/:id/status). Aturan transisi/RBAC diambil dari `rules.js`.
 */
import prisma from '../../shared/prisma.js';
import { releaseAllocations, completeRequest } from './requestflow.service.js';
import { validateTransition, REQUEST_STATUSES, nextRequestNumber } from './rules.js';
import { regenerateDraftBast, regenerateApprovalDraftBast } from '../bastdoc/handlers.js';
import { createNotification } from '../notification/service.js';

const REQUEST_INCLUDE = {
	requester: { include: { profile: true } },
	destinationUser: { include: { profile: true } },
	providerPartner: { include: { profile: true } },
	requestItems: { include: { materialCategory: true, brand: true, model: true } },
};

const MAX_NUMBER_ATTEMPTS = 5;

/** Nomor terakhir tahun berjalan (prefix `REQ-<year>-`), atau null. */
async function lastRequestNumberOfYear() {
	const prefix = `REQ-${new Date().getFullYear()}-`;
	const last = await prisma.request.findFirst({
		where: { requestNumber: { startsWith: prefix } },
		orderBy: { requestNumber: 'desc' },
		select: { requestNumber: true },
	});
	return last?.requestNumber ?? null;
}

/**
 * Buat request dengan nomor unik, mengulang saat bentrok constraint (P2002).
 * Menggantikan `count()+1` yang race-prone.
 */
async function createWithGeneratedNumber(buildData) {
	for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++) {
		const requestNumber = nextRequestNumber(await lastRequestNumberOfYear());
		try {
			return await prisma.request.create({
				data: buildData(requestNumber),
				include: REQUEST_INCLUDE,
			});
		} catch (error) {
			if (error.code !== 'P2002' || attempt === MAX_NUMBER_ATTEMPTS - 1) throw error;
		}
	}
}

// POST /requests
export const createRequest = async (req, res) => {
	try {
		const {
			requesterId,
			notes,
			items,
			destinationUserId,
			type,
			providerPartnerId,
			isInterPartner,
		} = req.body;
		const isInterMitra = isInterPartner === true || Boolean(providerPartnerId);
		const requestType = isInterMitra
			? 'INTER_MITRA'
			: type === 'RETURN_RUSAK'
				? 'RETURN_RUSAK'
				: 'OUTGOING';

		// Tujuan request (opsional) = mitra lain yang akan menerima barang pinjaman.
		// Hanya boleh menunjuk mitra aktif yang ada, dan bukan dirinya sendiri.
		if (destinationUserId) {
			if (destinationUserId === requesterId) {
				return res.status(400).json({ message: 'Tujuan tidak boleh sama dengan pemohon' });
			}
			const destination = await prisma.user.findUnique({
				where: { id: destinationUserId },
				select: { id: true, role: true, isAktif: true },
			});
			if (!destination || destination.role !== 'MITRA' || !destination.isAktif) {
				return res
					.status(400)
					.json({ message: 'Tujuan request harus merupakan mitra yang aktif' });
			}
		}

		// INTER_MITRA: mitra pemberi wajib, aktif, dan bukan pemohon sendiri.
		if (requestType === 'INTER_MITRA') {
			if (!providerPartnerId || providerPartnerId === requesterId) {
				return res.status(400).json({
					message:
						'Mitra pemberi (provider) wajib diisi dan tidak boleh sama dengan pemohon',
				});
			}
			const provider = await prisma.user.findUnique({
				where: { id: providerPartnerId },
				select: { id: true, role: true, isAktif: true },
			});
			if (!provider || provider.role !== 'MITRA' || !provider.isAktif) {
				return res
					.status(400)
					.json({ message: 'Mitra pemberi harus merupakan mitra yang aktif' });
			}
		}

		const newRequest = await createWithGeneratedNumber((requestNumber) => ({
			requestNumber,
			type: requestType,
			requesterId,
			destinationUserId: destinationUserId || null,
			providerPartnerId: requestType === 'INTER_MITRA' ? providerPartnerId : null,
			notes,
			requestItems: {
				create: items.map((item) => ({
					materialCategoryId: item.materialCategoryId,
					brandId: item.brandId || null,
					modelId: item.modelId || null,
					quantity: item.quantity,
					serialNumber:
						requestType === 'RETURN_RUSAK' ? item.serialNumber || null : undefined,
				})),
			},
		}));

		if (requestType === 'INTER_MITRA') {
			await createNotification({
				userId: providerPartnerId,
				title: 'Permintaan material antar mitra',
				message: `${newRequest.requestNumber}: ${newRequest.requester?.profile?.nama || 'Mitra'} meminta material dari mitra Anda dan menunggu persetujuan admin.`,
				type: 'REQUEST',
				referenceId: newRequest.id,
			});
		}

		res.status(201).json({ message: 'Request created successfully', request: newRequest });
	} catch (error) {
		console.error('Error in createRequest:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
};

// PUT /requests/:id/status
export const updateRequestStatus = async (req, res) => {
	try {
		const { id } = req.params;
		const { status, rejectionNotes } = req.body;
		const user = req.user;

		if (!REQUEST_STATUSES.includes(status)) {
			return res.status(400).json({ message: 'Invalid status' });
		}

		const request = await prisma.request.findUnique({
			where: { id },
			include: { requestItems: { include: { allocations: true } } },
		});

		if (!request) {
			return res.status(404).json({ message: 'Request not found' });
		}

		if (request.status === 'SELESAI') {
			if (status === 'SELESAI') {
				return res.json({ message: 'Request sudah SELESAI (Idempotent)', request });
			}
			return res.status(400).json({
				message:
					'Request sudah SELESAI dan dikunci. Data maupun status tidak dapat diubah lagi.',
			});
		}

		// RBAC + urutan transisi — satu aturan di modul requestflow
		const transition = validateTransition(
			request.status,
			status,
			user.role,
			request.requesterId,
			user.id,
			request.type,
			request.providerPartnerId,
		);
		if (!transition.ok) {
			return res.status(transition.httpStatus).json({ message: transition.message });
		}

		const isReturnRusak = request.type === 'RETURN_RUSAK';
		const isInterMitra = request.type === 'INTER_MITRA';

		const dataToUpdate = { status };
		const now = new Date();
		if (['DITOLAK', 'DIBATALKAN'].includes(status)) {
			dataToUpdate.rejectionNotes = rejectionNotes || null;
		}
		if (status === 'SIAP') {
			dataToUpdate.approvedAt = now;
			dataToUpdate.processedAt = now;
		}
		if ((isReturnRusak || isInterMitra) && status === 'DISETUJUI') {
			dataToUpdate.approvedAt = now;
			dataToUpdate.processedAt = now;
		}
		if ((isReturnRusak || isInterMitra) && status === 'SERAH') {
			dataToUpdate.shippedAt = now;
		}
		if (status === 'SELESAI') dataToUpdate.completedAt = now;

		// Auto-generate / perbarui BAST Draft saat status menjadi SIAP (keluar)
		// atau DISETUJUI (pengajuan material rusak / permintaan antar mitra)
		if (status === 'SIAP') {
			await regenerateDraftBast(id, user);
		} else if (status === 'DISETUJUI' && (isReturnRusak || isInterMitra)) {
			await regenerateApprovalDraftBast(
				id,
				user,
				isInterMitra ? 'INTER_MITRA' : 'RETURN_RUSAK',
			);
		}

		if (status === 'SELESAI') {
			const updated = await prisma.$transaction(async (tx) => {
				// SATU jalur completion (per-tipe): keluar = transfer item + ledger
				// KELUAR; material rusak = verifikasi pengiriman lalu finalisasi status.
				return completeRequest(tx, request, user);
			});
			return res.json({
				message: 'Request status updated and items mutated',
				request: updated,
			});
		} else if (['DITOLAK', 'DIBATALKAN'].includes(status)) {
			const updated = await prisma.$transaction(async (tx) => {
				await releaseAllocations(tx, request);
				const updatedReq = await tx.request.update({
					where: { id },
					data: dataToUpdate,
					include: { requester: { include: { profile: true } } },
				});

				// Event: penolakan/pembatalan → notify requester
				await createNotification(
					{
						userId: request.requesterId,
						title:
							status === 'DITOLAK' ? 'Permintaan ditolak' : 'Permintaan dibatalkan',
						message: `Permintaan ${request.requestNumber} ${status === 'DITOLAK' ? 'ditolak' : 'dibatalkan'}.${
							rejectionNotes ? ` Catatan: ${rejectionNotes}` : ''
						}`,
						type: 'REQUEST',
						referenceId: request.id,
					},
					tx,
				);

				return updatedReq;
			});
			return res.json({
				message: 'Request status updated and allocations released',
				request: updated,
			});
		} else {
			const updated = await prisma.request.update({
				where: { id },
				data: dataToUpdate,
				include: { requester: { include: { profile: true } } },
			});
			return res.json({ message: 'Request status updated', request: updated });
		}
	} catch (error) {
		console.error('Error in updateRequestStatus:', error);
		if (error.code === 'RETURN_RUSAK_INCOMPLETE') {
			return res.status(409).json({ message: error.message, reason: error.code });
		}
		res.status(error.code === 'CAPACITY_FULL' ? 409 : 500).json({
			message: error.message || 'Internal server error',
		});
	}
};
