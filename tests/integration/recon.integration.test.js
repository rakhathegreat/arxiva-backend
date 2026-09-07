import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// DB test terpisah dari data dev (database `arxiva_test`).
process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const {
	validateReconSubmission,
	upsertReconRecord,
	decodeImage,
} = await import('../../src/modules/recon/recon.service.js');

const RUN = `RC${Date.now().toString(36).toUpperCase()}`;
let admin, mitra, model, itemByMitra;

async function seed() {
	admin = await prisma.user.create({ data: { username: `${RUN}-admin`, password: 'x', role: 'ADMIN' } });
	mitra = await prisma.user.create({ data: { username: `${RUN}-mitra`, password: 'x', role: 'MITRA' } });
	const category = await prisma.materialCategory.create({ data: { nama: `CAT-${RUN}` } });
	const brand = await prisma.brand.create({ data: { nama: `BRD-${RUN}`, origin: 'Test', identifier: `ID-${RUN}` } });
	model = await prisma.materialModel.create({
		data: { nama: `MDL-${RUN}`, code: `${RUN}-C`, materialCategoryId: category.id, brandId: brand.id },
	});
}

beforeAll(async () => {
	await seed();

	// Item dimiliki mitra (createdById = mitra.id), berstatus terdistribusi.
	itemByMitra = await prisma.item.create({
		data: {
			serialNumber: `SN-${RUN}-M1`,
			modelId: model.id,
			status: 'digunakan',
			kondisi: 'Baru',
			entryDate: new Date(),
			createdById: mitra.id,
		},
	});
});

afterAll(async () => {
	await prisma.reconRecord.deleteMany({ where: { userId: mitra.id } });
	await prisma.reconRecord.deleteMany({ where: { userId: admin.id } });
	await prisma.item.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.materialModel.deleteMany({ where: { nama: { startsWith: `MDL-${RUN}` } } });
	await prisma.brand.deleteMany({ where: { nama: { startsWith: `BRD-${RUN}` } } });
	await prisma.materialCategory.deleteMany({ where: { nama: { startsWith: `CAT-${RUN}` } } });
	await prisma.user.deleteMany({ where: { username: { startsWith: `${RUN}-` } } });
	await prisma.$disconnect();
});

describe('recon service — integration', () => {
	it('validateReconSubmission: terima item milik mitra', async () => {
		const res = await validateReconSubmission({
			userId: mitra.id,
			itemId: itemByMitra.id,
			image: 'data:image/jpeg;base64,' + Buffer.from('abc').toString('base64'),
		});
		expect(res.ok).toBe(true);
	});

	it('validateReconSubmission: tolak item bukan milik mitra (403)', async () => {
		const ownItem = await prisma.item.create({
			data: {
				serialNumber: `SN-${RUN}-admin`,
				modelId: model.id,
				status: 'tersedia',
				kondisi: 'Baru',
				entryDate: new Date(),
				createdById: admin.id,
			},
		});
		const res = await validateReconSubmission({
			userId: mitra.id,
			itemId: ownItem.id,
			image: 'data:image/jpeg;base64,' + Buffer.from('abc').toString('base64'),
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(403);
	});

	it('validateReconSubmission: tolak item tak ada (404)', async () => {
		const res = await validateReconSubmission({
			userId: mitra.id,
			itemId: 'nonexistent-id',
			image: 'data:image/jpeg;base64,' + Buffer.from('abc').toString('base64'),
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(404);
	});

	it('validateReconSubmission: tolak gambar > 1MB (413)', async () => {
		const big = Buffer.alloc(1024 * 1024 + 1, 1);
		const res = await validateReconSubmission({
			userId: mitra.id,
			itemId: itemByMitra.id,
			image: 'data:image/jpeg;base64,' + big.toString('base64'),
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(413);
	});

	it('decodeImage: base64 data URL', () => {
		const b64 = Buffer.from('hello').toString('base64');
		const decoded = decodeImage(`data:image/png;base64,${b64}`);
		expect(decoded).not.toBeNull();
		expect(decoded.mimeType).toBe('image/png');
		expect(decoded.buffer.toString()).toBe('hello');
	});

	it('upsertReconRecord: create lalu upsert — tetap 1 record per item+date', async () => {
		await upsertReconRecord({
			userId: mitra.id,
			itemId: itemByMitra.id,
			date: `${RUN}-2026`,
			imageUrl: 'http://minio/a.jpg',
		});
		await upsertReconRecord({
			userId: mitra.id,
			itemId: itemByMitra.id,
			date: `${RUN}-2026`,
			imageUrl: 'http://minio/b.jpg',
		});

		const records = await prisma.reconRecord.findMany({
			where: { itemId: itemByMitra.id, date: `${RUN}-2026` },
		});
		expect(records.length).toBe(1);
		expect(records[0].imageUrl).toBe('http://minio/b.jpg');
	});
});
