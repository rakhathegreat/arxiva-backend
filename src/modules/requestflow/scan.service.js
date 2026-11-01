/**
 * Serah terima antar mitra (INTER_MITRA) — dua tahap scan SN:
 *   scanParty="provider" → simpan donorSerialNumbers, buat RequestAllocation,
 *                          status DISETUJUI → SERAH
 *   scanParty="receiver" → verifikasi SN yang diterima cocok dengan donor,
 *                          status SERAH → SELESAI (transfer via completeRequest)
 */
import prisma from '../../shared/prisma.js';
import { completeRequest } from './requestflow.service.js';
import { validateTransition } from './rules.js';
import { createNotification } from '../notification/service.js';

const normalize = (s) =>
	String(s || '')
		.trim()
		.toUpperCase();

const mismatched = (message) => Object.assign(new Error(message), { code: 'SCAN_MISMATCH' });

/**
 * Ambil SN dari payload scan — menerima `serialNumbers` array atau string
 * tunggal `donorSerialNumber`/`receiverSerialNumber` yang dipisah koma.
 */
function extractSerialNumbers(scan, primaryKey) {
	const raw = Array.isArray(scan.serialNumbers)
		? scan.serialNumbers
		: String(scan[primaryKey] || scan.donorSerialNumber || scan.receiverSerialNumber || '')
				.split(',')
				.filter(Boolean);
	return raw.map(normalize).filter(Boolean);
}

// PUT /peminjaman-mitra/:id/scan
export const scanInterPartnerItems = async (req, res) => {
	try {
		const { id } = req.params;
		const { scanParty, items } = req.body;
		const user = req.user;

		if (!['provider', 'receiver'].includes(scanParty)) {
			return res.status(400).json({ message: 'scanParty harus "provider" atau "receiver"' });
		}
		if (!Array.isArray(items) || items.length === 0) {
			return res.status(400).json({ message: 'Daftar item hasil scan wajib diisi' });
		}

		const request = await prisma.request.findUnique({
			where: { id },
			include: {
				requester: { include: { profile: true } },
				providerPartner: { include: { profile: true } },
				requestItems: { include: { allocations: true } },
			},
		});

		if (!request) return res.status(404).json({ message: 'Request tidak ditemukan' });
		if (request.type !== 'INTER_MITRA') {
			return res
				.status(400)
				.json({ message: 'Endpoint scan hanya untuk permintaan antar mitra' });
		}

		const now = new Date();
		const isProviderScan = scanParty === 'provider';

		// RBAC + transisi: provider scan = DISETUJUI→SERAH; receiver scan = SERAH→SELESAI
		const targetStatus = isProviderScan ? 'SERAH' : 'SELESAI';
		const transition = validateTransition(
			request.status,
			targetStatus,
			user.role,
			request.requesterId,
			user.id,
			request.type,
			request.providerPartnerId,
		);
		if (!transition.ok) {
			return res.status(transition.httpStatus).json({ message: transition.message });
		}

		if (isProviderScan) {
			// Lokasi mitra pemberi — sumber barang yang diserahkan
			const providerLoc = await prisma.userLocation.findFirst({
				where: { userId: request.providerPartnerId },
				include: { location: true },
			});
			if (!providerLoc) {
				return res
					.status(400)
					.json({ message: 'Mitra pemberi belum memiliki lokasi penyimpanan' });
			}
			const providerLocationId = providerLoc.locationId;

			await prisma.$transaction(async (tx) => {
				const riById = new Map(request.requestItems.map((ri) => [ri.id, ri]));

				for (const scan of items) {
					const requestItemId = scan.requestItemId || scan.id;
					const ri = riById.get(requestItemId);
					if (!ri) {
						throw mismatched(
							`Detail barang ${requestItemId} bukan bagian dari request ini`,
						);
					}

					const sns = extractSerialNumbers(scan, 'donorSerialNumber');

					if (sns.length !== ri.quantity) {
						throw mismatched(
							`Jumlah SN hasil scan (${sns.length}) tidak sama dengan kuantitas permintaan (${ri.quantity}) untuk ${ri.materialCategory?.nama || ri.id}`,
						);
					}

					const foundItems = await tx.item.findMany({
						where: { serialNumber: { in: sns } },
						include: { model: true },
					});
					if (foundItems.length !== sns.length) {
						const missing = sns.filter(
							(sn) => !foundItems.some((it) => normalize(it.serialNumber) === sn),
						);
						throw mismatched(`Barang dengan SN ${missing.join(', ')} tidak ditemukan`);
					}

					for (const item of foundItems) {
						if (item.model?.materialCategoryId !== ri.materialCategoryId) {
							throw mismatched(
								`SN ${item.serialNumber} bukan kategori barang yang diminta`,
							);
						}
						if (item.locationId !== providerLocationId) {
							throw mismatched(
								`SN ${item.serialNumber} tidak berada di lokasi mitra pemberi`,
							);
						}
					}

					const foundIds = new Set(foundItems.map((it) => it.id));
					const doubleBooked = await tx.requestAllocation.findFirst({
						where: {
							itemId: { in: [...foundIds] },
							requestItem: { requestId: { not: request.id } },
						},
						include: { requestItem: true },
					});
					if (doubleBooked) {
						throw mismatched('Salah satu barang sudah dialokasikan ke request lain');
					}

					await tx.requestAllocation.deleteMany({ where: { requestItemId: ri.id } });
					await tx.requestAllocation.createMany({
						data: foundItems.map((item) => ({
							requestItemId: ri.id,
							itemId: item.id,
							allocatedById: user.id,
						})),
					});

					await tx.requestItem.update({
						where: { id: ri.id },
						data: {
							donorSerialNumbers: sns.join(','),
							donorScannedAt: now,
							fulfilledQuantity: sns.length,
						},
					});
				}

				await tx.request.update({
					where: { id: request.id },
					data: { status: 'SERAH', shippedAt: now },
				});
			});

			await createNotification({
				userId: request.requesterId,
				title: 'Barang diserahkan mitra pemberi',
				message: `Permintaan ${request.requestNumber} telah diserahkan oleh ${
					request.providerPartner?.profile?.nama || 'mitra pemberi'
				}. Silakan verifikasi dan scan barang yang diterima.`,
				type: 'REQUEST',
				referenceId: request.id,
			});

			return res.json({
				message: 'Scan mitra pemberi berhasil, barang siap diserahkan',
				request,
			});
		}

		// — Receiver scan (SELESAI) —
		const updated = await prisma.$transaction(async (tx) => {
			const riById = new Map(request.requestItems.map((ri) => [ri.id, ri]));

			for (const scan of items) {
				const requestItemId = scan.requestItemId || scan.id;
				const ri = riById.get(requestItemId);
				if (!ri) {
					throw mismatched(
						`Detail barang ${requestItemId} bukan bagian dari request ini`,
					);
				}
				if (!ri.donorSerialNumbers) {
					throw mismatched(
						`Barang ${ri.materialCategory?.nama || ri.id} belum di-scan oleh mitra pemberi`,
					);
				}

				const receivedSns = extractSerialNumbers(scan, 'receiverSerialNumber');
				const donorSns = ri.donorSerialNumbers.split(',').map(normalize).filter(Boolean);

				const donorSet = new Set(donorSns);
				const mismatch = receivedSns.filter((sn) => !donorSet.has(sn));
				const missing = donorSns.filter((sn) => !receivedSns.includes(sn));
				if (mismatch.length > 0 || missing.length > 0) {
					throw mismatched(
						`Barang yang diterima tidak cocok dengan serah dari pemberi (Lain: ${mismatch.join(', ') || '-'}, Kurang: ${missing.join(', ') || '-'})`,
					);
				}

				await tx.requestItem.update({
					where: { id: ri.id },
					data: {
						receiverSerialNumbers: receivedSns.join(','),
						receiverScannedAt: now,
					},
				});
			}

			// Transfer + finalisasi SELESAI — satu jalur completion requestflow
			return completeRequest(tx, request, user);
		});

		await createNotification({
			userId: request.providerPartnerId,
			title: 'Serah terima antar mitra selesai',
			message: `Serah terima ${request.requestNumber} telah dikonfirmasi selesai oleh ${
				request.requester?.profile?.nama || 'mitra penerima'
			}. Barang kini menjadi milik mitra peminta.`,
			type: 'REQUEST',
			referenceId: request.id,
		});

		return res.json({
			message: 'Scan mitra penerima berhasil, serah terima selesai',
			request: updated,
		});
	} catch (error) {
		console.error('Error in scanInterPartnerItems:', error);
		if (error.code === 'SCAN_MISMATCH' || error.code === 'P2002') {
			return res.status(400).json({ message: error.message });
		}
		res.status(error.code === 'CAPACITY_FULL' ? 409 : 500).json({
			message: error.message || 'Internal server error',
		});
	}
};
