import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// DB test terpisah dari data dev (native MariaDB, database `arxiva_test`).
// Prasyarat: admin punya ALL PRIVILEGES di arxiva_test + schema sudah di-push.
// PRISMA_DATASOURCE_URL tidak bisa ditimpa oleh .env (lihat src/shared/prisma.js).
// Harus diset SEBELUM dynamic import modul yang memakai PrismaClient (ESM hoisting).
process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const { receiveItems } = await import('../../src/modules/intake/intake.service.js');
const { assertCapacityAvailableUnlessExit } = await import('../../src/modules/storage/service.js');

const RUN = `IT${Date.now().toString(36).toUpperCase()}`;
const SN = (n) => `SN-${RUN}-${n}`;
let admin;

beforeAll(async () => {
	admin = await prisma.user.create({
		data: { username: `${RUN}-admin`, password: 'x', role: 'ADMIN' },
	});
});

afterAll(async () => {
	await prisma.itemMutation.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.item.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.materialModel.deleteMany({ where: { nama: { startsWith: `MDL-${RUN}` } } });
	await prisma.brand.deleteMany({ where: { nama: { startsWith: `BRD-${RUN}` } } });
	await prisma.materialCategory.deleteMany({ where: { nama: { startsWith: `CAT-${RUN}` } } });
	await prisma.location.deleteMany({ where: { name: { startsWith: `LOC-${RUN}` } } });
	await prisma.user.deleteMany({ where: { username: { startsWith: RUN } } });
	await prisma.$disconnect();
});

const adminActor = () => ({ id: admin.id, role: 'ADMIN', profile: null });

describe('intake.service.receiveItems — integration', () => {
	it('happy path: batch 3 item → semua ok, nomor IN- berurutan, ledger tercatat', async () => {
		const results = await receiveItems(adminActor(), [
			{ serialNumber: SN(1), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-a`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
			{ serialNumber: SN(2), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-a`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
			{ serialNumber: SN(3), kondisi: 'Rusak', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, ticket: `TKT-${RUN}`, lokasiPenyimpanan: `LOC-${RUN}-rusak` },
		]);

		expect(results.map((r) => r.ok)).toEqual([true, true, true]);
		const [n1, n2, n3] = results.map((r) => r.nomor);
		for (const n of [n1, n2, n3]) expect(n).toMatch(/^IN-\d{8}-\d{4}$/);
		const seq = [n1, n2, n3].map((n) => parseInt(n.slice(-4), 10));
		expect(seq[1]).toBe(seq[0] + 1);
		expect(seq[2]).toBe(seq[1] + 1);

		const mutations = await prisma.itemMutation.findMany({
			where: { serialNumber: { in: [SN(1), SN(2), SN(3)] } },
		});
		expect(mutations).toHaveLength(3);
		expect(mutations.map((m) => m.type).sort()).toEqual(['MASUK', 'MASUK', 'RUSAK']);
		// Catatan: item RUSAK tanpa `tipe` berbagi model global "Default"
		// (MaterialModel.nama unik global — perilaku legacy yang dipertahankan),
		// sehingga snapshot brand-nya bisa milik run lain. Yang dijamin modul:
		// baris tercatat, bertipe benar, dan dua item Baru membawa brand yang tepat.
		const masukBrands = mutations.filter((m) => m.type === 'MASUK').map((m) => m.brand);
		expect(masukBrands.every((b) => b === `BRD-${RUN}`)).toBe(true);
		const rusakRow = mutations.find((m) => m.type === 'RUSAK');
		expect(rusakRow.ticket).toBe(`TKT-${RUN}`);
		expect(rusakRow.mutationNumber).toMatch(/^IN-\d{8}-\d{4}$/);

		const rusakItem = await prisma.item.findUnique({ where: { serialNumber: SN(3) } });
		expect(rusakItem.status).toBe('rusak');
	}, 20000);

	it('per-item atomic: duplikat intra-batch tidak menggagalkan item lain', async () => {
		const results = await receiveItems(adminActor(), [
			{ serialNumber: SN(10), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-b`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
			{ serialNumber: SN(10), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-b`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
			{ serialNumber: SN(11), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-b`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
		]);

		expect(results[0].ok).toBe(true);
		expect(results[1]).toMatchObject({ ok: false, reason: 'DUPLICATE_SN_IN_BATCH' });
		expect(results[2].ok).toBe(true);
	}, 20000);

	it('Baru pada SN terdaftar → SN_REGISTERED; Dismantle pada SN asing → INVALID_SN_FOR_DISMANTLE', async () => {
		const baru = await receiveItems(adminActor(), [
			{ serialNumber: SN(20), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-c`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
		]);
		expect(baru[0].ok).toBe(true);

		const reRegistered = await receiveItems(adminActor(), [
			{ serialNumber: SN(20), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-c`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
		]);
		expect(reRegistered[0]).toMatchObject({ ok: false, reason: 'SN_REGISTERED' });

		const ghostDismantle = await receiveItems(adminActor(), [
			{ serialNumber: SN(21), kondisi: 'Dismantle', paNumber: 'PA-1', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
		]);
		expect(ghostDismantle[0]).toMatchObject({ ok: false, reason: 'INVALID_SN_FOR_DISMANTLE' });
	}, 20000);

	it('kapasitas penuh → CAPACITY_FULL tanpa baris ledger', async () => {
		const loc = await prisma.location.create({
			data: { name: `LOC-${RUN}-penuh`, type: 'BOX', capacity: 1, isActive: true },
		});
		expect(loc.capacity).toBe(1);

		const first = await receiveItems(adminActor(), [
			{ serialNumber: SN(30), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-d`, lokasiPenyimpanan: `LOC-${RUN}-penuh` },
		]);
		expect(first[0].ok).toBe(true);

		const second = await receiveItems(adminActor(), [
			{ serialNumber: SN(31), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-d`, lokasiPenyimpanan: `LOC-${RUN}-penuh` },
		]);
		expect(second[0]).toMatchObject({ ok: false, reason: 'CAPACITY_FULL' });
		expect(await prisma.item.count({ where: { locationId: loc.id } })).toBe(1);
		expect(
			await prisma.itemMutation.count({ where: { serialNumber: SN(31) } })
		).toBe(0);
	}, 20000);

	it('regresi: kategori baru tidak lagi 500 (bug materialType hantu)', async () => {
		const catName = `CAT-${RUN}-baru-juga`;
		const results = await receiveItems(adminActor(), [
			{ serialNumber: SN(40), kondisi: 'Baru', kategori: catName, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-e`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
		]);
		expect(results[0].ok).toBe(true);
		expect(await prisma.materialCategory.findFirst({ where: { nama: catName } })).toBeTruthy();
	}, 20000);

	it('gating mitra: item milik KP yang masih tersedia ditolak', async () => {
		const mitra = await prisma.user.create({
			data: { username: `${RUN}-mitra`, password: 'x', role: 'MITRA' },
		});
		const mitraActor = { id: mitra.id, role: 'MITRA', profile: null };

		// SN tak terdaftar → tolak untuk mitra
		const unknown = await receiveItems(mitraActor, [
			{ serialNumber: SN(50), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-f`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
		]);
		expect(unknown[0]).toMatchObject({ ok: false, reason: 'INVALID_MITRA_SOURCE' });

		// Item KP masih Tersedia di rak → tolak
		await receiveItems(adminActor(), [
			{ serialNumber: SN(51), kondisi: 'Baru', kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, tipe: `MDL-${RUN}-g`, lokasiPenyimpanan: `LOC-${RUN}-rak` },
		]);
		const stillInKP = await receiveItems(mitraActor, [
			{ serialNumber: SN(51), kondisi: 'Rusak', ticket: `TKT-${RUN}-m`, kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, lokasiPenyimpanan: `LOC-${RUN}-rusak` },
		]);
		expect(stillInKP[0]).toMatchObject({ ok: false, reason: 'INVALID_MITRA_SOURCE' });

		// Item yang sudah "Keluar" (lokasi Keluar) → mitra boleh menerima
		let keluarLoc = await prisma.location.findFirst({ where: { name: 'Keluar', parentId: null } });
		if (!keluarLoc) {
			keluarLoc = await prisma.location.create({
				data: { name: 'Keluar', type: 'BOX', isActive: true },
			});
		}
		await prisma.item.update({
			where: { serialNumber: SN(51) },
			data: { status: 'digunakan', locationId: keluarLoc.id },
		});
		const accepted = await receiveItems(mitraActor, [
			{ serialNumber: SN(51), kondisi: 'Rusak', ticket: `TKT-${RUN}-m`, kategori: `CAT-${RUN}`, merek: `BRD-${RUN}`, lokasiPenyimpanan: `LOC-${RUN}-rusak` },
		]);
		expect(accepted[0].ok).toBe(true);
	}, 30000);

	it('assertCapacityAvailableUnlessExit: pintu Keluar/Diluar dilewati, lokasi biasa ditagih', async () => {
		const exitLoc = await prisma.location.create({
			data: { name: `LOC-${RUN}-keluar`, type: 'BOX', capacity: 1, isActive: true },
		});
		// Nama mengandung pola exit hanya jika persis "Keluar"/"Diluar" —
		// jadi buat dua lokasi: satu dinamai persis, satu biasa.
		await prisma.location.update({ where: { id: exitLoc.id }, data: { name: 'Keluar' } });

		// Pintu keluar: tidak pernah ditolak walau melebihi kapasitas
		await expect(
			prisma.$transaction((tx) => assertCapacityAvailableUnlessExit(tx, exitLoc.id, 99))
		).resolves.toBeUndefined();

		const normalLoc = await prisma.location.create({
			data: { name: `LOC-${RUN}-normal`, type: 'BOX', capacity: 1, isActive: true },
		});
		await expect(
			prisma.$transaction((tx) => assertCapacityAvailableUnlessExit(tx, normalLoc.id, 2))
		).rejects.toMatchObject({ code: 'CAPACITY_FULL' });
		await expect(
			prisma.$transaction((tx) => assertCapacityAvailableUnlessExit(tx, normalLoc.id, 1))
		).resolves.toBeUndefined();
	}, 20000);
});
