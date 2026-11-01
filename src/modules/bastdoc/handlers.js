/**
 * Handler HTTP dokumen BAST: generate/unduh PDF dan tanda tangan.
 *
 * Dipisah dari controller request lama (1264 baris) supaya semua penulisan
 * dokumen BAST melewati satu pintu modul bastdoc. Anotasi Swagger tetap di
 * `src/routes/request.routes.js` (swagger hanya memindai `src/routes/*.js`).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import prisma from '../../shared/prisma.js';
import { generateBastPdfStream, generateAndSaveBastPdf } from '../../services/pdf.service.js';
import { resolveAdminIdentity, completeRequest } from '../requestflow/requestflow.service.js';
import { createNotification } from '../notification/service.js';
import { buildAllocationSnapshot, buildRequestItemsSnapshot } from './snapshot.js';
import {
	ensureDeliveryDocument,
	finalizeDeliveryDocument,
	upsertDraftDeliveryDocument,
} from './service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// `public/` ada tiga level di atas modul ini (src/modules/bastdoc → public).
const resolvePublic = (relativePath) =>
	path.resolve(__dirname, '../../../public', relativePath.replace(/^\//, ''));

/**
 * Regenerasi PDF BAST draft + snapshot alokasi terkini (dipanggil saat SIAP
 * maupun setelah komposisi alokasi berubah selama status masih SIAP).
 */
export async function regenerateDraftBast(requestId, user) {
	const { name: adminName, signatureUrl: adminSigUrl } = await resolveAdminIdentity({
		actingAdmin: user,
	});

	const reqFull = await prisma.request.findUnique({
		where: { id: requestId },
		include: {
			requester: { include: { profile: true } },
			requestItems: {
				include: {
					materialCategory: true,
					brand: true,
					model: true,
					allocations: {
						include: {
							item: {
								include: {
									model: { include: { brand: true, materialCategory: true } },
								},
							},
						},
					},
				},
			},
		},
	});

	const itemsSnapshotData = buildAllocationSnapshot(reqFull);

	const ptName = reqFull.requester?.profile?.nama || reqFull.requester?.username || 'PT / Mitra';

	const draftBastData = {
		id: reqFull.id,
		requestNumber: reqFull.requestNumber,
		title: reqFull.title,
		status: 'SIAP',
		notes: reqFull.notes,
		requestedAt: reqFull.requestedAt,
		processedAt: new Date(),
		completedAt: null,
		partnerType: reqFull.requester?.profile?.partnerType || 'gangguan',
		requesterName: ptName,
		picName: ptName,
		picSignatureUrl: null, // Unsigned Draft
		generatedByName: adminName,
		kpSignatureUrl: adminSigUrl,
		allocations: itemsSnapshotData,
	};

	const draftFilename = `bast-draft-${reqFull.requestNumber}.pdf`;
	const { relativeFilePath } = await generateAndSaveBastPdf(draftBastData, draftFilename);

	await upsertDraftDeliveryDocument({
		requestId,
		requestNumber: reqFull.requestNumber,
		generatedById: user.id,
		filePath: relativeFilePath,
		kpName: adminName,
		kpSignatureUrl: adminSigUrl,
		itemsSnapshot: itemsSnapshotData,
	});
}

/**
 * Hasilkan BAST draft saat admin menyetujui (DISETUJUI) pengajuan material rusak
 * (RETURN_RUSAK) atau permintaan antar mitra (INTER_MITRA). Item diambil dari
 * requestItems (bukan alokasi), karena pengembalian rusak / antar mitra tidak
 * melalui alokasi keluar admin.
 *
 * @param {string} requestId
 * @param {object} user
 * @param {'RETURN_RUSAK'|'INTER_MITRA'} flow
 */
export async function regenerateApprovalDraftBast(requestId, user, flow) {
	const isReturnRusak = flow === 'RETURN_RUSAK';
	const isInterMitra = flow === 'INTER_MITRA';
	const { name: adminName, signatureUrl: adminSigUrl } = await resolveAdminIdentity({
		actingAdmin: user,
	});

	const reqFull = await prisma.request.findUnique({
		where: { id: requestId },
		include: {
			requester: { include: { profile: true } },
			providerPartner: { include: { profile: true } },
			requestItems: {
				include: {
					materialCategory: true,
					brand: true,
					model: { include: { brand: true } },
				},
			},
		},
	});

	const itemsSnapshotData = buildRequestItemsSnapshot(reqFull, {
		kondisi: isReturnRusak ? 'Rusak' : 'Baik',
	});

	const ptName = reqFull.requester?.profile?.nama || reqFull.requester?.username || 'PT / Mitra';

	const returnBastData = {
		id: reqFull.id,
		requestNumber: reqFull.requestNumber,
		title: reqFull.title,
		status: 'DISETUJUI',
		notes: reqFull.notes,
		requestedAt: reqFull.requestedAt,
		processedAt: new Date(),
		completedAt: null,
		partnerType: reqFull.requester?.profile?.partnerType || 'gangguan',
		requesterName: ptName,
		picName: ptName,
		picSignatureUrl: null, // Unsigned sampai penyerahan (SERAH)
		generatedByName: adminName,
		kpSignatureUrl: adminSigUrl,
		allocations: itemsSnapshotData,
		// INTER_MITRA: mitra pemberi ikut dicantumkan sebagai konteks transaksi
		providerName: isInterMitra
			? reqFull.providerPartner?.profile?.nama || reqFull.providerPartner?.username || null
			: null,
	};

	const draftFilename = isReturnRusak
		? `bast-rusak-${reqFull.requestNumber}.pdf`
		: `bast-mitra-${reqFull.requestNumber}.pdf`;
	const { relativeFilePath } = await generateAndSaveBastPdf(returnBastData, draftFilename);

	await upsertDraftDeliveryDocument({
		requestId,
		requestNumber: reqFull.requestNumber,
		generatedById: user.id,
		filePath: relativeFilePath,
		kpName: adminName,
		kpSignatureUrl: adminSigUrl,
		itemsSnapshot: itemsSnapshotData,
	});
}

// GET /requests/:id/bast
export const downloadBast = async (req, res) => {
	try {
		const { id } = req.params;
		const user = req.user;

		const request = await prisma.request.findUnique({
			where: { id },
			include: {
				requester: { include: { profile: true } },
				requestItems: {
					include: {
						materialCategory: true,
						brand: true,
						model: true,
						allocations: {
							include: {
								item: {
									include: {
										model: {
											include: {
												brand: true,
												materialCategory: true,
											},
										},
									},
								},
							},
						},
					},
				},
				deliveryDocument: {
					include: { generatedBy: { include: { profile: true } } },
				},
			},
		});

		if (!request) {
			return res.status(404).json({ message: 'Request tidak ditemukan' });
		}

		// Proteksi: Hanya Admin atau Mitra Pemohon yang boleh mengakses BAST
		if (user.role !== 'ADMIN' && user.id !== request.requesterId) {
			return res
				.status(403)
				.json({ message: 'Anda tidak memiliki akses ke dokumen BAST ini' });
		}

		// Hanya bisa generate BAST untuk status SIAP atau SELESAI
		// (material rusak / antar mitra: DISETUJUI / SERAH / SELESAI)
		if (request.type === 'RETURN_RUSAK' || request.type === 'INTER_MITRA') {
			if (!['DISETUJUI', 'SERAH', 'SELESAI'].includes(request.status)) {
				return res.status(400).json({
					message:
						'BAST hanya tersedia untuk request berstatus DISETUJUI, SERAH, atau SELESAI',
				});
			}
		} else if (!['SIAP', 'SELESAI'].includes(request.status)) {
			return res
				.status(400)
				.json({ message: 'BAST hanya tersedia untuk request berstatus SIAP atau SELESAI' });
		}

		// Auto-create DeliveryDocument jika belum ada — satu pintu modul bastdoc
		await ensureDeliveryDocument({
			requestId: request.id,
			requestNumber: request.requestNumber,
			generatedById: user.id,
		});
		const deliveryDocument = await prisma.deliveryDocument.findUnique({
			where: { requestId: request.id },
			include: { generatedBy: { include: { profile: true } } },
		});

		res.json({
			message: 'Data BAST berhasil dimuat',
			document: deliveryDocument,
			request: {
				id: request.id,
				requestNumber: request.requestNumber,
				status: request.status,
				notes: request.notes,
				requestedAt: request.requestedAt,
				processedAt: request.processedAt,
				completedAt: request.completedAt,
				requesterName:
					request.requester?.profile?.nama || request.requester?.username || 'Unknown',
				generatedByName:
					deliveryDocument.generatedBy?.profile?.picName ||
					deliveryDocument.generatedBy?.profile?.nama ||
					deliveryDocument.generatedBy?.username ||
					'Admin',
				allocations: buildAllocationSnapshot(request),
			},
		});
	} catch (error) {
		console.error('Error in downloadBast:', error);
		res.status(error.code === 'CAPACITY_FULL' ? 409 : 500).json({
			message: error.message || 'Internal server error',
		});
	}
};

// GET /requests/:id/bast-pdf
export const downloadBastPdf = async (req, res) => {
	try {
		const { id } = req.params;
		const user = req.user;

		const request = await prisma.request.findUnique({
			where: { id },
			include: {
				requester: { include: { profile: true } },
				requestItems: {
					include: {
						materialCategory: true,
						brand: true,
						model: true,
						allocations: {
							include: {
								item: {
									include: {
										model: {
											include: {
												brand: true,
												materialCategory: true,
											},
										},
									},
								},
							},
						},
					},
				},
				deliveryDocument: {
					include: { generatedBy: { include: { profile: true } } },
				},
			},
		});

		if (!request) {
			return res.status(404).json({ message: 'Request tidak ditemukan' });
		}

		// Proteksi: Hanya Admin atau Mitra Pemohon yang boleh mengakses BAST
		if (user.role !== 'ADMIN' && user.id !== request.requesterId) {
			return res
				.status(403)
				.json({ message: 'Anda tidak memiliki akses ke dokumen BAST ini' });
		}

		// Hanya bisa generate BAST untuk status SIAP atau SELESAI
		// (material rusak / antar mitra: DISETUJUI / SERAH / SELESAI)
		if (request.type === 'RETURN_RUSAK' || request.type === 'INTER_MITRA') {
			if (!['DISETUJUI', 'SERAH', 'SELESAI'].includes(request.status)) {
				return res.status(400).json({
					message:
						'BAST hanya tersedia untuk request berstatus DISETUJUI, SERAH, atau SELESAI',
				});
			}
		} else if (!['SIAP', 'SELESAI'].includes(request.status)) {
			return res
				.status(400)
				.json({ message: 'BAST hanya tersedia untuk request berstatus SIAP atau SELESAI' });
		}

		// Auto-create DeliveryDocument jika belum ada — satu pintu modul bastdoc
		await ensureDeliveryDocument({
			requestId: request.id,
			requestNumber: request.requestNumber,
			generatedById: user.id,
		});
		const deliveryDocument = await prisma.deliveryDocument.findUnique({
			where: { requestId: request.id },
			include: { generatedBy: { include: { profile: true } } },
		});

		// If static file exists, stream directly for legal immutability
		const isFinalStatus =
			request.status === 'SELESAI' ||
			(request.type === 'RETURN_RUSAK' && request.status === 'SERAH');
		if (deliveryDocument.finalFilePath && isFinalStatus) {
			const absFinal = resolvePublic(deliveryDocument.finalFilePath);
			if (fs.existsSync(absFinal)) {
				res.setHeader('Content-Type', 'application/pdf');
				res.setHeader(
					'Content-Disposition',
					`inline; filename=BAST-FINAL-${request.requestNumber}.pdf`,
				);
				return fs.createReadStream(absFinal).pipe(res);
			}
		} else if (deliveryDocument.filePath) {
			const absDraft = resolvePublic(deliveryDocument.filePath);
			if (fs.existsSync(absDraft)) {
				res.setHeader('Content-Type', 'application/pdf');
				res.setHeader(
					'Content-Disposition',
					`inline; filename=BAST-DRAFT-${request.requestNumber}.pdf`,
				);
				return fs.createReadStream(absDraft).pipe(res);
			}
		}

		// Identitas Pihak Pertama — rantai tunggal dari modul requestflow
		const { name: adminName, signatureUrl: adminSigUrl } = await resolveAdminIdentity({
			deliveryDocument,
			request,
		});

		const ptName =
			request.requester?.profile?.nama || request.requester?.username || 'PT / Mitra';

		const allocationsData = deliveryDocument.itemsSnapshot
			? JSON.parse(deliveryDocument.itemsSnapshot)
			: buildAllocationSnapshot(request);

		// Format data to fit BAST template structure
		const partnerType = request.requester?.profile?.partnerType || 'gangguan';

		// Pihak Kedua: Uses signerName if signed; otherwise defaults to PT Name (Nama PT / Mitra)
		const recipientName =
			deliveryDocument.signerName || '( ........................................ )';
		const recipientSigUrl = deliveryDocument.signerSignatureUrl || null;

		const bastData = {
			id: request.id,
			requestNumber: request.requestNumber,
			title: request.title,
			status: request.status,
			notes: request.notes,
			requestedAt: request.requestedAt,
			processedAt: request.processedAt,
			completedAt: request.completedAt,
			partnerType,
			requesterName: ptName,
			kpName: adminName || 'Admin',
			kpSignatureUrl: adminSigUrl,
			signerName: recipientName,
			signerSignatureUrl: recipientSigUrl,
			allocations: allocationsData,
		};

		const pdfStream = await generateBastPdfStream(bastData);

		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `inline; filename=BAST-${request.requestNumber}.pdf`);

		pdfStream.pipe(res);
		pdfStream.end();
	} catch (error) {
		console.error('Error in downloadBastPdf:', error);
		res.status(error.code === 'CAPACITY_FULL' ? 409 : 500).json({
			message: error.message || 'Internal server error',
		});
	}
};

// GET /requests/:id/pdf-draft
export const downloadBastDraftPdf = async (req, res) => {
	try {
		const { id } = req.params;
		const user = req.user;

		const request = await prisma.request.findUnique({
			where: { id },
			include: { deliveryDocument: true },
		});

		if (!request) return res.status(404).json({ message: 'Request tidak ditemukan' });
		if (user.role !== 'ADMIN' && user.id !== request.requesterId) {
			return res.status(403).json({ message: 'Akses ditolak' });
		}

		const doc = request.deliveryDocument;
		if (doc?.filePath) {
			const absPath = resolvePublic(doc.filePath);
			if (fs.existsSync(absPath)) {
				res.setHeader('Content-Type', 'application/pdf');
				res.setHeader(
					'Content-Disposition',
					`inline; filename=BAST-DRAFT-${request.requestNumber}.pdf`,
				);
				return fs.createReadStream(absPath).pipe(res);
			}
		}

		return downloadBastPdf(req, res);
	} catch (error) {
		console.error('Error in downloadBastDraftPdf:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
};

// GET /requests/:id/pdf-signed
export const downloadBastSignedPdf = async (req, res) => {
	try {
		const { id } = req.params;
		const user = req.user;

		const request = await prisma.request.findUnique({
			where: { id },
			include: { deliveryDocument: true },
		});

		if (!request) return res.status(404).json({ message: 'Request tidak ditemukan' });
		if (user.role !== 'ADMIN' && user.id !== request.requesterId) {
			return res.status(403).json({ message: 'Akses ditolak' });
		}

		const doc = request.deliveryDocument;
		if (doc?.finalFilePath) {
			const absPath = resolvePublic(doc.finalFilePath);
			if (fs.existsSync(absPath)) {
				res.setHeader('Content-Type', 'application/pdf');
				res.setHeader(
					'Content-Disposition',
					`inline; filename=BAST-FINAL-${request.requestNumber}.pdf`,
				);
				return fs.createReadStream(absPath).pipe(res);
			}
		}

		return downloadBastPdf(req, res);
	} catch (error) {
		console.error('Error in downloadBastSignedPdf:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
};

// POST /requests/:id/sign-bast
export const signBast = async (req, res) => {
	try {
		const { id } = req.params;
		const user = req.user;

		const request = await prisma.request.findUnique({
			where: { id },
			include: {
				deliveryDocument: true,
				requestItems: { include: { allocations: true } },
			},
		});

		if (!request) {
			return res.status(404).json({ message: 'Request tidak ditemukan' });
		}

		const deliveryDocument = await ensureDeliveryDocument({
			requestId: request.id,
			requestNumber: request.requestNumber,
			generatedById: user.id,
		});

		const now = new Date();
		const updateData = {};

		if (user.role === 'ADMIN') {
			updateData.kpSignedAt = now;
			updateData.kpSignedById = user.id;
		} else if (user.role === 'MITRA') {
			updateData.picSignedAt = now;
			updateData.picSignedById = user.id;
		}

		const updatedDocument = await prisma.deliveryDocument.update({
			where: { id: deliveryDocument.id },
			data: updateData,
		});

		// Alur pengajuan material rusak (RETURN_RUSAK): tanda tangan tidak
		// otomatis menyelesaikan request. Admin TTD saat DISETUJUI; mitra TTD
		// saat SERAH → BAST difinalisasi (siap diserahkan), SELESAI ditetapkan
		// admin setelah intake terikat selesai.
		if (request.type === 'RETURN_RUSAK') {
			if (user.role === 'ADMIN') {
				return res.json({
					message: 'BAST signed successfully',
					document: updatedDocument,
					isFullySigned: false,
					requestStatus: request.status,
				});
			}

			if (user.role === 'MITRA') {
				const reqFull = await prisma.request.findUnique({
					where: { id: request.id },
					include: {
						requester: { include: { profile: true } },
						deliveryDocument: true,
						requestItems: {
							include: {
								materialCategory: true,
								brand: true,
								model: { include: { brand: true } },
							},
						},
					},
				});
				const { name: adminName2, signatureUrl: adminSig2 } = await resolveAdminIdentity({
					deliveryDocument: reqFull.deliveryDocument,
					actingAdmin: user,
				});
				const signedAt = new Date();
				const ptName =
					reqFull.requester?.profile?.nama || reqFull.requester?.username || 'PT / Mitra';
				const itemsSnapshotData = buildRequestItemsSnapshot(reqFull, { kondisi: 'Rusak' });
				const finalBastData = {
					id: reqFull.id,
					requestNumber: reqFull.requestNumber,
					title: reqFull.title,
					status: 'SERAH',
					notes: reqFull.notes,
					requestedAt: reqFull.requestedAt,
					processedAt: reqFull.processedAt || signedAt,
					completedAt: null,
					partnerType: reqFull.requester?.profile?.partnerType || 'gangguan',
					requesterName: ptName,
					signerName: ptName,
					signerSignatureUrl: user.profile?.picSignatureUrl || null,
					kpName: adminName2,
					kpSignatureUrl: adminSig2,
					allocations: itemsSnapshotData,
				};
				const finalFilename = `bast-rusak-final-${reqFull.requestNumber}.pdf`;
				const { relativeFilePath } = await generateAndSaveBastPdf(
					finalBastData,
					finalFilename,
				);
				await finalizeDeliveryDocument({
					requestId: reqFull.id,
					requestNumber: reqFull.requestNumber,
					generatedById: user.id,
					now: signedAt,
					signerName: ptName,
					signatureUrl: user.profile?.picSignatureUrl || null,
					adminName: adminName2,
					adminSignatureUrl: adminSig2,
					filePath: relativeFilePath,
					itemsSnapshot: itemsSnapshotData,
				});
				return res.json({
					message: 'BAST returned material final',
					document: await prisma.deliveryDocument.findUnique({
						where: { requestId: reqFull.id },
					}),
					isFullySigned: true,
					requestStatus: request.status,
				});
			}
		}

		// Cek apakah kedua TTD sudah lengkap — jika ya, ubah status request ke SELESAI
		const isFullySigned = !!(updatedDocument.kpSignedById && updatedDocument.picSignedById);
		let requestStatus = request.status;

		if (isFullySigned) {
			const updatedRequest = await prisma.$transaction(async (tx) => {
				// SATU jalur completion (D9/D10) — sama dengan endpoint status.
				return completeRequest(tx, request, user);
			});
			requestStatus = updatedRequest.status;
		}

		res.json({
			message: 'BAST signed successfully',
			document: updatedDocument,
			isFullySigned,
			requestStatus,
		});
	} catch (error) {
		console.error('Error in signBast:', error);
		if (error.code === 'CAPACITY_FULL') {
			return res.status(409).json({ message: error.message, reason: error.code });
		}
		res.status(error.code === 'CAPACITY_FULL' ? 409 : 500).json({
			message: error.message || 'Internal server error',
		});
	}
};
