import prisma from '../../shared/prisma.js';
import { logMutation } from '../../shared/utils/mutation.util.js';
import { assertCapacityAvailable } from '../storage/service.js';
import { createNotification } from '../notification/service.js';

const db = (tx) => tx ?? prisma;

/**
 * Lepas seluruh alokasi milik request: hapus RequestAllocation + reset
 * fulfilledQuantity. Dipakai controller (DITOLAK/DIBATALKAN, re-allocate)
 * DAN script perawatan orphan allocations.
 */
export async function releaseAllocations(tx, request) {
	const requestItemIds = request.requestItems.map((ri) => ri.id);
	if (requestItemIds.length === 0) return;

	await tx.requestAllocation.deleteMany({
		where: { requestItemId: { in: requestItemIds } },
	});

	await tx.requestItem.updateMany({
		where: { id: { in: requestItemIds } },
		data: { fulfilledQuantity: 0 },
	});
}

/**
 * Pemetaan snapshot alokasi untuk dokumen BAST — satu definisi
 * (sebelumnya diduplikasi 4× di request & signatureSession controller).
 * @param {object} request dengan requestItems.allocations.item.model.{brand,materialCategory}
 */
export function buildAllocationSnapshot(request) {
	return request.requestItems.flatMap((item) =>
		item.allocations.map((alloc) => ({
			materialNumber: alloc.item?.model?.code || '-',
			// Nama barang pada dokumen memakai deskripsi model bila ada.
			materialName: alloc.item?.model?.deskripsi || alloc.item?.model?.nama || '-',
			serialNumber: alloc.item?.serialNumber || '-',
			quantity: 1,
			unit: 'Unit',
		}))
	);
}

/**
 * Rantai identitas/signature Pihak Pertama (admin) — satu definisi
 * (sebelumnya 3 varian). Prioritas:
 *   snapshot dokumen → admin pelaku → allocatedBy bertanda tangan →
 *   ADMIN bertanda tangan → ADMIN mana pun → userProfile bertanda tangan.
 *
 * @returns {Promise<{name: string|null, signatureUrl: string|null}>}
 */
export async function resolveAdminIdentity({ deliveryDocument = null, actingAdmin = null, request = null } = {}) {
	let name = deliveryDocument?.kpName || null;
	let signatureUrl = deliveryDocument?.kpSignatureUrl || null;

	const considerProfile = (profile, fallbackName) => {
		if (!name) name = profile?.picName || profile?.nama || fallbackName || null;
		if (!signatureUrl) signatureUrl = profile?.picSignatureUrl || null;
	};

	if (actingAdmin) {
		considerProfile(actingAdmin.profile, actingAdmin.username);
	}

	if (!signatureUrl && request) {
		const allocAdmin = request.requestItems
			?.flatMap((ri) => ri.allocations ?? [])
			.find((a) => a.allocatedBy?.profile?.picSignatureUrl)?.allocatedBy;
		if (allocAdmin) considerProfile(allocAdmin.profile, allocAdmin.username);
	}

	if (!signatureUrl) {
		const signedAdmin = await prisma.user.findFirst({
			where: { role: 'ADMIN', profile: { picSignatureUrl: { not: null } } },
			include: { profile: true },
		});
		if (signedAdmin) {
			considerProfile(signedAdmin.profile, signedAdmin.username);
		} else {
			const anyAdmin = await prisma.user.findFirst({
				where: { role: 'ADMIN' },
				include: { profile: true },
			});
			if (anyAdmin) considerProfile(anyAdmin.profile, anyAdmin.username);
		}
	}

	if (!signatureUrl) {
		const anySignedProfile = await prisma.userProfile.findFirst({
			where: { picSignatureUrl: { not: null } },
		});
		if (anySignedProfile) considerProfile(anySignedProfile, null);
	}

	return { name: name || 'Admin', signatureUrl };
}

/**
 * Resolve lokasi tujuan mitra; bila belum ada, provision otomatis mengikuti
 * konvensi createUser: lokasi PARTNER bernama nama mitra, kapasitas besar,
 * plus link UserLocation. (D9 — jalur QR tidak lagi diam-diam melewati transfer.)
 */
export async function ensurePartnerLocation(tx, requesterId) {
	const existing = await tx.userLocation.findFirst({
		where: { userId: requesterId },
		include: { location: true },
	});
	if (existing) return existing.locationId;

	const requester = await tx.user.findUnique({
		where: { id: requesterId },
		include: { profile: true },
	});
	const mitraName =
		requester?.profile?.nama || requester?.username || `Mitra-${requesterId.slice(0, 8)}`;

	const location = await tx.location.create({
		data: { name: mitraName, type: 'PARTNER', capacity: 999999 },
	});
	await tx.userLocation.create({
		data: { userId: requesterId, locationId: location.id },
	});
	return location.id;
}

/**
 * Verifikasi pengajuan material rusak lengkap sebelum SELESAI:
 *  - setiap requestItem (per SN untuk ber-SN, per jumlah untuk konsumabel)
 *    sudah di-input via intake RUSAK yang terikat requestId ini,
 *  - BAST sudah dibuat (DeliveryDocument.requestId) .
 * Tidak ada transfer item — material rusak sudah menjadi milik KP saat intake.
 *
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
export async function assertReturnRusakComplete(tx, request) {
	const deliveredRows = await tx.itemMutation.findMany({
		where: { requestId: request.id, type: 'RUSAK' },
		select: { itemId: true },
	});

	const deliveredSet = new Set(deliveredRows.map((r) => r.itemId));

	// Untuk requestItem ber-SN: butuh item dengan SN tersebut ter-return (RUSAK).
	// SN dinormalisasi (upper/trim) — konsisten dgn intake.
	const normalize = (s) => String(s || '').trim().toUpperCase();
	const snItems = request.requestItems?.filter((ri) => ri.serialNumber) ?? [];
	if (snItems.length > 0) {
		const normalizedSns = snItems.map((ri) => normalize(ri.serialNumber));
		const items = await tx.item.findMany({
			where: { serialNumber: { in: normalizedSns } },
			select: { id: true, serialNumber: true },
		});
		const idBySn = new Map(items.map((it) => [normalize(it.serialNumber), it.id]));
		for (const ri of snItems) {
			const itemId = idBySn.get(normalize(ri.serialNumber));
			if (!itemId || !deliveredSet.has(itemId)) {
				return {
					ok: false,
					message: `Belum semua material rusak yang diajukan tiba (SN ${ri.serialNumber} belum di-input)`,
				};
			}
		}
	}

	// Untuk konsumabel (tanpa SN): jumlah RUSAK ter-bound harus memenuhi total quantity.
	const consumedQuantity = request.requestItems?.reduce(
		(acc, ri) => acc + (ri.serialNumber ? 0 : ri.quantity),
		0
	) || 0;
	const deliveredRusakCount = deliveredRows.length;
	if (deliveredRusakCount < consumedQuantity) {
		return {
			ok: false,
			message: `Belum semua material rusak yang diajukan tiba (${deliveredRusakCount}/${consumedQuantity} unit di-input)`,
		};
	}

	const doc = await tx.deliveryDocument.findUnique({ where: { requestId: request.id } });
	if (!doc || !doc.finalFilePath) {
		return { ok: false, message: 'BAST pengajuan material rusak belum final (belum lengkap tanda tangan)' };
	}

	return { ok: true };
}

/**
 * SATU jalur penyelesaian request (D9/D10). WAJIB dipanggil dalam $transaction.
 *
 * 1. Resolusi/auto-provision lokasi tujuan mitra
 * 2. Tagih kapasitas (pessimistic lock, pola identik intake)
 * 3. Update status SELESAI + completedAt
 * 4. Transfer item (digunakan, owner=requester, pindah lokasi) + ledger KELUAR per alokasi
 *
 * Untuk tipe RETURN_RUSAK: TIDAK ada transfer item — verifikasi pengiriman lalu
 * finalisasi status (material rusak sudah milik KP dari intake terikat).
 *
 * @returns {Promise<object>} request ter-update
 */
export async function completeRequest(tx, request, actor) {
	if (request.type === 'RETURN_RUSAK') {
		const check = await assertReturnRusakComplete(tx, request);
		if (!check.ok) {
			const err = new Error(check.message);
			err.code = 'RETURN_RUSAK_INCOMPLETE';
			throw err;
		}

		const updatedReq = await tx.request.update({
			where: { id: request.id },
			data: { status: 'SELESAI', completedAt: new Date() },
			include: { requester: { include: { profile: true } } },
		});

		await createNotification(
			{
				userId: request.requesterId,
				title: 'Pengajuan material rusak selesai',
				message: `Pengajuan material rusak ${request.requestNumber} telah selesai dan diterima KP.`,
				type: 'REQUEST',
				referenceId: request.id,
			},
			tx
		);

		return updatedReq;
	}

	const destinationLocationId = await ensurePartnerLocation(tx, request.requesterId);

	const incomingCount = request.requestItems.reduce(
		(acc, reqItem) => acc + (reqItem.allocations?.length || 0),
		0
	);

	await assertCapacityAvailable(tx, destinationLocationId, incomingCount);

	const updatedReq = await tx.request.update({
		where: { id: request.id },
		data: { status: 'SELESAI', completedAt: new Date() },
		include: { requester: { include: { profile: true } } },
	});

	for (const reqItem of request.requestItems) {
		for (const allocation of reqItem.allocations) {
			const item = await tx.item.findUnique({ where: { id: allocation.itemId } });
			const originLocationId = item?.locationId ?? null;

			await tx.item.update({
				where: { id: allocation.itemId },
				data: {
					status: 'digunakan',
					locationId: destinationLocationId,
					createdById: request.requesterId,
				},
			});

			await logMutation(tx, {
				type: 'KELUAR',
				itemId: allocation.itemId,
				userId: actor.id,
				originLocationId,
				destinationLocationId,
				requestId: request.id,
			});
		}
	}

	// Event: completion → notify requester (Opsi A)
	if (request.type === 'INTER_MITRA') {
		await createNotification(
			{
				userId: request.requesterId,
				title: 'Serah terima antar mitra selesai',
				message: `Permintaan antar mitra ${request.requestNumber} telah selesai. Barang telah diterima di lokasi Anda.`,
				type: 'REQUEST',
				referenceId: request.id,
			},
			tx
		);
		if (request.providerPartnerId) {
			await createNotification(
				{
					userId: request.providerPartnerId,
					title: 'Serah terima antar mitra selesai',
					message: `Permintaan antar mitra ${request.requestNumber} telah selesai. Barang telah diserahkan ke mitra penerima.`,
					type: 'REQUEST',
					referenceId: request.id,
				},
				tx
			);
		}
	} else {
		await createNotification(
			{
				userId: request.requesterId,
				title: 'Permintaan barang selesai',
				message: `Permintaan ${request.requestNumber} telah selesai. Barang telah diterima di lokasi Anda.`,
				type: 'REQUEST',
				referenceId: request.id,
			},
			tx
		);
	}

	return updatedReq;
}
