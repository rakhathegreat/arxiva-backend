/**
 * Bentuk kanonik baris item pada dokumen BAST (`DeliveryDocument.itemsSnapshot`).
 *
 * Sebelumnya tiga jalur membangun objek ini sendiri-sendiri dengan bentuk yang
 * berbeda — dua menambahkan `brandName`/`kondisi`, satu tidak — padahal pembaca
 * PDF (`services/pdf.service.js`) membaca kunci yang sama. Satu bentuk di sini
 * mengunci agar tidak drift lagi; `BAST_ITEM_KEYS` dijaga unit test.
 */

const EMPTY = '-';

/** Kunci yang selalu ada pada satu baris snapshot. */
export const BAST_ITEM_KEYS = [
	'materialNumber',
	'materialName',
	'brandName',
	'serialNumber',
	'quantity',
	'unit',
	'kondisi',
];

/** Bangun satu baris snapshot kanonik. */
export function bastItemRow({
	materialNumber,
	materialName,
	brandName,
	serialNumber,
	quantity,
	kondisi,
}) {
	return {
		materialNumber: materialNumber || EMPTY,
		materialName: materialName || EMPTY,
		brandName: brandName || null,
		serialNumber: serialNumber || EMPTY,
		quantity,
		unit: 'Unit',
		kondisi: kondisi || 'Baik',
	};
}

/**
 * Snapshot dari alokasi fisik — satu baris per unit teralokasi.
 * Dipakai jalur OUTGOING/SIAP yang melewati alokasi admin.
 *
 * @param {object} request dengan `requestItems[].allocations[].item.model`
 */
export function buildAllocationSnapshot(request, { kondisi = 'Baik' } = {}) {
	return request.requestItems.flatMap((item) =>
		(item.allocations ?? []).map((alloc) =>
			bastItemRow({
				materialNumber: alloc.item?.model?.code,
				materialName: alloc.item?.model?.deskripsi || alloc.item?.model?.nama,
				brandName: alloc.item?.model?.brand?.nama,
				serialNumber: alloc.item?.serialNumber,
				quantity: 1,
				kondisi,
			}),
		),
	);
}

/**
 * Snapshot dari baris permintaan — satu baris per `RequestItem`, quantity asli.
 * Dipakai jalur RETURN_RUSAK / INTER_MITRA yang tidak melewati alokasi admin.
 *
 * @param {object} request dengan `requestItems[].{model,brand,materialCategory}`
 */
export function buildRequestItemsSnapshot(request, { kondisi = 'Baik' } = {}) {
	return request.requestItems.map((ri) =>
		bastItemRow({
			materialNumber: ri.model?.code,
			materialName: ri.model?.deskripsi || ri.model?.nama || ri.materialCategory?.nama,
			brandName: ri.model?.brand?.nama || ri.brand?.nama,
			serialNumber: ri.serialNumber,
			quantity: ri.quantity,
			kondisi,
		}),
	);
}
