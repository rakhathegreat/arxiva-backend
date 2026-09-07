import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// DB test terpisah dari data dev (database `arxiva_test`).
process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const { createRequest, updateRequestStatus, scanInterPartnerItems, getRequests, downloadBastPdf } = await import('../../src/controllers/request.controller.js');

const RUN = `IM${Date.now().toString(36).toUpperCase()}`;
const SN = (n) => `SN-${RUN}-${n}`;
let admin, requester, provider, category, brand, model, providerLoc;

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

function mockBastRes() {
	const { Writable } = require('node:stream');
	const chunks = [];
	const res = new Writable({
		write(chunk, enc, cb) {
			chunks.push(chunk);
			cb();
		},
	});
	res.statusCode = null;
	res.body = null;
	res.headers = {};
	res.chunks = chunks;
	res.status = (code) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body) => {
		res.body = body;
		return res;
	};
	res.setHeader = (key, value) => {
		res.headers[key] = value;
		return res;
	};
	return res;
}

async function seed() {
	admin = await prisma.user.create({ data: { username: `${RUN}-admin`, password: 'x', role: 'ADMIN' } });
	requester = await prisma.user.create({
		data: {
			username: `${RUN}-req`,
			password: 'x',
			role: 'MITRA',
			profile: { create: { nama: `${RUN} PEMINTA`, email: '-', telepon: '-', alamat: '-' } },
		},
		include: { profile: true },
	});
	provider = await prisma.user.create({
		data: {
			username: `${RUN}-prov`,
			password: 'x',
			role: 'MITRA',
			profile: { create: { nama: `${RUN} PEMBERI`, email: '-', telepon: '-', alamat: '-' } },
		},
		include: { profile: true },
	});
	category = await prisma.materialCategory.create({ data: { nama: `CAT-${RUN}` } });
	brand = await prisma.brand.create({ data: { nama: `BRD-${RUN}`, origin: 'Test', identifier: `ID-${RUN}` } });
	model = await prisma.materialModel.create({
		data: { nama: `MDL-${RUN}`, code: `${RUN}-C`, materialCategoryId: category.id, brandId: brand.id },
	});
	providerLoc = await prisma.location.create({ data: { name: `LOC-${RUN}-prov`, type: 'BOX', capacity: 500, isActive: true } });
	await prisma.userLocation.create({ data: { userId: provider.id, locationId: providerLoc.id } });

	await prisma.item.createMany({
		data: [1, 2, 3, 4, 5, 6].map((i) => ({
			serialNumber: SN(`P${i}`),
			modelId: model.id,
			status: 'tersedia',
			locationId: providerLoc.id,
			createdById: admin.id,
			entryDate: new Date(),
		})),
	});
}

async function makeRequest() {
	const body = {
		requesterId: requester.id,
		providerPartnerId: provider.id,
		isInterPartner: true,
		notes: 'butuh unit untuk penugasan',
		items: [
			{ materialCategoryId: category.id, brandId: brand.id, modelId: model.id, quantity: 2 },
		],
	};
	const res = mockRes();
	await createRequest({ body }, res);
	expect(res.statusCode).toBe(201);
	expect(res.body.request.type).toBe('INTER_MITRA');
	return res.body.request;
}

async function approve(request, by = admin) {
	const res = mockRes();
	await updateRequestStatus(
		{ params: { id: request.id }, body: { status: 'DISETUJUI' }, user: { id: by.id, role: by.role } },
		res,
	);
	return res;
}

beforeAll(async () => {
	await seed();
});

afterAll(async () => {
	await prisma.requestAllocation.deleteMany({ where: { requestItem: { request: { requesterId: requester.id } } } });
	await prisma.deliveryDocument.deleteMany({ where: { request: { requesterId: requester.id } } });
	await prisma.itemMutation.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.requestItem.deleteMany({ where: { request: { requesterId: requester.id } } });
	await prisma.request.deleteMany({ where: { requesterId: requester.id } });
	await prisma.item.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.userLocation.deleteMany({ where: { userId: { in: [requester.id, provider.id] } } });
	await prisma.location.deleteMany({ where: { name: { startsWith: `LOC-${RUN}` } } });
	await prisma.userProfile.deleteMany({ where: { user: { username: { startsWith: RUN } } } });
	const cats = await prisma.materialCategory.findMany({
		where: { nama: { startsWith: `CAT-${RUN}` } },
		select: { id: true },
	});
	await prisma.materialModel.deleteMany({ where: { materialCategoryId: { in: cats.map((c) => c.id) } } });
	await prisma.materialModel.deleteMany({ where: { nama: { startsWith: `MDL-${RUN}` } } });
	await prisma.brand.deleteMany({ where: { nama: { startsWith: `BRD-${RUN}` } } });
	await prisma.materialCategory.deleteMany({ where: { nama: { startsWith: `CAT-${RUN}` } } });
	await prisma.user.deleteMany({ where: { username: { startsWith: RUN } } });
	await prisma.$disconnect();
});

describe('alur INTER_MITRA — antar mitra: minta → setuju admin → scan pemberi → scan penerima', () => {
	it('happy path: request antar mitra selesai & item pindah ke lokasi peminta', async () => {
		const request = await makeRequest();

		// 1. Admin setujui → DISETUJUI + BAST
		let res = await approve(request);
		expect(res.body && res.body.request && res.body.request.status).toBe('DISETUJUI');
		const doc = await prisma.deliveryDocument.findUnique({ where: { requestId: request.id } });
		expect(doc).toBeTruthy();

		const ri = await prisma.requestItem.findFirst({ where: { requestId: request.id } });

		// 2. Provider (mitra pemberi) scan → SERAH + alokasi dibuat
		res = mockRes();
		await scanInterPartnerItems(
			{
				params: { id: request.id },
				body: {
					scanParty: 'provider',
					items: [{ requestItemId: ri.id, serialNumbers: [SN('P1'), SN('P2')] }],
				},
				user: { id: provider.id, role: 'MITRA' },
			},
			res,
		);
		expect(res.body && res.body.message).toBeTruthy();
		const serah = await prisma.request.findUnique({ where: { id: request.id } });
		expect(serah.status).toBe('SERAH');
		expect(serah.shippedAt).toBeTruthy();
		const allocs = await prisma.requestAllocation.findMany({ where: { requestItemId: ri.id } });
		expect(allocs.length).toBe(2);
		const riAfter = await prisma.requestItem.findUnique({ where: { id: ri.id } });
		expect(riAfter.donorSerialNumbers.split(',').length).toBe(2);
		expect(riAfter.donorScannedAt).toBeTruthy();

		// 3. Receiver (mitra peminta) scan → SELESAI + transfer
		res = mockRes();
		await scanInterPartnerItems(
			{
				params: { id: request.id },
				body: {
					scanParty: 'receiver',
					items: [{ requestItemId: ri.id, serialNumbers: [SN('P1'), SN('P2')] }],
				},
				user: { id: requester.id, role: 'MITRA' },
			},
			res,
		);
		expect(res.body && res.body.message).toBeTruthy();
		const selesai = await prisma.request.findUnique({ where: { id: request.id } });
		expect(selesai.status).toBe('SELESAI');
		expect(selesai.completedAt).toBeTruthy();

		// Item kini milik peminta & berada di lokasi peminta
		const reqLoc = await prisma.userLocation.findFirst({ where: { userId: requester.id } });
		const moved = await prisma.item.findMany({
			where: { serialNumber: { in: [SN('P1'), SN('P2')] } },
		});
		expect(moved.length).toBe(2);
		for (const item of moved) {
			expect(item.status).toBe('digunakan');
			expect(item.locationId).toBe(reqLoc.locationId);
			expect(item.createdById).toBe(requester.id);
		}

		// Ledger KELUAR terikat request
		const mutations = await prisma.itemMutation.findMany({ where: { requestId: request.id, type: 'KELUAR' } });
		expect(mutations.length).toBe(2);

		const riFinal = await prisma.requestItem.findUnique({ where: { id: ri.id } });
		expect(riFinal.receiverScannedAt).toBeTruthy();
	}, 30000);

	it('provider scan menolak jumlah SN ≠ kuantitas', async () => {
		const request = await makeRequest();
		await approve(request);
		const ri = await prisma.requestItem.findFirst({ where: { requestId: request.id } });

		const res = mockRes();
		await scanInterPartnerItems(
			{
				params: { id: request.id },
				body: {
					scanParty: 'provider',
					items: [{ requestItemId: ri.id, serialNumbers: [SN('P3')] }],
				},
				user: { id: provider.id, role: 'MITRA' },
			},
			res,
		);
		expect(res.statusCode).toBe(400);
		const status = await prisma.request.findUnique({ where: { id: request.id } });
		expect(status.status).toBe('DISETUJUI');
	}, 20000);

	it('mitra bukan pemberi tidak bisa scan provider (403)', async () => {
		const request = await makeRequest();
		await approve(request);
		const ri = await prisma.requestItem.findFirst({ where: { requestId: request.id } });

		const res = mockRes();
		await scanInterPartnerItems(
			{
				params: { id: request.id },
				body: {
					scanParty: 'provider',
					items: [{ requestItemId: ri.id, serialNumbers: [SN('P1'), SN('P2')] }],
				},
				user: { id: requester.id, role: 'MITRA' }, // peminta ≠ pemberi
			},
			res,
		);
		expect(res.statusCode).toBe(403);
	}, 20000);

	it('receiver scan dengan SN berbeda dari donor ditolak', async () => {
		const request = await makeRequest();
		await approve(request);
		const ri = await prisma.requestItem.findFirst({ where: { requestId: request.id } });

		let res = mockRes();
		await scanInterPartnerItems(
			{
				params: { id: request.id },
				body: {
					scanParty: 'provider',
					items: [{ requestItemId: ri.id, serialNumbers: [SN('P4'), SN('P5')] }],
				},
				user: { id: provider.id, role: 'MITRA' },
			},
			res,
		);
		expect(res.body && res.body.message).toBeTruthy();

		// Peminta scan SN yang salah (P3 bukan yang diserahkan)
		res = mockRes();
		await scanInterPartnerItems(
			{
				params: { id: request.id },
				body: {
					scanParty: 'receiver',
					items: [{ requestItemId: ri.id, serialNumbers: [SN('P3'), SN('P4')] }],
				},
				user: { id: requester.id, role: 'MITRA' },
			},
			res,
		);
		expect(res.statusCode).toBe(400);
		const status = await prisma.request.findUnique({ where: { id: request.id } });
		expect(status.status).toBe('SERAH');
	}, 20000);

	it('mitra tidak bisa menyetujui (DISETUJUI) — hanya admin', async () => {
		const request = await makeRequest();
		// provider mencoba setujui sendiri
		const res = await approve(request, provider);
		expect(res.statusCode).toBe(403);
	}, 20000);

	it('OUTGOING biasa tidak bisa diproses via endpoint scan', async () => {
		const body = {
			requesterId: requester.id,
			notes: 'keluar biasa',
			items: [{ materialCategoryId: category.id, brandId: brand.id, modelId: model.id, quantity: 1 }],
		};
		const createRes = mockRes();
		await createRequest({ body }, createRes);
		expect(createRes.statusCode).toBe(201);

		const res = mockRes();
		await scanInterPartnerItems(
			{
				params: { id: createRes.body.request.id },
				body: { scanParty: 'provider', items: [] },
				user: { id: provider.id, role: 'MITRA' },
			},
			res,
		);
		expect(res.statusCode).toBe(400);
	}, 20000);

	it('daftar permintaan terpisah: default = ke admin/KP, type=inter-partner = antar mitra', async () => {
		const kpRes = mockRes();
		await createRequest(
			{
				body: {
					requesterId: requester.id,
					notes: 'keluar ke KP',
					items: [{ materialCategoryId: category.id, brandId: brand.id, modelId: model.id, quantity: 1 }],
				},
			},
			kpRes,
		);
		expect(kpRes.statusCode).toBe(201);
		const kpRequest = kpRes.body.request;

		const interRequest = await makeRequest();

		const defaultRes = mockRes();
		await getRequests({ query: {} }, defaultRes);
		const defaultList = defaultRes.body;
		expect(defaultList.some((r) => r.id === kpRequest.id)).toBe(true);
		expect(defaultList.some((r) => r.id === interRequest.id)).toBe(false);

		const interListRes = mockRes();
		await getRequests({ query: { type: 'inter-partner' } }, interListRes);
		const interList = interListRes.body;
		expect(interList.some((r) => r.id === interRequest.id)).toBe(true);
		expect(interList.some((r) => r.id === kpRequest.id)).toBe(false);

		// List harus membawa requesterId agar klien bisa mendeteksi "saya peminta"
		const interVisible = interList.find((r) => r.id === interRequest.id);
		expect(interVisible.requesterId).toBe(requester.id);
	}, 20000);

	it('BAST antar mitra tersedia sejak DISETUJUI (downloadBastPdf)', async () => {
		const request = await makeRequest();
		expect((await approve(request)).body.request.status).toBe('DISETUJUI');

		const res = mockBastRes();
		await downloadBastPdf({ params: { id: request.id }, user: { id: admin.id, role: 'ADMIN' } }, res);
		// Gate status lintas (bukan 400/403) → draft BAST bisa diunduh saat DISETUJUI
		expect(res.statusCode === null || [200].includes(res.statusCode)).toBe(true);
	}, 20000);

	it('BAST antar mitra belum tersedia saat MENUNGGU', async () => {
		const request = await makeRequest();
		const res = mockBastRes();
		await downloadBastPdf({ params: { id: request.id }, user: { id: admin.id, role: 'ADMIN' } }, res);
		expect(res.statusCode).toBe(400);
	}, 20000);
});