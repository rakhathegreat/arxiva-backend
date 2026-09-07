import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const {
	categoryHandlers,
	brandHandlers,
	materialModelHandlers,
} = await import('../../src/modules/masterdata/handlers.js');

const RUN = `MD${Date.now().toString(36).toUpperCase()}`;

const mockRes = () => {
	const res = {
		statusCode: 200,
		body: undefined,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(body) {
			this.body = body;
			return this;
		},
	};
	return res;
};

beforeAll(async () => {});

afterAll(async () => {
	await prisma.item.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.materialModel.deleteMany({ where: { nama: { startsWith: `MDL-${RUN}` } } });
	await prisma.brand.deleteMany({ where: { nama: { startsWith: `BRD-${RUN}` } } });
	await prisma.materialCategory.deleteMany({ where: { nama: { startsWith: `CAT-${RUN}` } } });
	await prisma.$disconnect();
});

describe('masterdata handlers — integration', () => {
	it('kategori: create → list bertotalItems → update → delete', async () => {
		let res = mockRes();
		await categoryHandlers.create({ body: { nama: `CAT-${RUN}` } }, res);
		expect(res.statusCode).toBe(201);
		expect(res.body.category.safetyStock).toBe(0);

		res = mockRes();
		await categoryHandlers.create({ body: {} }, res);
		expect(res.statusCode).toBe(400);
		expect(res.body.message).toBe('Nama is required');

		const created = await prisma.materialCategory.findFirst({ where: { nama: `CAT-${RUN}` } });

		res = mockRes();
		await categoryHandlers.update({ params: { id: String(created.id) }, body: { safetyStock: 7 } }, res);
		expect(res.body.category.safetyStock).toBe(7);

		res = mockRes();
		await categoryHandlers.list({}, res);
		const row = res.body.find((c) => c.id === created.id);
		expect(row.totalItems).toBe(0);

		res = mockRes();
		await categoryHandlers.remove({ params: { id: String(created.id) } }, res);
		expect(res.body.message).toBe('Category deleted successfully');
	}, 20000);

	it('brand: required check, unik nama/identifier, update exclude-self', async () => {
		let res = mockRes();
		await brandHandlers.create({ body: { nama: `BRD-${RUN}` } }, res);
		expect(res.statusCode).toBe(400);

		res = mockRes();
		await brandHandlers.create(
			{ body: { nama: `BRD-${RUN}`, origin: 'Test', identifier: `ID-${RUN}` } },
			res
		);
		expect(res.statusCode).toBe(201);

		res = mockRes();
		await brandHandlers.create(
			{ body: { nama: `BRD-${RUN}-lain`, origin: 'Test', identifier: `ID-${RUN}` } },
			res
		);
		expect(res.statusCode).toBe(400); // identifier bentrok

		const brand = await prisma.brand.findFirst({ where: { nama: `BRD-${RUN}` } });

		res = mockRes();
		await brandHandlers.update(
			{ params: { id: String(brand.id) }, body: { name: `BRD-${RUN}-renamed` } },
			res
		);
		expect(res.statusCode).toBe(200);
		expect(res.body.brand.nama).toBe(`BRD-${RUN}-renamed`);
	}, 20000);

	it('material model: FK kategori tidak ada → 404; create sukses + kode ter-generate', async () => {
		let res = mockRes();
		await materialModelHandlers.create(
			{ body: { nama: `MDL-${RUN}-x`, materialCategoryId: 999999, brandId: 1 } },
			res
		);
		expect(res.statusCode).toBe(404);
		expect(res.body.message).toBe('Category not found');

		const cat = await prisma.materialCategory.create({ data: { nama: `CAT-${RUN}-mm`, safetyStock: 5 } });
		const brand = await prisma.brand.create({
			data: { nama: `BRD-${RUN}-mm`, origin: 'Test', identifier: `ID-${RUN}-mm` },
		});

		res = mockRes();
		await materialModelHandlers.create(
			{ body: { nama: `MDL-${RUN}-ok`, materialCategoryId: String(cat.id), brandId: String(brand.id) } },
			res
		);
		expect(res.statusCode).toBe(201);
		expect(res.body.model.code).toMatch(/^[A-Z0-9-]+-\d+$/);

		res = mockRes();
		await materialModelHandlers.list({}, res);
		const listed = res.body.find((m) => m.nama === `MDL-${RUN}-ok`);
		expect(listed.totalItems).toBe(0);
	}, 20000);
});
