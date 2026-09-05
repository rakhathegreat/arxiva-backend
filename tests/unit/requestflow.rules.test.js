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

describe('validateTransition — RETURN_RUSAK (pengajuan material rusak)', () => {
	it('DISETUJUI/SERAH hanya untuk tipe RETURN_RUSAK', () => {
		fail(validateTransition('MENUNGGU', 'DISETUJUI', 'ADMIN', 'u1', 'a1'), 400);
		fail(validateTransition('DISETUJUI', 'SERAH', 'MITRA', 'u1', 'u1'), 400);
	});

	it('alur bahagia: MENUNGGU→DISETUJUI(admin)→SERAH(mitra)→SELESAI(admin)', () => {
		ok(validateTransition('MENUNGGU', 'DISETUJUI', 'ADMIN', 'u1', 'a1', 'RETURN_RUSAK'));
		ok(validateTransition('DISETUJUI', 'SERAH', 'MITRA', 'u1', 'u1', 'RETURN_RUSAK'));
		ok(validateTransition('SERAH', 'SELESAI', 'ADMIN', 'u1', 'a1', 'RETURN_RUSAK'));
	});

	it('RBAC rusak: hanya admin DISETUJUI/SELESAI; hanya mitra SERAH', () => {
		fail(validateTransition('MENUNGGU', 'DISETUJUI', 'MITRA', 'u1', 'u1', 'RETURN_RUSAK'), 403);
		fail(validateTransition('DISETUJUI', 'SERAH', 'ADMIN', 'u1', 'a1', 'RETURN_RUSAK'), 403);
		fail(validateTransition('SERAH', 'SELESAI', 'MITRA', 'u1', 'u1', 'RETURN_RUSAK'), 403);
	});

	it('DIBATALKAN di tipe rusak: pemilik boleh', () => {
		ok(validateTransition('MENUNGGU', 'DIBATALKAN', 'MITRA', 'u1', 'u1', 'RETURN_RUSAK'));
		ok(validateTransition('DISETUJUI', 'DIBATALKAN', 'ADMIN', 'u1', 'a1', 'RETURN_RUSAK'));
		fail(validateTransition('DISETUJUI', 'SERAH', 'MITRA', 'u1', 'lain', 'RETURN_RUSAK'), 403);
	});

	it('transisi liar tipe rusak ditolak', () => {
		fail(validateTransition('MENUNGGU', 'SERAH', 'MITRA', 'u1', 'u1', 'RETURN_RUSAK'), 400);
		fail(validateTransition('DISETUJUI', 'SELESAI', 'ADMIN', 'u1', 'a1', 'RETURN_RUSAK'), 400);
		fail(validateTransition('SERAH', 'DISETUJUI', 'ADMIN', 'u1', 'a1', 'RETURN_RUSAK'), 400);
		fail(validateTransition('MENUNGGU', 'SIAP', 'ADMIN', 'u1', 'a1', 'RETURN_RUSAK'), 400);
	});
});
