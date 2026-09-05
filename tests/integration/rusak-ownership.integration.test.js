import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// DB test terpisah dari data dev (database `arxiva_test`).
process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const { updateItem } = await import('../../src/controllers/item.controller.js');
const { receiveItems } = await import('../../src/modules/intake/intake.service.js');

const RUN = `RSK${Date.now().toString(36).toUpperCase()}`;
const SN = (n) => `SN-${RUN}-${n}`;
let admin, mitra, model;

async function seed() {
	admin = await prisma.user.create({ data: { username: `${RUN}-admin`, password: 'x', role: 'ADMIN' } });
	mitra = await prisma.user.create({ data: { username: `${RUN}-mitra`, password: 'x', role: 'MITRA' } });

	const category = await prisma.materialCategory.create({ data: { nama: `CAT-${RUN}` } });
	const brand = await prisma.brand.create({
		data: { nama: `BRD-${RUN}`, origin: 'Test', identifier: `ID-${RUN}` },
	});
	model = await prisma.materialModel.create({
		data: {
			nama: `MDL-${RUN}`,
			code: `${RUN}-C`,
			materialCategoryId: category.id,
			brandId: brand.id,
		},
	});
}

async function createItem(serialNumber, { status = 'digunakan', owner = mitra.id } = {}) {
	return prisma.item.create({
		data: {
			serialNumber,
			modelId: model.id,
			status,
			kondisi: 'Baru',
			entryDate: new Date(),
			createdById: owner,
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

const mitraActor = () => ({ id: mitra.id, role: 'MITRA', profile: null });
const adminActor = () => ({ id: admin.id, role: 'ADMIN', profile: null });

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

describe('updateItem — material jadi Rusak pindah ownership ke KP', () => {
	it('aktor MITRA menandai Rusak → owner menjadi user ADMIN (KP)', async () => {
		const item = await createItem(SN('upd-1'));
		const res = mockRes();

		await updateItem(
			{
				params: { id: item.id },
				body: { serialNumber: item.serialNumber, status: 'Rusak', mitra: mitra.username },
				user: { id: mitra.id, role: 'MITRA' },
			},
			res,
		);

		expect(res.body?.message).toBe('Item updated successfully');

		const updated = await prisma.item.findUnique({
			where: { id: item.id },
			include: { createdBy: true },
		});
		expect(updated.status).toBe('rusak');
		expect(updated.createdBy.role).toBe('ADMIN');
	});

	it('non-Rusak tidak mengubah ownership mitra', async () => {
		const item = await createItem(SN('upd-2'));
		const res = mockRes();

		await updateItem(
			{
				params: { id: item.id },
				body: { serialNumber: item.serialNumber, status: 'Tersedia', mitra: mitra.username },
				user: { id: mitra.id, role: 'MITRA' },
			},
			res,
		);

		const updated = await prisma.item.findUnique({ where: { id: item.id } });
		expect(updated.status).toBe('tersedia');
		expect(updated.createdById).toBe(mitra.id);
	});
});

describe('intake — material Rusak dipindah ownership ke KP', () => {
	it('retur item existing milik mitra dgn kondisi Rusak → owner menjadi ADMIN', async () => {
		const item = await createItem(SN('in-1'), { status: 'digunakan' });

		const results = await receiveItems(adminActor(), [
			{
				serialNumber: item.serialNumber,
				kondisi: 'Rusak',
				ticket: `TKT-${RUN}`,
				kategori: `CAT-${RUN}`,
				merek: `BRD-${RUN}`,
				lokasiPenyimpanan: `LOC-${RUN}-rusak`,
			},
		]);

		expect(results[0].ok).toBe(true);
		const updated = await prisma.item.findUnique({
			where: { id: item.id },
			include: { createdBy: true },
		});
		expect(updated.status).toBe('rusak');
		expect(updated.createdBy.role).toBe('ADMIN');
	}, 20000);

	it('item baru dengan kondisi Rusak → owner menjadi ADMIN', async () => {
		const results = await receiveItems(adminActor(), [
			{
				serialNumber: SN('in-2'),
				kondisi: 'Rusak',
				ticket: `TKT-${RUN}-2`,
				kategori: `CAT-${RUN}`,
				merek: `BRD-${RUN}`,
				lokasiPenyimpanan: `LOC-${RUN}-rusak`,
			},
		]);

		expect(results[0].ok).toBe(true);
		const created = await prisma.item.findUnique({
			where: { serialNumber: SN('in-2') },
			include: { createdBy: true },
		});
		expect(created.status).toBe('rusak');
		expect(created.createdBy.role).toBe('ADMIN');
	}, 20000);

	it('item existing non-Rusak (tersedia) → ownership mitra tidak diubah', async () => {
		const item = await createItem(SN('in-3'), { status: 'digunakan' });

		const results = await receiveItems(adminActor(), [
			{
				serialNumber: item.serialNumber,
				kondisi: 'Dismantle',
				paNumber: 'PA-X',
				kategori: `CAT-${RUN}`,
				merek: `BRD-${RUN}`,
				lokasiPenyimpanan: `LOC-${RUN}-rusak`,
			},
		]);

		expect(results[0].ok).toBe(true);
		const updated = await prisma.item.findUnique({ where: { id: item.id } });
		expect(updated.status).toBe('tersedia');
		expect(updated.createdById).toBe(mitra.id);
	}, 20000);
});
