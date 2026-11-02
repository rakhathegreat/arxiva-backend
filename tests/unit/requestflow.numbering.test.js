import { describe, it, expect } from 'vitest';
import { nextRequestNumber } from '../../src/modules/requestflow/rules.js';

const at = (y, m = 0, d = 15) => new Date(y, m, d);

describe('nextRequestNumber — nomor request per tahun', () => {
	it('mulai dari 0001 bila belum ada nomor', () => {
		expect(nextRequestNumber(null, at(2026))).toBe('REQ-2026-0001');
		expect(nextRequestNumber(undefined, at(2026))).toBe('REQ-2026-0001');
	});

	it('menambahkan satu dari nomor terakhir tahun berjalan', () => {
		expect(nextRequestNumber('REQ-2026-0007', at(2026))).toBe('REQ-2026-0008');
	});

	it('melewati batas 9999 dengan benar (tanpa truncate)', () => {
		expect(nextRequestNumber('REQ-2026-9999', at(2026))).toBe('REQ-2026-10000');
	});

	it('reset ke 0001 saat berganti tahun', () => {
		expect(nextRequestNumber('REQ-2025-0042', at(2026))).toBe('REQ-2026-0001');
	});

	it('mengabaikan nomor dengan format lain', () => {
		expect(nextRequestNumber('REQ-2026-abc', at(2026))).toBe('REQ-2026-0001');
		expect(nextRequestNumber('RF123-REQ-1', at(2026))).toBe('REQ-2026-0001');
	});

	it('mempertahankan padding empat digit', () => {
		expect(nextRequestNumber('REQ-2026-0009', at(2026))).toBe('REQ-2026-0010');
	});
});
