import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.PRISMA_DATASOURCE_URL =
	process.env.TEST_DATABASE_URL || 'mysql://admin:arxiva123@127.0.0.1:3306/arxiva_test';

const { default: prisma } = await import('../../src/shared/prisma.js');
const {
	ensureDeliveryDocument,
	finalizeDeliveryDocument,
} = await import('../../src/modules/bastdoc/service.js');

const RUN = `BD${Date.now().toString(36).toUpperCase()}`;
let admin, mitra, request;

beforeAll(async () => {
	admin = await prisma.user.create({ data: { username: `${RUN}-admin`, password: 'x', role: 'ADMIN' } });
	mitra = await prisma.user.create({
		data: {
			username: `${RUN}-mitra`,
			password: 'x',
			role: 'MITRA',
			profile: { create: { nama: `${RUN} PT`, email: '-', telepon: '-', alamat: '-' } },
		},
	});
	request = await prisma.request.create({
		data: {
			requestNumber: `${RUN}-REQ-1`,
			requesterId: mitra.id,
		},
	});
});

afterAll(async () => {
	await prisma.deliveryDocument.deleteMany({ where: { requestId: request.id } });
	await prisma.request.deleteMany({ where: { requestNumber: { startsWith: `${RUN}-` } } });
	await prisma.userProfile.deleteMany({ where: { user: { username: { startsWith: RUN } } } });
	await prisma.user.deleteMany({ where: { username: { startsWith: RUN } } });
	await prisma.$disconnect();
});

describe('bastdoc service — integration', () => {
	it('ensureDeliveryDocument idempoten: satu dokumen per request', async () => {
		const first = await ensureDeliveryDocument({
			requestId: request.id,
			requestNumber: request.requestNumber,
			generatedById: admin.id,
		});
		const second = await ensureDeliveryDocument({
			requestId: request.id,
			requestNumber: request.requestNumber,
			generatedById: admin.id,
		});

		expect(first.id).toBe(second.id);
		expect(second.documentNumber).toBe(`BAST/REQ/${request.requestNumber}`);
		expect(await prisma.deliveryDocument.count({ where: { requestId: request.id } })).toBe(1);
	}, 20000);

	it('finalizeDeliveryDocument: create bila absen, update bila ada; Drive null', async () => {
		const now = new Date();
		const finalized = await finalizeDeliveryDocument({
			requestId: request.id,
			requestNumber: request.requestNumber,
			generatedById: admin.id,
			now,
			signerName: 'Penerima',
			signatureUrl: 'data:image/png;base64,XXX',
			adminName: 'Admin KP',
			adminSignatureUrl: null,
			filePath: '/uploads/documents/test.pdf',
			itemsSnapshot: [{ serialNumber: 'SN-X', quantity: 1 }],
		});

		expect(finalized.finalFilePath).toBe('/uploads/documents/test.pdf');
		expect(finalized.signerName).toBe('Penerima');
		expect(finalized.driveFileId).toBeNull();

		const again = await finalizeDeliveryDocument({
			requestId: request.id,
			requestNumber: request.requestNumber,
			generatedById: admin.id,
			now: new Date(),
			signerName: 'Penerima 2',
			signatureUrl: 'data:image/png;base64,YYY',
			adminName: 'Admin KP',
			adminSignatureUrl: null,
			filePath: '/uploads/documents/test2.pdf',
			itemsSnapshot: [],
		});

		expect(again.id).toBe(finalized.id);
		expect(again.finalFilePath).toBe('/uploads/documents/test2.pdf');
		expect(await prisma.deliveryDocument.count({ where: { requestId: request.id } })).toBe(1);
	}, 20000);
});
