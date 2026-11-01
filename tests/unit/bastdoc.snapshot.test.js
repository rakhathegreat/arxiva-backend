import { describe, it, expect } from 'vitest';
import {
	BAST_ITEM_KEYS,
	bastItemRow,
	buildAllocationSnapshot,
	buildRequestItemsSnapshot,
} from '../../src/modules/bastdoc/snapshot.js';

describe('bastItemRow — bentuk kanonik satu baris snapshot', () => {
	it('selalu memuat tepat kunci kanonik', () => {
		expect(Object.keys(bastItemRow({ quantity: 1 }))).toEqual(BAST_ITEM_KEYS);
	});

	it('mengisi default untuk bagian yang kosong', () => {
		expect(bastItemRow({ quantity: 3 })).toEqual({
			materialNumber: '-',
			materialName: '-',
			brandName: null,
			serialNumber: '-',
			quantity: 3,
			unit: 'Unit',
			kondisi: 'Baik',
		});
	});

	it('menghormati kondisi eksplisit', () => {
		expect(bastItemRow({ quantity: 1, kondisi: 'Rusak' }).kondisi).toBe('Rusak');
	});
});

describe('buildAllocationSnapshot — satu baris per unit teralokasi', () => {
	const request = {
		requestItems: [
			{
				allocations: [
					{
						item: {
							serialNumber: 'SN-1',
							model: {
								code: 'M-1',
								deskripsi: 'Deskripsi 1',
								nama: 'Nama 1',
								brand: { nama: 'ZTE' },
							},
						},
					},
					{
						item: {
							serialNumber: 'SN-2',
							model: { code: 'M-1', nama: 'Nama 1', brand: { nama: 'ZTE' } },
						},
					},
				],
			},
			{ allocations: [] },
		],
	};

	it('meratakan tiap alokasi dan memakai quantity 1', () => {
		const snap = buildAllocationSnapshot(request);
		expect(snap).toHaveLength(2);
		expect(snap.every((row) => row.quantity === 1)).toBe(true);
		expect(Object.keys(snap[0])).toEqual(BAST_ITEM_KEYS);
	});

	it('memakai deskripsi model lebih dulu, lalu nama', () => {
		const [first, second] = buildAllocationSnapshot(request);
		expect(first.materialName).toBe('Deskripsi 1');
		expect(second.materialName).toBe('Nama 1');
	});

	it('membaca brandName dari model.brand.nama', () => {
		expect(buildAllocationSnapshot(request)[0].brandName).toBe('ZTE');
	});

	it('tahan terhadap allocations yang tidak ada', () => {
		expect(buildAllocationSnapshot({ requestItems: [{}] })).toEqual([]);
	});

	it('meneruskan opsi kondisi', () => {
		expect(buildAllocationSnapshot(request, { kondisi: 'Rusak' })[0].kondisi).toBe('Rusak');
	});
});

describe('buildRequestItemsSnapshot — satu baris per RequestItem', () => {
	const request = {
		requestItems: [
			{
				quantity: 4,
				serialNumber: 'SN-9',
				model: { code: 'M-9', deskripsi: 'Deskripsi 9', brand: { nama: 'Huawei' } },
				brand: { nama: 'Cadangan' },
				materialCategory: { nama: 'Kategori' },
			},
			{
				quantity: 2,
				serialNumber: null,
				model: null,
				brand: { nama: 'Fallback' },
				materialCategory: { nama: 'Kat-2' },
			},
		],
	};

	it('memakai quantity asli baris permintaan', () => {
		const snap = buildRequestItemsSnapshot(request);
		expect(snap.map((row) => row.quantity)).toEqual([4, 2]);
	});

	it('memprioritaskan brand model, lalu fallback ke brand baris', () => {
		const snap = buildRequestItemsSnapshot(request);
		expect(snap[0].brandName).toBe('Huawei');
		expect(snap[1].brandName).toBe('Fallback');
	});

	it('fallback nama material ke kategori saat model kosong', () => {
		expect(buildRequestItemsSnapshot(request)[1].materialName).toBe('Kat-2');
	});

	it('memakai bentuk kunci kanonik', () => {
		expect(Object.keys(buildRequestItemsSnapshot(request)[0])).toEqual(BAST_ITEM_KEYS);
	});
});
