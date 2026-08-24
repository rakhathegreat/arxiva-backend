import { describe, it, expect } from 'vitest';
import { validateTransition, REQUEST_STATUSES } from '../../src/modules/requestflow/rules.js';

const ok = (r) => expect(r.ok).toBe(true);
const fail = (r, status) => {
	expect(r.ok).toBe(false);
	expect(r.httpStatus).toBe(status);
};

describe('validateTransition — matriks role × from × to', () => {
	it('alur bahagia admin: MENUNGGU→SIAP→SELESAI', () => {
		ok(validateTransition('MENUNGGU', 'SIAP', 'ADMIN', 'u1', 'a1'));
		ok(validateTransition('SIAP', 'SELESAI', 'ADMIN', 'u1', 'a1'));
	});

	it('mitra tidak bisa SIAP/SELESAI/DITOLAK', () => {
		fail(validateTransition('MENUNGGU', 'SIAP', 'MITRA', 'u1', 'm1'), 403);
		fail(validateTransition('SIAP', 'SELESAI', 'MITRA', 'u1', 'm1'), 403);
		fail(validateTransition('MENUNGGU', 'DITOLAK', 'MITRA', 'u1', 'm1'), 403);
	});

	it('DIBATALKAN: pemilik boleh, mitra lain tidak', () => {
		ok(validateTransition('MENUNGGU', 'DIBATALKAN', 'MITRA', 'u1', 'u1'));
		fail(validateTransition('MENUNGGU', 'DIBATALKAN', 'MITRA', 'u1', 'lain'), 403);
		ok(validateTransition('SIAP', 'DIBATALKAN', 'ADMIN', 'u1', 'a1'));
	});

	it('transisi liar ditolak (400)', () => {
		fail(validateTransition('MENUNGGU', 'SELESAI', 'ADMIN', 'u1', 'a1'), 400);
		fail(validateTransition('DRAFT', 'SELESAI', 'ADMIN', 'u1', 'a1'), 400);
		fail(validateTransition('SIAP', 'MENUNGGU', 'ADMIN', 'u1', 'a1'), 400);
		fail(validateTransition('SELESAI', 'DITOLAK', 'ADMIN', 'u1', 'a1'), 400);
	});

	it('status tak dikenal → 400', () => {
		fail(validateTransition('MENUNGGU', 'HILANG', 'ADMIN', 'u1', 'a1'), 400);
	});
});
