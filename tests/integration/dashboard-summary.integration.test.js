import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// DB test terpisah dari data dev (database `arxiva_test`).
process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const { getDashboardSummary, getMitraPerformance } = await import('../../src/controllers/dashboard.controller.js');

const RUN = `DASH${Date.now().toString(36).toUpperCase()}`;
let mitra, model;

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
	mitra = await prisma.user.create({
		data: {
			username: `${RUN}-mitra`,
			password: 'x',
			role: 'MITRA',
			profile: { create: { email: `${RUN}@test.id`, nama: `Mitra ${RUN}`, telepon: '-', alamat: '-' } },
		},
	});
	const category = await prisma.materialCategory.create({ data: { nama: `CAT-${RUN}` } });
	const brand = await prisma.brand.create({ data: { nama: `BRD-${RUN}`, origin: 'Test', identifier: `ID-${RUN}` } });
	model = await prisma.materialModel.create({
		data: { nama: `MDL-${RUN}`, code: `${RUN}-C`, materialCategoryId: category.id, brandId: brand.id },
	});
}

async function createItem(serialNumber, status, paNumber = null) {
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

beforeAll(async () => {
	await seed();
});

afterAll(async () => {
	await prisma.request.deleteMany({ where: { requestNumber: { startsWith: `REQ-${RUN}-` } } });
	await prisma.itemMutation.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.item.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.materialModel.deleteMany({ where: { nama: { startsWith: `MDL-${RUN}` } } });
	await prisma.brand.deleteMany({ where: { nama: { startsWith: `BRD-${RUN}` } } });
	await prisma.materialCategory.deleteMany({ where: { nama: { startsWith: `CAT-${RUN}` } } });
	await prisma.user.deleteMany({ where: { username: { startsWith: `${RUN}-` } } });
	await prisma.$disconnect();
});

describe('dashboard summary aggregation', () => {
	it('menyediakan shape lengkap: inventory, distribusi, request, aktivitas, deret harian', async () => {
		await createItem(`SN-${RUN}-T1`, 'tersedia');
		await createItem(`SN-${RUN}-U1`, 'digunakan', `PA-${RUN}-1`);
		await createItem(`SN-${RUN}-R1`, 'rusak');
		await createItem(`SN-${RUN}-H1`, 'hilang');

		await prisma.request.create({
			data: {
				requestNumber: `REQ-${RUN}-0001`,
				status: 'MENUNGGU',
				requesterId: mitra.id,
				requestItems: { create: [{ materialCategoryId: model.materialCategoryId, quantity: 2 }] },
			},
		});

		await prisma.itemMutation.create({
			data: {
				type: 'MASUK',
				itemId: (await prisma.item.findUnique({ where: { serialNumber: `SN-${RUN}-T1` } })).id,
				userId: mitra.id,
				serialNumber: `SN-${RUN}-T1`,
				brand: 'X',
				category: 'CAT',
				paNumber: '',
			},
		});

		const res = mockRes();
		await getDashboardSummary({}, res);

		expect(res.statusCode).toBe(200);
		const data = res.body.data;

		// Inventori: total konsisten dengan penjumlahan setiap status.
		expect(data.inventoryStats.totalItems).toBe(
			data.inventoryStats.tersedia + data.inventoryStats.diluar + data.inventoryStats.rusak + data.inventoryStats.hilang,
		);
		// Item yang baru dibuat tersedia → pasti tidak nol.
		expect(data.inventoryStats.tersedia).toBeGreaterThanOrEqual(1);
		expect(data.inventoryStats.rusak).toBeGreaterThanOrEqual(1);
		expect(data.inventoryStats.hilang).toBeGreaterThanOrEqual(1);

		// Ringkasan request: request MENUNGGU kita ikut terhitung.
		expect(data.requestCounts.menunggu).toBeGreaterThanOrEqual(1);

		// Request terbaru ≤5, termuat request kita, terurut menurun.
		expect(data.recentRequests.length).toBeLessThanOrEqual(5);
		expect(data.recentRequests.map((r) => r.requestNumber)).toContain(`REQ-${RUN}-0001`);
		expect(data.recentRequests[0].requestedAt >= data.recentRequests[data.recentRequests.length - 1].requestedAt).toBe(true);

		// Aktivitas terbaru ≤10 dan memuat mutasi kita.
		expect(data.recentActivity.length).toBeLessThanOrEqual(10);
		expect(data.recentActivity.some((a) => a.serialNumber === `SN-${RUN}-T1`)).toBe(true);

		// Distribusi: mitra kita tercatat dengan hitungan total yang benar.
		const distro = data.mitraDistribution.find((d) => d.mitra === `Mitra ${RUN}`);
		expect(distro).toBeTruthy();
		expect(distro.total).toBe(distro.tersedia + distro.terpakai);
		expect(distro.terpakai).toBeGreaterThanOrEqual(1);

		// Deret harian: tepat 90 titik, masuk ≥1 pada hari ini (mutasi MASUK dibuat hari ini).
		expect(data.transactionSeries.length).toBe(90);
		expect(data.transactionSeries.at(-1).masuk).toBeGreaterThanOrEqual(1);
		expect(
			data.transactionSeries.every(
				(p) => typeof p.masuk === 'number' && typeof p.keluar === 'number',
			),
		).toBe(true);
	});

	it('getMitraPerformance menghitung performa mitra dari request SELESAI saja', async () => {
		await prisma.request.create({
			data: {
				requestNumber: `REQ-${RUN}-0002`,
				status: 'SELESAI',
				requesterId: mitra.id,
				requestItems: {
					create: [
						{ materialCategoryId: model.materialCategoryId, quantity: 3 },
						{ materialCategoryId: model.materialCategoryId, quantity: 2 },
					],
				},
			},
		});

		const res = mockRes();
		await getMitraPerformance({}, res);

		expect(res.statusCode).toBe(200);
		const mitraRow = res.body.data.find((m) => m.id === mitra.id);
		expect(mitraRow).toBeTruthy();
		expect(mitraRow.name).toBe(`Mitra ${RUN}`);
		expect(mitraRow.requestCount).toBeGreaterThanOrEqual(1);
		// totalItems = jumlah quantity requestItems request yang SELESAI.
		expect(mitraRow.totalItems).toBeGreaterThanOrEqual(5);
		expect(typeof mitraRow.status).toBe('string');
		expect(typeof mitraRow.isIdleStock).toBe('boolean');
	});
});