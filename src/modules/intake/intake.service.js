import prisma from '../../shared/prisma.js';
import { logMutation } from '../../shared/utils/mutation.util.js';
import { getOrCreateCategory, getOrCreateBrand, getOrCreateMaterialModel } from '../catalog/service.js';
import { resolveLocationId, assertCapacityAvailable } from '../storage/service.js';
import {
	REJECT,
	normalizeSn,
	validateInboundItem,
	isMitraInboundAllowed,
	nextInboundNumber,
} from './intake.rules.js';

const ok = (itemId, nomor) => ({ ok: true, itemId, nomor });
const reject = (reason, detail) => ({ ok: false, reason, detail });

function ownerDisplayOf(itemRow) {
	return itemRow.createdBy?.role === 'ADMIN'
		? 'KP Tasikmalaya'
		: itemRow.createdBy?.profile?.nama || itemRow.createdBy?.username || '';
}

function locationNameOf(itemRow) {
	if (!itemRow.location) return '';
	return itemRow.location.parent
		? `${itemRow.location.parent.name} - ${itemRow.location.name}`
		: itemRow.location.name;
}

async function lastInboundNumberToday(tx) {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	const row = await tx.itemMutation.findFirst({
		where: { mutationNumber: { startsWith: `IN-${y}${m}${d}-` } },
		orderBy: { mutationNumber: 'desc' },
		select: { mutationNumber: true },
	});
	return row?.mutationNumber || null;
}

/**
 * Proses satu item secara atomik. Melempar hanya untuk kegagalan infrastruktur;
 * penolakan bisnis dikembalikan sebagai Result bertipe.
 */
async function receiveOne(actorUser, rawItem, seenSerials, attempt = 0) {
	const sn = normalizeSn(rawItem.serialNumber);

	const pureRejection = validateInboundItem(rawItem);
	if (pureRejection) return reject(pureRejection);
	if (seenSerials.has(sn)) return reject(REJECT.DUPLICATE_SN_IN_BATCH);

	try {
		return await prisma.$transaction(async (tx) => {
			const existing = await tx.item.findUnique({
				where: { serialNumber: sn },
				include: {
					model: { include: { materialCategory: true, brand: true } },
					location: { include: { parent: true } },
					createdBy: { include: { profile: true } },
				},
			});

			// Eksistensi SN per kondisi (spec inventory-inbound)
			if (rawItem.kondisi === 'Baru' && existing) return reject(REJECT.SN_REGISTERED);
			if (rawItem.kondisi === 'Dismantle' && !existing) {
				return reject(REJECT.INVALID_SN_FOR_DISMANTLE);
			}

			// Gating sumber mitra — hanya untuk actor MITRA (port validators.ts)
			if (actorUser.role === 'MITRA') {
				const mitraDisplayName = actorUser.profile?.nama || actorUser.username;
				const allowed = isMitraInboundAllowed(
					existing && {
						statusEnum: existing.status,
						paNumber: existing.paNumber,
						locationName: locationNameOf(existing),
						parentName: existing.location?.parent?.name,
						ownerDisplay: ownerDisplayOf(existing),
					},
					mitraDisplayName
				);
				if (!allowed) return reject(REJECT.INVALID_MITRA_SOURCE);
			}

			// Master data: fallback ke data existing bila payload tidak mengirim
			const kategori = rawItem.kategori || existing?.model?.materialCategory?.nama;
			const merek = rawItem.merek || existing?.model?.brand?.nama;
			const tipe = rawItem.tipe || existing?.model?.nama;
			if (!kategori) return reject(REJECT.CATEGORY_REQUIRED);
			if (!merek) return reject(REJECT.BRAND_REQUIRED);

			const category = await getOrCreateCategory(kategori, tx);
			const brand = await getOrCreateBrand(merek, tx);
			const model = await getOrCreateMaterialModel(tipe || 'Default', category.id, brand.id, tx);

			const locationId = await resolveLocationId(rawItem.lokasiPenyimpanan, tx);
			try {
				await assertCapacityAvailable(tx, locationId);
			} catch (capacityError) {
				if (capacityError.code === 'CAPACITY_FULL') {
					return reject(REJECT.CAPACITY_FULL, capacityError.detail);
				}
				throw capacityError;
			}

			const entryDate = rawItem.tanggalMasuk ? new Date(rawItem.tanggalMasuk) : new Date();
			const kondisi = rawItem.kondisi;
			let itemId;

			if (existing) {
				// Barang lama masuk kembali (Dismantle / Rusak / retur): update
				const status = rawItem.kondisi === 'Rusak' ? 'rusak' : 'tersedia';
				await tx.item.update({
					where: { id: existing.id },
					data: {
						modelId: model.id,
						status,
						kondisi,
						locationId,
						entryDate,
						paNumber: rawItem.paNumber ?? existing.paNumber,
						ticket: rawItem.ticket ?? existing.ticket,
						catatan: rawItem.catatan ?? existing.catatan,
					},
				});
				itemId = existing.id;
			} else {
				const created = await tx.item.create({
					data: {
						serialNumber: sn,
						modelId: model.id,
						status: kondisi === 'Rusak' ? 'rusak' : 'tersedia',
						kondisi,
						paNumber: rawItem.paNumber || null,
						ticket: rawItem.ticket || null,
						catatan: rawItem.catatan || null,
						locationId,
						entryDate,
						createdById: actorUser.id,
					},
				});
				itemId = created.id;
			}

			// Ledger tunggal: baris IN-* sekaligus entri operasional UI
			const number = nextInboundNumber(await lastInboundNumberToday(tx));
			const mutation = await logMutation(
				tx,
				{
					type: kondisi === 'Rusak' ? 'RUSAK' : 'MASUK',
					itemId,
					userId: actorUser.id,
					originLocationId: existing?.locationId ?? null,
					destinationLocationId: locationId,
					originLocationName: existing ? locationNameOf(existing) : rawItem.asal || null,
				},
				{ prefix: 'IN', number }
			);

			return ok(itemId, mutation.mutationNumber);
		});
	} catch (error) {
		// Race antar batch pada nomor berurutan → ulangi transaksi dengan nomor baru.
		const isNumberCollision =
			error?.code === 'P2002' &&
			String(error?.meta?.target ?? '').includes('mutationNumber');
		if (isNumberCollision && attempt < 3) {
			return receiveOne(actorUser, rawItem, seenSerials, attempt + 1);
		}
		throw error;
	}
}

/**
 * Terima batch barang masuk. Per-item atomic (D2): kegagalan satu item
 * tidak memengaruhi item lain. Item valid berurutan menambah nomor harian.
 *
 * @param {object} actorUser req.user hasil authMiddleware (wajib)
 * @param {Array<object>} items payload mentah dari client
 * @returns {Promise<Array<{index:number} & Result>>}
 */
export async function receiveItems(actorUser, items) {
	const results = [];
	const seenSerials = new Set();

	for (let index = 0; index < items.length; index++) {
		const result = await receiveOne(actorUser, items[index], seenSerials);
		results.push({ index, ...result });
		if (result.ok) seenSerials.add(normalizeSn(items[index].serialNumber));
	}

	return results;
}
