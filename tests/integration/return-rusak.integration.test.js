import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// DB test terpisah dari data dev (database `arxiva_test`).
process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const { updateItem } = await import('../../src/controllers/item.controller.js');
const { updateRequestStatus, createRequest, signBast } = await import('../../src/controllers/request.controller.js');
const { receiveItems } = await import('../../src/modules/intake/intake.service.js');

const RUN = `RR${Date.now().toString(36).toUpperCase()}`;
const SN = (n) => `SN-${RUN}-${n}`;
let admin, mitra, category, brand, model, loc;

function mockRes() {
	const res = { statusCode: null, body: null };
	res.status = (code) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body) => {
		res.body = body;
		return res;
	};
	return res;
}

async function seed() {
	admin = await prisma.user.create({ data: { username: `${RUN}-admin`, password: 'x', role: 'ADMIN' } });
	mitra = await prisma.user.create({
		data: {
			username: `${RUN}-mitra`,
			password: 'x',
			role: 'MITRA',
			profile: { create: { nama: `${RUN} MITRA`, email: '-', telepon: '-', alamat: '-' } },
		},
		include: { profile: true },
	});
	category = await prisma.materialCategory.create({ data: { nama: `CAT-${RUN}` } });
	brand = await prisma.brand.create({ data: { nama: `BRD-${RUN}`, origin: 'Test', identifier: `ID-${RUN}` } });
	model = await prisma.materialModel.create({
		data: { nama: `MDL-${RUN}`, code: `${RUN}-C`, materialCategoryId: category.id, brandId: brand.id },
	});
	loc = await prisma.location.create({ data: { name: `LOC-${RUN}-rusak`, type: 'BOX', capacity: 500, isActive: true } });
}

async function makeReturnRequest({ type = 'RETURN_RUSAK', serialized = true } = {}) {
	const body = {
		requesterId: mitra.id,
		notes: 'pengembalian rusak',
		type,
		items: [{
			materialCategoryId: category.id,
			brandId: brand.id,
			modelId: model.id,
			quantity: 1,
			...(serialized ? { serialNumber: SN('ret') } : {}),
		}],
	};
	const res = mockRes();
	await createRequest({ body }, res);
	expect(res.statusCode).toBe(201);
	return res.body.request;
}

async function itemBySn(sn) {
	return prisma.item.findUnique({ where: { serialNumber: sn } });
}

beforeAll(async () => {
	await seed();
});

afterAll(async () => {
	await prisma.deliveryDocument.deleteMany({ where: { request: { requesterId: mitra.id } } });
	await prisma.itemMutation.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.requestItem.deleteMany({ where: { request: { requesterId: mitra.id } } });
	await prisma.request.deleteMany({ where: { requesterId: mitra.id } });
	await prisma.item.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.userLocation.deleteMany({ where: { userId: mitra.id } });
	await prisma.userProfile.deleteMany({ where: { user: { username: { startsWith: RUN } } } });

	// Hapus model milik kategori run ini (termasuk model "Default" yang
	// mungkin dibuat intake tanpa tipe) sebelum kategori dihapus.
	const cats = await prisma.materialCategory.findMany({
		where: { nama: { startsWith: `CAT-${RUN}` } },
		select: { id: true },
	});
	await prisma.materialModel.deleteMany({ where: { materialCategoryId: { in: cats.map((c) => c.id) } } });
	await prisma.materialModel.deleteMany({ where: { nama: { startsWith: `MDL-${RUN}` } } });
	await prisma.brand.deleteMany({ where: { nama: { startsWith: `BRD-${RUN}` } } });
	await prisma.materialCategory.deleteMany({ where: { nama: { startsWith: `CAT-${RUN}` } } });
	await prisma.location.deleteMany({ where: { name: { startsWith: `LOC-${RUN}` } } });
	await prisma.user.deleteMany({ where: { username: { startsWith: RUN } } });
	await prisma.$disconnect();
});

describe('alur RETURN_RUSAK — pengajuan → setuju → serah → input → selesai', () => {
	it('happy path: item rusak ter-input terikat pengajuan, owner KP, SELESAI', async () => {
		const request = await makeReturnRequest();

		// 1. Admin setujui → DISETUJUI + BAST dibuat
		let res = mockRes();
		await updateRequestStatus(
			{ params: { id: request.id }, body: { status: 'DISETUJUI' }, user: { id: admin.id, role: 'ADMIN' } },
			res,
		);
		expect(res.body.request.status).toBe('DISETUJUI');
		const doc = await prisma.deliveryDocument.findUnique({ where: { requestId: request.id } });
		expect(doc).toBeTruthy();
		expect(doc.kpSignedAt).toBeTruthy();

		// 2. Mitra tanda tangan → BAST final (finalFilePath)
		res = mockRes();
		await signBast({ params: { id: request.id }, user: { id: mitra.id, role: 'MITRA' } }, res);
		expect(res.body.isFullySigned).toBe(true);
		const finalized = await prisma.deliveryDocument.findUnique({ where: { requestId: request.id } });
		expect(finalized.finalFilePath).toBeTruthy();

		// 3. Mitra menyerahkan fisik → SERAH
		res = mockRes();
		await updateRequestStatus(
			{ params: { id: request.id }, body: { status: 'SERAH' }, user: { id: mitra.id, role: 'MITRA' } },
			res,
		);
		expect(res.body.request.status).toBe('SERAH');

		// 4. Mitra menginput material rusak terikat pengajuan (wajib utk SELESAI)
		const results = await receiveItems(
			{ id: mitra.id, role: 'MITRA', profile: mitra.profile },
			[{
				serialNumber: SN('ret'),
				kondisi: 'Rusak',
				ticket: `TKT-${RUN}`,
				catatan: 'rusak terikat pengajuan',
				kategori: `CAT-${RUN}`,
				merek: `BRD-${RUN}`,
				tipe: `MDL-${RUN}`,
				lokasiPenyimpanan: `LOC-${RUN}-rusak`,
				requestId: request.id,
			}],
		);
		expect(results[0].ok).toBe(true);

		// 5. Admin selesaikan → SELESAI (reconciliation cocok)
		res = mockRes();
		await updateRequestStatus(
			{ params: { id: request.id }, body: { status: 'SELESAI' }, user: { id: admin.id, role: 'ADMIN' } },
			res,
		);
		expect(res.body.request.status).toBe('SELESAI');

		// Owner item rusak = KP admin
		const item = await prisma.item.findUnique({
			where: { serialNumber: SN('ret') },
			include: { createdBy: true },
		});
		expect(item.status).toBe('rusak');
		expect(item.createdBy.role).toBe('ADMIN');

		// Mutation terikat requestId
		const mut = await prisma.itemMutation.findFirst({ where: { itemId: item.id, type: 'RUSAK' } });
		expect(mut.requestId).toBe(request.id);
	}, 30000);

	it('SELESAI ditolak sebelum semua material tiba', async () => {
		const request = await makeReturnRequest();

		let res = mockRes();
		await updateRequestStatus(
			{ params: { id: request.id }, body: { status: 'DISETUJUI' }, user: { id: admin.id, role: 'ADMIN' } },
			res,
		);
		res = mockRes();
		await signBast({ params: { id: request.id }, user: { id: mitra.id, role: 'MITRA' } }, res);
		res = mockRes();
		await updateRequestStatus(
			{ params: { id: request.id }, body: { status: 'SERAH' }, user: { id: mitra.id, role: 'MITRA' } },
			res,
		);

		// Tanpa intake terikat → SELESAI harus ditolak
		res = mockRes();
		await updateRequestStatus(
			{ params: { id: request.id }, body: { status: 'SELESAI' }, user: { id: admin.id, role: 'ADMIN' } },
			res,
		);
		expect(res.body.request).toBeFalsy();
	}, 30000);

	it('intake terikat ditolak utk request yang belum disetujui', async () => {
		const request = await makeReturnRequest();
		const results = await receiveItems(
			{ id: mitra.id, role: 'MITRA', profile: mitra.profile },
			[{
				serialNumber: SN('notyet'),
				kondisi: 'Rusak',
				ticket: `TKT-${RUN}-n`,
				kategori: `CAT-${RUN}`,
				merek: `BRD-${RUN}`,
				lokasiPenyimpanan: `LOC-${RUN}-rusak`,
				requestId: request.id,
			}],
		);
		expect(results[0].ok).toBe(false);
		expect(results[0].reason).toBe('REQUEST_NOT_APPROVED');
	}, 20000);

	it('OUTGOING tidak bisa pakai DISETUJUI', async () => {
		const request = await makeReturnRequest({ type: 'OUTGOING' });
		const res = mockRes();
		await updateRequestStatus(
			{ params: { id: request.id }, body: { status: 'DISETUJUI' }, user: { id: admin.id, role: 'ADMIN' } },
			res,
		);
		expect(res.statusCode).toBe(400);
	}, 20000);
});
