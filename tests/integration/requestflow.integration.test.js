import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// DB test terpisah dari data dev (native MariaDB, database `arxiva_test`).
// PRISMA_DATASOURCE_URL tidak bisa ditimpa oleh .env (lihat src/shared/prisma.js).
process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const {
	completeRequest,
	releaseAllocations,
	buildAllocationSnapshot,
} = await import('../../src/modules/requestflow/requestflow.service.js');

const RUN = `RF${Date.now().toString(36).toUpperCase()}`;
let admin, category, brand, model, originLoc;
const createdMitras = [];

async function makeMitra() {
	const mitra = await prisma.user.create({
		data: {
			username: `${RUN}-mitra-${createdMitras.length}`,
			password: 'x',
			role: 'MITRA',
			profile: { create: { nama: `${RUN} PT`, email: '-', telepon: '-', alamat: '-' } },
		},
	});
	createdMitras.push(mitra);
	return mitra;
}

async function makeRequestWithAllocations({ itemCount = 2, withPartnerLocation = true, capacity = 999999 }) {
	const owner = await makeMitra();
	const request = await prisma.request.create({
		data: {
			requestNumber: `${RUN}-REQ-${Math.floor(Math.random() * 100000)}`,
			requesterId: owner.id,
			requestItems: {
				create: [
					{ materialCategoryId: category.id, brandId: brand.id, modelId: model.id, quantity: itemCount },
				],
			},
		},
		include: { requestItems: true },
	});

	const items = [];
	for (let i = 0; i < itemCount; i++) {
		const item = await prisma.item.create({
			data: {
				serialNumber: `SN-${RUN}-${request.id.slice(0, 6)}-${i}`,
				modelId: model.id,
				status: 'tersedia',
				kondisi: 'Baru',
				locationId: originLoc.id,
				entryDate: new Date(),
				createdById: admin.id,
			},
		});
		items.push(item);
		await prisma.requestAllocation.create({
			data: { requestItemId: request.requestItems[0].id, itemId: item.id, allocatedById: admin.id },
		});
		await prisma.requestItem.update({ where: { id: request.requestItems[0].id }, data: { fulfilledQuantity: { increment: 1 } } });
	}

	if (withPartnerLocation) {
		const partnerLocation = await prisma.location.create({
			data: { name: `${RUN}-partner-${request.id.slice(0, 5)}`, type: 'PARTNER', capacity },
		});
		await prisma.userLocation.create({ data: { userId: owner.id, locationId: partnerLocation.id } });
		return { request: await refetch(request.id), items, partnerLocation, owner };
	}
	return { request: await refetch(request.id), items, partnerLocation: null, owner };
}

const refetch = (id) =>
	prisma.request.findUnique({
		where: { id },
		include: { requestItems: { include: { allocations: true } } },
	});

beforeAll(async () => {
	admin = await prisma.user.create({ data: { username: `${RUN}-admin`, password: 'x', role: 'ADMIN' } });
	category = await prisma.materialCategory.create({ data: { nama: `CAT-${RUN}`, safetyStock: 5 } });
	brand = await prisma.brand.create({ data: { nama: `BRD-${RUN}`, origin: 'Test', identifier: `ID-${RUN}` } });
	model = await prisma.materialModel.create({
		data: { nama: `MDL-${RUN}`, code: `${RUN}-C`, materialCategoryId: category.id, brandId: brand.id },
	});
	originLoc = await prisma.location.create({ data: { name: `LOC-${RUN}-gudang`, type: 'BOX', capacity: 100, isActive: true } });
});

afterAll(async () => {
	await prisma.itemMutation.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.requestAllocation.deleteMany({ where: { requestItem: { request: { requestNumber: { startsWith: `${RUN}-` } } } } });
	await prisma.requestItem.deleteMany({ where: { request: { requestNumber: { startsWith: `${RUN}-` } } } });
	await prisma.request.deleteMany({ where: { requestNumber: { startsWith: `${RUN}-` } } });
	await prisma.item.deleteMany({ where: { serialNumber: { startsWith: `SN-${RUN}` } } });
	await prisma.userLocation.deleteMany({ where: { user: { username: { startsWith: RUN } } } });
	await prisma.location.deleteMany({ where: { name: { startsWith: `LOC-${RUN}` } } });
	await prisma.location.deleteMany({ where: { name: { startsWith: `${RUN} PT` } } });
	await prisma.userProfile.deleteMany({ where: { user: { username: { startsWith: RUN } } } });
	await prisma.materialModel.deleteMany({ where: { nama: { startsWith: `MDL-${RUN}` } } });
	await prisma.brand.deleteMany({ where: { nama: { startsWith: `BRD-${RUN}` } } });
	await prisma.materialCategory.deleteMany({ where: { nama: { startsWith: `CAT-${RUN}` } } });
	await prisma.user.deleteMany({ where: { username: { startsWith: RUN } } });
	await prisma.$disconnect();
});

describe('completeRequest — integration', () => {
	it('happy path: item pindah ke lokasi partner, status digunakan, owner requester, ledger KELUAR', async () => {
		const { request, items, partnerLocation, owner } = await makeRequestWithAllocations({});
		const actor = { id: admin.id };

		const updated = await prisma.$transaction((tx) => completeRequest(tx, request, actor));

		expect(updated.status).toBe('SELESAI');
		expect(updated.completedAt).toBeTruthy();

		for (const item of items) {
			const after = await prisma.item.findUnique({ where: { id: item.id } });
			expect(after.status).toBe('digunakan');
			expect(after.locationId).toBe(partnerLocation.id);
			expect(after.createdById).toBe(owner.id);

			const mutation = await prisma.itemMutation.findFirst({
				where: { itemId: item.id, type: 'KELUAR' },
			});
			expect(mutation).toBeTruthy();
			expect(mutation.requestId).toBe(request.id);
			expect(mutation.destinationLocationId).toBe(partnerLocation.id);
		}
	}, 20000);

	it('kapasitas penuh → CAPACITY_FULL dan rollback penuh', async () => {
		const { request, items } = await makeRequestWithAllocations({ capacity: 1 });
		const actor = { id: admin.id };

		await expect(
			prisma.$transaction((tx) => completeRequest(tx, request, actor))
		).rejects.toMatchObject({ code: 'CAPACITY_FULL' });

		const unchanged = await refetch(request.id);
		expect(unchanged.status).not.toBe('SELESAI');
		for (const item of items) {
			const still = await prisma.item.findUnique({ where: { id: item.id } });
			expect(still.status).toBe('tersedia');
			expect(await prisma.itemMutation.count({ where: { itemId: item.id, type: 'KELUAR' } })).toBe(0);
		}
	}, 20000);

	it('mitra tanpa UserLocation → auto-provision lokasi PARTNER bernama mitra + completion sukses', async () => {
		const { request, items, owner } = await makeRequestWithAllocations({ withPartnerLocation: false });
		const actor = { id: admin.id };

		const updated = await prisma.$transaction((tx) => completeRequest(tx, request, actor));

		expect(updated.status).toBe('SELESAI');

		const link = await prisma.userLocation.findFirst({ where: { userId: owner.id }, include: { location: true } });
		expect(link).toBeTruthy();
		expect(link.location.type).toBe('PARTNER');
		expect(link.location.name).toBe(`${RUN} PT`);

		const after = await prisma.item.findUnique({ where: { id: items[0].id } });
			expect(after.locationId).toBe(link.locationId);
			expect(after.status).toBe('digunakan');
	}, 20000);

	it('completion menulis notifikasi untuk requester (Opsi A)', async () => {
		const { request, owner } = await makeRequestWithAllocations({ itemCount: 1 });
		await prisma.$transaction((tx) => completeRequest(tx, request, { id: admin.id }));

		const notif = await prisma.notification.findFirst({
			where: { userId: owner.id, referenceId: request.id },
		});
		expect(notif).toBeTruthy();
		expect(notif.type).toBe('REQUEST');
		expect(notif.title).toContain('selesai');
	}, 20000);
});

describe('releaseAllocations & buildAllocationSnapshot — integration', () => {
	it('releaseAllocations menghapus alokasi dan reset fulfilledQuantity', async () => {
		const { request } = await makeRequestWithAllocations({ itemCount: 3 });
		const riId = request.requestItems[0].id;
		expect((await refetch(request.id)).requestItems[0].fulfilledQuantity).toBe(3);

		await prisma.$transaction((tx) => releaseAllocations(tx, request));

		expect(await prisma.requestAllocation.count({ where: { requestItemId: riId } })).toBe(0);
		expect((await refetch(request.id)).requestItems[0].fulfilledQuantity).toBe(0);
	}, 20000);

	it('buildAllocationSnapshot memetakan field snapshot dengan benar', async () => {
		const full = await prisma.request.findUnique({
			where: { id: (await makeRequestWithAllocations({ itemCount: 1 })).request.id },
			include: {
				requestItems: {
					include: {
						allocations: { include: { item: { include: { model: { include: { brand: true, materialCategory: true } } } } } },
					},
				},
			},
		});
		const snap = buildAllocationSnapshot(full);
		expect(snap).toHaveLength(1);
		expect(snap[0]).toMatchObject({
			materialName: `MDL-${RUN}`,
			serialNumber: expect.stringContaining(`SN-${RUN}`),
			quantity: 1,
			unit: 'Unit',
		});
		expect(snap[0].materialNumber).toBe(`${RUN}-C`);
	}, 20000);
});
