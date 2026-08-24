import { describe, it, expect } from 'vitest';
import {
	REJECT,
	normalizeSn,
	validateInboundItem,
	isMitraInboundAllowed,
	nextInboundNumber,
} from '../../src/modules/intake/intake.rules.js';

describe('validateInboundItem', () => {
	const base = { serialNumber: 'SN-1', kondisi: 'Baru', tipe: 'F609' };

	it('lolos untuk item Baru lengkap', () => {
		expect(validateInboundItem(base)).toBeNull();
	});

	it('menolak SN kosong', () => {
		expect(validateInboundItem({ ...base, serialNumber: '   ' })).toBe(REJECT.MISSING_SERIAL);
	});

	it('menolak kondisi tak dikenal', () => {
		expect(validateInboundItem({ ...base, kondisi: 'Bekas' })).toBe(REJECT.INVALID_CONDITION);
	});

	it('Baru tanpa tipe → MODEL_REQUIRED_FOR_BARU', () => {
		expect(validateInboundItem({ ...base, tipe: undefined })).toBe(REJECT.MODEL_REQUIRED_FOR_BARU);
	});

	it('Dismantle tanpa paNumber → PA_REQUIRED_FOR_DISMANTLE', () => {
		expect(validateInboundItem({ ...base, kondisi: 'Dismantle', tipe: undefined })).toBe(
			REJECT.PA_REQUIRED_FOR_DISMANTLE
		);
	});

	it('Rusak tanpa ticket → TICKET_REQUIRED_FOR_RUSAK', () => {
		expect(validateInboundItem({ ...base, kondisi: 'Rusak', tipe: undefined })).toBe(
			REJECT.TICKET_REQUIRED_FOR_RUSAK
		);
	});

	it('Dismantle dengan paNumber lolos walau tipe kosong (data dari item existing)', () => {
		expect(
			validateInboundItem({ serialNumber: 'X', kondisi: 'Dismantle', paNumber: 'PA-9' })
		).toBeNull();
	});
});

describe('normalizeSn', () => {
	it('trim + uppercase', () => {
		expect(normalizeSn('  sn-abc-01 ')).toBe('SN-ABC-01');
	});
});

describe('isMitraInboundAllowed — port validators.ts', () => {
	const outAtPartner = {
		statusEnum: 'digunakan',
		paNumber: null,
		locationName: 'Gudang Mitra A',
		ownerDisplay: 'PT Naratas',
	};

	it('barang terdistribusi milik mitra sendiri → diizinkan', () => {
		expect(isMitraInboundAllowed(outAtPartner, 'PT Naratas')).toBe(true);
	});

	it('status "Digunakan" (ber-PA) BUKAN outbound — setia pada validators.ts', () => {
		expect(
			isMitraInboundAllowed({ ...outAtPartner, paNumber: 'PA-1' }, 'PT Naratas')
		).toBe(false);
	});

	it('barang masih Tersedia di KP → ditolak', () => {
		expect(
			isMitraInboundAllowed(
				{ statusEnum: 'tersedia', locationName: 'Rak 1 - L1', ownerDisplay: 'KP Tasikmalaya' },
				'PT Naratas'
			)
		).toBe(false);
	});

	it('lokasi fisik "Keluar" → diizinkan apa pun ownernya', () => {
		expect(
			isMitraInboundAllowed(
				{ statusEnum: 'tersedia', locationName: 'Keluar', ownerDisplay: 'Lain Inc' },
				'PT Naratas'
			)
		).toBe(true);
	});

	it('status keluar tapi lokasi masih di KP → hanya owner sendiri/KP/kosong', () => {
		const base = { statusEnum: 'digunakan', locationName: 'Rak 1 - L2' };
		expect(isMitraInboundAllowed({ ...base, ownerDisplay: 'PT Lain' }, 'PT Naratas')).toBe(false);
		expect(isMitraInboundAllowed({ ...base, ownerDisplay: 'KP Tasikmalaya' }, 'PT Naratas')).toBe(true);
		expect(isMitraInboundAllowed({ ...base, ownerDisplay: '' }, 'PT Naratas')).toBe(true);
	});

	it('SN tidak terdaftar (existing null) → ditolak untuk mitra', () => {
		expect(isMitraInboundAllowed(null, 'PT Naratas')).toBe(false);
	});
});

describe('nextInboundNumber', () => {
	it('nomor pertama hari ini', () => {
		expect(nextInboundNumber(null, new Date(2026, 7, 24))).toBe('IN-20260824-0001');
	});

	it('lanjut dari nomor terakhir', () => {
		expect(nextInboundNumber('IN-20260824-0007', new Date(2026, 7, 24))).toBe('IN-20260824-0008');
	});

	it('abaikan nomor dari hari lain', () => {
		expect(nextInboundNumber('IN-20260823-0042', new Date(2026, 7, 24))).toBe('IN-20260824-0001');
	});
});
