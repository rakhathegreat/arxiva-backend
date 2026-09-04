/**
 * SIMULASI data dummy — TIDAK menyentuh database.
 *
 * Menjalankan logika backfill (planUsedPaBackfill) terhadap dataset palsu yang
 * mereplikasi kondisi produksi, lalu mencetak status item sebelum & sesudah
 * perbaikan (pakai enumToDisplay agar hasil tampil seperti di GET /items).
 *
 * Jalankan dari arxiva-backend: `node scripts/simulate-backfill-used-pa.js`
 */
import { planUsedPaBackfill, paFromMitraMutation } from '../src/modules/items/backfillUsedPa.js';
import { enumToDisplay } from '../src/modules/items/service.js';

// ---- Dataset dummy ----
const users = {
	'u-mitra-a': { role: 'MITRA' },
	'u-mitra-b': { role: 'MITRA' },
	'u-admin': { role: 'ADMIN' },
};

// items: status adalah enum DB. display = enumToDisplay(status, paNumber).
const items = [
	{ id: 'it1', serialNumber: 'SN-1001', status: 'digunakan', paNumber: null }, // dipakai mitra ber-PA → jadi Digunakan
	{ id: 'it2', serialNumber: 'SN-1002', status: 'digunakan', paNumber: null }, // dipakai tapi tanpa PA → tetap Terdistribusi
	{ id: 'it3', serialNumber: 'SN-1003', status: 'digunakan', paNumber: 'PA-555' }, // sudah Digunakan
	{ id: 'it4', serialNumber: 'SN-1004', status: 'digunakan', paNumber: null }, // terdistribusi (requestId) → tetap Terdistribusi
	{ id: 'it5', serialNumber: 'SN-1005', status: 'tersedia', paNumber: null }, // tersedia → tak tersentuh
	{ id: 'it6', serialNumber: 'SN-1006', status: 'digunakan', paNumber: null }, // false-positive: tujuan = nama mitra, bukan PA
];

const mutations = {
	it1: [
		{ id: 'm1', type: 'MASUK', requestId: null, userId: 'u-admin', paNumber: '', destinationLocationName: 'Inbound', createdAt: '2026-07-01T00:00:00.000Z' },
		{ id: 'm2', type: 'KELUAR', requestId: null, userId: 'u-mitra-a', paNumber: 'OUT-20260801-0001', destinationLocationName: 'PA-00123', createdAt: '2026-08-01T00:00:00.000Z' },
	],
	// it2: pemakaian mitra tapi tujuan/PA kosong → tak bisa disimpulkan
	it2: [
		{ id: 'm3', type: 'MASUK', requestId: null, userId: 'u-admin', paNumber: '', destinationLocationName: 'Inbound', createdAt: '2026-07-10T00:00:00.000Z' },
		{ id: 'm4', type: 'KELUAR', requestId: null, userId: 'u-mitra-a', paNumber: 'OUT-20260810-0002', destinationLocationName: '', createdAt: '2026-08-10T00:00:00.000Z' },
	],
	it4: [
		{ id: 'm5', type: 'KELUAR', requestId: 'req-100', userId: 'u-admin', paNumber: '', destinationLocationName: 'Gudang Mitra A', createdAt: '2026-08-02T00:00:00.000Z' },
	],
	// it6: tujuan = nama mitra (bukan PA) → harus ditolak oleh guard
	it6: [
		{ id: 'm6', type: 'MASUK', requestId: null, userId: 'u-admin', paNumber: '', destinationLocationName: 'Inbound', createdAt: '2026-08-05T00:00:00.000Z' },
		{ id: 'm7', type: 'KELUAR', requestId: null, userId: 'u-mitra-a', paNumber: 'OUT-20260904-0001', destinationLocationName: 'PT TZU', createdAt: '2026-09-04T00:00:00.000Z' },
	],
};

const itemContext = {
	it1: { ownerName: 'PT TZU', locationName: 'Digunakan', brandName: null },
	it2: { ownerName: 'PT TZU', locationName: 'Keluar', brandName: null },
	it3: { ownerName: 'PT TZU', locationName: 'Mitra', brandName: null },
	it4: { ownerName: 'PT TZU', locationName: 'Mitra', brandName: null },
	it5: { ownerName: 'PT TZU', locationName: 'Rak 1', brandName: null },
	it6: { ownerName: 'PT TZU', locationName: 'Keluar', brandName: null },
};

// ---- Simulasi ----
const plan = planUsedPaBackfill(items, mutations, users, { itemContext });

console.log('=== SIMULASI BACKFILL PA (data dummy, dry-run) ===\n');

for (const item of items) {
	const before = enumToDisplay(item.status, item.paNumber);
	const backfill = plan.find((p) => p.item.id === item.id);
	const after = backfill ? enumToDisplay(item.status, backfill.paNumber) : before;
	const action = backfill ? `→ ${after}  [isi PA: ${backfill.paNumber}]` : `→ ${after}  (tidak berubah)`;
	console.log(`${item.serialNumber.padEnd(10)} | ${before.padEnd(14)} | ${action}`);
}

console.log(`\nItem di-backfill: ${plan.length}`);
console.log('\nRencana update (itemId → paNumber):');
for (const p of plan) {
	console.log(`  ${p.item.id} (${p.item.serialNumber}) → ${p.paNumber}`);
}
