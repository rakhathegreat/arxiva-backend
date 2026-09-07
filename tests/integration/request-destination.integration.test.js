import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const { getUsers } = await import('../../src/controllers/user.controller.js');
const {
	createRequest,
	getRequests,
	getRequestById,
} = await import('../../src/controllers/request.controller.js');

const RUN = `DST${Date.now().toString(36).toUpperCase()}`;

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

let admin, mitraA, mitraB, mitraInactive, category, brand, model;

async function makeUser(username, role, opts = {}) {
	return prisma.user.create({
		data: {
			username,
			password: 'x',
			role,
			isAktif: opts.isAktif ?? true,
			profile: { create: { nama: opts.nama || username, email: '-', telepon: '-', alamat: '-' } },
		},
	});
}

beforeAll(async () => {
	admin = await makeUser(`${RUN}-admin`, 'ADMIN');
	mitraA = await makeUser(`${RUN}-a`, 'MITRA', { nama: `${RUN} PT A` });
	mitraB = await makeUser(`${RUN}-b`, 'MITRA', { nama: `${RUN} PT B` });
	mitraInactive = await makeUser(`${RUN}-c`, 'MITRA', { isAktif: false });

	category = await prisma.materialCategory.create({ data: { nama: `CAT-${RUN}` } });
	brand = await prisma.brand.create({ data: { nama: `BRD-${RUN}`, origin: 'Test', identifier: `ID-${RUN}` } });
	model = await prisma.materialModel.create({
		data: { nama: `MDL-${RUN}`, code: `${RUN}-C`, materialCategoryId: category.id, brandId: brand.id },
	});
});

afterAll(async () => {
	await prisma.request.deleteMany({ where: { requesterId: mitraA.id } });
	await prisma.request.deleteMany({ where: { destinationUserId: mitraB.id } });
	await prisma.materialModel.deleteMany({ where: { nama: { startsWith: `MDL-${RUN}` } } });
	await prisma.brand.deleteMany({ where: { nama: { startsWith: `BRD-${RUN}` } } });
	await prisma.materialCategory.deleteMany({ where: { nama: { startsWith: `CAT-${RUN}` } } });
	await prisma.user.deleteMany({ where: { username: { startsWith: `${RUN}-` } } });
	await prisma.$disconnect();
});

describe('mitra melihat & memilih user sebagai tujuan request', () => {
	it('getUsers sebagai MITRA hanya menampilkan mitra aktif (tidak admin, tidak nonaktif)', async () => {
		const res = mockRes();
		await getUsers({ user: { role: 'MITRA' } }, res);
		const ids = res.body.map((u) => u.id);
		expect(ids).toContain(mitraA.id);
		expect(ids).toContain(mitraB.id);
		expect(ids).not.toContain(mitraInactive.id);
		expect(ids).not.toContain(admin.id);
	});

	it('getUsers sebagai ADMIN menampilkan semua user', async () => {
		const res = mockRes();
		await getUsers({ user: { role: 'ADMIN' } }, res);
		const ids = res.body.map((u) => u.id);
		expect(ids).toContain(admin.id);
		expect(ids).toContain(mitraInactive.id);
	});

	it('createRequest dengan destinationUserId valid (mitra lain) → 201 + tersimpan', async () => {
		const res = mockRes();
		await createRequest(
			{
				body: {
					requesterId: mitraA.id,
					destinationUserId: mitraB.id,
					items: [{ materialCategoryId: category.id, brandId: brand.id, modelId: model.id, quantity: 2 }],
				},
			},
			res
		);
		expect(res.statusCode).toBe(201);
		expect(res.body.request.destinationUserId).toBe(mitraB.id);
		expect(res.body.request.destinationUser?.profile?.nama).toBe(`${RUN} PT B`);

		const reqId = res.body.request.id;
		const detail = mockRes();
		await getRequestById({ params: { id: reqId } }, detail);
		expect(detail.body.destinationUserId).toBe(mitraB.id);
	});

	it('createRequest menolak tujuan = diri sendiri → 400', async () => {
		const res = mockRes();
		await createRequest(
			{
				body: {
					requesterId: mitraA.id,
					destinationUserId: mitraA.id,
					items: [{ materialCategoryId: category.id, quantity: 1 }],
				},
			},
			res
		);
		expect(res.statusCode).toBe(400);
	});

	it('createRequest menolak tujuan admin (bukan mitra) → 400', async () => {
		const res = mockRes();
		await createRequest(
			{
				body: {
					requesterId: mitraA.id,
					destinationUserId: admin.id,
					items: [{ materialCategoryId: category.id, quantity: 1 }],
				},
			},
			res
		);
		expect(res.statusCode).toBe(400);
	});

	it('createRequest menolak tujuan mitra nonaktif → 400', async () => {
		const res = mockRes();
		await createRequest(
			{
				body: {
					requesterId: mitraA.id,
					destinationUserId: mitraInactive.id,
					items: [{ materialCategoryId: category.id, quantity: 1 }],
				},
			},
			res
		);
		expect(res.statusCode).toBe(400);
	});

	it('getRequests mengekspos destinationName', async () => {
		const res = mockRes();
		await getRequests({}, res);
		const rows = res.body.filter((r) => r.requesterName === `${RUN} PT A`);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows[0].destinationName).toBe(`${RUN} PT B`);
	});
});
