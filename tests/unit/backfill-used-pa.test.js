import { describe, it, expect } from 'vitest';
import { planUsedPaBackfill, paFromMitraMutation } from '../../src/modules/items/backfillUsedPa.js';

const MITRA = { role: 'MITRA' };
const ADMIN = { role: 'ADMIN' };

function baseItem(over = {}) {
	return {
		id: 'item-1',
		serialNumber: 'SN-001',
		status: 'digunakan',
		paNumber: null,
		...over,
	};
}

function baseMutation(over = {}) {
	return {
		id: 'mut-1',
		type: 'KELUAR',
		requestId: null,
		userId: 'u-mitra',
		paNumber: '',
		destinationLocationName: null,
		createdAt: '2026-08-01T00:00:00.000Z',
		...over,
	};
}

describe('paFromMitraMutation', () => {
	it('ambil PA dari destinationLocationName (alur lama: tujuan = PA ketik)', () => {
		const m = baseMutation({ destinationLocationName: 'PA-00123' });
		expect(paFromMitraMutation(m)).toBe('PA-00123');
	});

	it('pakai paNumber snapshot jika destination kosong & bukan nomor sistem', () => {
		const m = baseMutation({ destinationLocationName: null, paNumber: 'PA-556' });
		expect(paFromMitraMutation(m)).toBe('PA-556');
	});

	it('tolak snapshot yang berupa nomor mutasi sistem (OUT-… / MUT-…)', () => {
		expect(paFromMitraMutation(baseMutation({ paNumber: 'OUT-20260801-0001' }))).toBeNull();
		expect(paFromMitraMutation(baseMutation({ paNumber: 'MUT-1x' }))).toBeNull();
		expect(paFromMitraMutation(baseMutation({ paNumber: 'IN-20260801-0001' }))).toBeNull();
	});

	it('null bila tak ada nilai yang layak', () => {
		expect(paFromMitraMutation(baseMutation())).toBeNull();
	});
});

describe('planUsedPaBackfill', () => {
	it('backfill item digunakan tanpa PA yang punya mutasi KELUAR mitra tanpa requestId', () => {
		const items = [baseItem({ id: 'it1', serialNumber: 'SN-A' })];
		const mutations = {
			it1: [
				baseMutation({
					id: 'm1',
					type: 'MASUK',
					destinationLocationName: 'Inbound',
				}),
				baseMutation({
					id: 'm2',
					destinationLocationName: 'PA-XYZ',
					createdAt: '2026-08-02T00:00:00.000Z',
				}),
			],
		};
		const plan = planUsedPaBackfill(items, mutations, { 'u-mitra': MITRA });
		expect(plan).toHaveLength(1);
		expect(plan[0]).toMatchObject({ paNumber: 'PA-XYZ' });
		expect(plan[0].item.id).toBe('it1');
	});

	it('jangan sentuh item tersedia / rusak / hilang', () => {
		const items = [
			baseItem({ id: 'it1', status: 'tersedia' }),
			baseItem({ id: 'it2', status: 'rusak' }),
			baseItem({ id: 'it3', status: 'hilang' }),
		];
		const plan = planUsedPaBackfill(
			items,
			{ it1: [baseMutation({ destinationLocationName: 'PA-1' })], it2: [baseMutation()], it3: [baseMutation()] },
			{ 'u-mitra': MITRA }
		);
		expect(plan).toHaveLength(0);
	});

	it('jangan sentuh item digunakan yang SUDAH ber-PA (tampil Digunakan)', () => {
		const items = [baseItem({ id: 'it1', paNumber: 'PA-999' })];
		const plan = planUsedPaBackfill(
			items,
			{ it1: [baseMutation({ destinationLocationName: 'PA-LAIN' })] },
			{ 'u-mitra': MITRA }
		);
		expect(plan).toHaveLength(0);
	});

	it('jangan salah tangkap distribusi via requestflow (mempunyai requestId)', () => {
		const items = [baseItem({ id: 'it1' })];
		const mutations = {
			it1: [baseMutation({ requestId: 'req-1', destinationLocationName: 'PA-X' })],
		};
		const plan = planUsedPaBackfill(items, mutations, { 'u-mitra': MITRA });
		expect(plan).toHaveLength(0);
	});

	it('jangan salah tangkap mutasi yang dikerjakan ADMIN (bukan pemakaian mitra)', () => {
		const items = [baseItem({ id: 'it1' })];
		const mutations = { it1: [baseMutation({ userId: 'u-admin', destinationLocationName: 'PA-X' })] };
		const plan = planUsedPaBackfill(items, mutations, { 'u-admin': ADMIN, 'u-mitra': MITRA });
		expect(plan).toHaveLength(0);
	});

	it('abaikan mutasi KELUAR mitra ber-requestId kembar; pakai hanya yang tanpa requestId', () => {
		const items = [baseItem({ id: 'it1' })];
		const mutations = {
			it1: [
				baseMutation({ requestId: 'req-1', destinationLocationName: 'PA-DISTRI' }),
				baseMutation({ requestId: null, destinationLocationName: 'PA-PAKAI', createdAt: '2026-08-03T00:00:00.000Z' }),
			],
		};
		const plan = planUsedPaBackfill(items, mutations, { 'u-mitra': MITRA });
		expect(plan[0].paNumber).toBe('PA-PAKAI');
	});

	it('memakai mutasi terbaru bila ada lebih dari satu pemakaian mitra', () => {
		const items = [baseItem({ id: 'it1' })];
		const mutations = {
			it1: [
				baseMutation({ destinationLocationName: 'PA-LAMA', createdAt: '2026-08-01T00:00:00.000Z' }),
				baseMutation({ destinationLocationName: 'PA-BARU', createdAt: '2026-08-10T00:00:00.000Z' }),
			],
		};
		const plan = planUsedPaBackfill(items, mutations, { 'u-mitra': MITRA });
		expect(plan[0].paNumber).toBe('PA-BARU');
	});

	it('skip item digunakan tapi tanpa mutasi KELUAR mitra (tetap Terdistribusi)', () => {
		const items = [baseItem({ id: 'it1' })];
		const plan = planUsedPaBackfill(items, {}, { 'u-mitra': MITRA });
		expect(plan).toHaveLength(0);
	});

	it('TOLAK kandidat PA yang berupa nama mitra/owner (false-positive)', () => {
		const items = [baseItem({ id: 'it1' })];
		const mutations = {
			it1: [baseMutation({ destinationLocationName: 'PT TZU' })],
		};
		const plan = planUsedPaBackfill(items, mutations, { 'u-mitra': MITRA }, {
			itemContext: { it1: { ownerName: 'PT TZU' } },
		});
		expect(plan).toHaveLength(0);
	});

	it('TOLAK kandidat PA yang berupa nama lokasi', () => {
		const items = [baseItem({ id: 'it1' })];
		const mutations = { it1: [baseMutation({ destinationLocationName: 'Gudang Mitra A' })] };
		const plan = planUsedPaBackfill(items, mutations, { 'u-mitra': MITRA }, {
			itemContext: { it1: { locationName: 'Gudang Mitra A' } },
		});
		expect(plan).toHaveLength(0);
	});

	it('TOLAK kandidat PA yang berupa nama brand', () => {
		const items = [baseItem({ id: 'it1' })];
		const mutations = { it1: [baseMutation({ destinationLocationName: 'ZTE' })] };
		const plan = planUsedPaBackfill(items, mutations, { 'u-mitra': MITRA }, {
			itemContext: { it1: { brandName: 'ZTE' } },
		});
		expect(plan).toHaveLength(0);
	});

	it('guard nama entitas tidak menghalangi PA asli meski mirip', () => {
		const items = [baseItem({ id: 'it1' })];
		const mutations = { it1: [baseMutation({ destinationLocationName: 'PA-123' })] };
		const plan = planUsedPaBackfill(items, mutations, { 'u-mitra': MITRA }, {
			itemContext: { it1: { ownerName: 'PT TZU', locationName: 'Digunakan' } },
		});
		expect(plan[0].paNumber).toBe('PA-123');
	});
});
