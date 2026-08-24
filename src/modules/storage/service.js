import prisma from '../../shared/prisma.js';

const db = (tx) => tx ?? prisma;

async function getOrCreateLocation(name, createData = {}, tx = null) {
	const client = db(tx);
	const parentId = createData.parentId ?? null;
	let loc = await client.location.findFirst({ where: { name, parentId } });
	if (loc) return loc;
	try {
		return await client.location.create({ data: { name, ...createData } });
	} catch (error) {
		if (error.code === 'P2002') {
			return client.location.findFirst({ where: { name, parentId } });
		}
		throw error;
	}
}

/**
 * Resolve nama lokasi tampilan ("Rak - Level", "Diluar", atau nama BOX)
 * menjadi locationId. Lokasi unknown di-auto-create (kapasitas default 50),
 * perilaku yang dipertahankan karena frontend bergantian padanya.
 */
export async function resolveLocationId(lokasiPenyimpanan, tx = null) {
	if (!lokasiPenyimpanan || lokasiPenyimpanan === 'Diluar') {
		let loc = await db(tx).location.findFirst({ where: { name: 'Diluar', parentId: null } });
		if (!loc) loc = await db(tx).location.findFirst({ where: { name: 'Keluar', parentId: null } });
		if (!loc) loc = await getOrCreateLocation('Diluar', { type: 'BOX', isActive: true }, tx);
		return loc.id;
	}

	if (lokasiPenyimpanan.includes(' - ')) {
		const [locName, lvlName] = lokasiPenyimpanan.split(' - ');
		const rack = await getOrCreateLocation(locName, { type: 'RACK', isActive: true }, tx);
		let level = await db(tx).location.findFirst({
			where: { parentId: rack.id, name: lvlName },
		});
		if (!level) {
			level = await getOrCreateLocation(
				lvlName,
				{ parentId: rack.id, type: 'BOX', capacity: 50, isActive: true },
				tx
			);
		}
		return level.id;
	}

	const loc = await getOrCreateLocation(
		lokasiPenyimpanan,
		{ type: 'BOX', isActive: true, capacity: 50 },
		tx
	);
	return loc.id;
}

/**
 * Kapasitas ditagihkan kecuali lokasi tujuan adalah pintu keluar logistik
 * ("Keluar"/"Diluar") yang tidak dibatasi kapasitas. Dipakai endpoint item
 * legacy agar enforcement identik dengan intake (ADR-0002).
 */
export async function assertCapacityAvailableUnlessExit(tx, locationId, incomingCount = 1) {
	if (!locationId) return;
	const loc = await tx.location.findUnique({
		where: { id: locationId },
		select: { name: true },
	});
	if (loc && (loc.name === 'Keluar' || loc.name === 'Diluar')) return;
	await assertCapacityAvailable(tx, locationId, incomingCount);
}

/**
 * Tagihkan kapasitas fisik lokasi dengan pessimistic row lock — pola identik
 * jalur penyelesaian Request. Kapasitas 0/null berarti tidak dibatasi
 * (mis. lokasi "Diluar"/"Keluar").
 */
export async function assertCapacityAvailable(tx, locationId, incomingCount = 1) {
	if (!locationId) return;

	const rows = await tx.$queryRaw`SELECT capacity FROM Location WHERE id = ${locationId} FOR UPDATE`;
	if (!rows || rows.length === 0) {
		throw Object.assign(new Error('Lokasi tujuan tidak valid'), { statusCode: 400 });
	}

	const capacity = rows[0].capacity;
	if (!capacity || capacity <= 0) return;

	const currentItemsCount = await tx.item.count({ where: { locationId } });
	if (currentItemsCount + incomingCount > capacity) {
		throw Object.assign(new Error('Kapasitas lokasi tidak mencukupi'), {
			statusCode: 409,
			code: 'CAPACITY_FULL',
			detail: { locationId },
		});
	}
}
