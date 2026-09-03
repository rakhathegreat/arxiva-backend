import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// DB test terpisah dari data dev (database `arxiva_test`).
process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const { createTransaction } = await import('../../src/controllers/transaction.controller.js');
const { enumToDisplay } = await import('../../src/modules/items/service.js');

const RUN = `USG${Date.now().toString(36).toUpperCase()}`;
let mitra, model, item;

async function seed() {
	mitra = await prisma.user.create({ data: { username: `${RUN}-mitra`, password: 'x', role: 'MITRA' } });
	const category = await prisma.materialCategory.create({ data: { nama: `CAT-${RUN}` } });
	const brand = await prisma.brand.create({ data: { nama: `BRD-${RUN}`, origin: 'Test', identifier: `ID-${RUN}` } });
	model = await prisma.materialModel.create({
		data: { nama: `MDL-${RUN}`, code: `${RUN}-C`, materialCategoryId: category.id, brandId: brand.id },
	});
}

async function createItem(serialNumber, { status = 'digunakan', paNumber = null } = {}) {
	return prisma.item.create({
		data: {
			serialNumber,
			modelId: model.id,
			status,
			paNumber,
			kondisi: 'Baru',
			entryDate: new Date(),
			createdById: mitra.id,
		},
	});
}

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

beforeAll(async () => {
	await seed();
});

afterAll(async () => {
	await prisma.itemMutation.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.item.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.materialModel.deleteMany({ where: { nama: { startsWith: `MDL-${RUN}` } } });
	await prisma.brand.deleteMany({ where: { nama: { startsWith: `BRD-${RUN}` } } });
	await prisma.materialCategory.deleteMany({ where: { nama: { startsWith: `CAT-${RUN}` } } });
	await prisma.user.deleteMany({ where: { username: { startsWith: `${RUN}-` } } });
	await prisma.$disconnect();
});

describe('pemakaian mitra (Digunakan) sync nomor PA ke Item', () => {
	it('transaksi Digunakan ber-PA mengisi Item.paNumber → tampil status Digunakan', async () => {
		item = await createItem(`SN-${RUN}-A1`, { status: 'digunakan', paNumber: null });

		const res = mockRes();
		await createTransaction(
			{
				body: {
					nomor: `PA-${RUN}-1`,
					sn: item.serialNumber,
					merek: 'X',
					kategori: 'Digunakan',
					status: 'Selesai',
					asal: 'Mitra',
					tujuan: 'Mitra',
					mitra: mitra.username,
				},
				user: mitra,
			},
			res,
		);

		expect(res.statusCode).toBe(201);

		const updated = await prisma.item.findUnique({ where: { id: item.id } });
		expect(updated.paNumber).toBe(`PA-${RUN}-1`);
		expect(enumToDisplay(updated.status, updated.paNumber)).toBe('Digunakan');
	});

	it('transaksi Keluar (distribusi, bukan pemakaian) tidak menggeser paNumber item', async () => {
		const item = await createItem(`SN-${RUN}-A2`, { status: 'digunakan', paNumber: `PA-${RUN}-2` });

		const res = mockRes();
		await createTransaction(
			{
				body: {
					nomor: `MUT-${RUN}-2`,
					sn: item.serialNumber,
					merek: 'X',
					kategori: 'Keluar',
					status: 'Selesai',
					asal: 'Mitra',
					tujuan: 'Mitra',
					mitra: mitra.username,
				},
				user: mitra,
			},
			res,
		);

		expect(res.statusCode).toBe(201);

		const updated = await prisma.item.findUnique({ where: { id: item.id } });
		expect(updated.paNumber).toBe(`PA-${RUN}-2`);
	});
});
