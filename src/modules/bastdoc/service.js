import prisma from '../../shared/prisma.js';

const db = (tx) => tx ?? prisma;

/**
 * Ambil DeliveryDocument milik request, atau buat kerangka kosong bila belum ada
 * (menggantikan 3 salinan auto-create di request controller).
 */
export async function ensureDeliveryDocument({ requestId, requestNumber, generatedById }, tx = null) {
	const existing = await db(tx).deliveryDocument.findUnique({ where: { requestId } });
	if (existing) return existing;

	return db(tx).deliveryDocument.create({
		data: {
			requestId,
			documentNumber: `BAST/REQ/${requestNumber}`,
			filePath: '',
			generatedById,
		},
	});
}

/**
 * Finalisasi dokumen BAST setelah tanda tangan mobile lengkap — satu pintu
 * create-or-update (menggantikan 2 varian di signatureSession.controller).
 * PDF lokal adalah sumber kebenaran; kolom Drive dibiarkan null (D11).
 */
export async function finalizeDeliveryDocument(
	{
		requestId,
		requestNumber,
		generatedById,
		now,
		signerName,
		signatureUrl,
		adminName,
		adminSignatureUrl,
		filePath,
		itemsSnapshot,
	},
	tx = null
) {
	const client = db(tx);
	const payload = {
		finalFilePath: filePath,
		kpName: adminName,
		kpSignatureUrl: adminSignatureUrl,
		signerName,
		signerSignatureUrl: signatureUrl,
		picSignedAt: now,
		signedAt: now,
		itemsSnapshot: JSON.stringify(itemsSnapshot),
	};

	const existing = await client.deliveryDocument.findUnique({ where: { requestId } });
	if (!existing) {
		return client.deliveryDocument.create({
			data: {
				requestId,
				documentNumber: `BAST/REQ/${requestNumber}`,
				filePath,
				driveFileId: null,
				driveViewUrl: null,
				kpSignedAt: now,
				generatedById,
				...payload,
			},
		});
	}

	return client.deliveryDocument.update({
		where: { id: existing.id },
		data: payload,
	});
}
