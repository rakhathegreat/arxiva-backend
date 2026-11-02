import prisma from '../../shared/prisma.js';

const db = (tx) => tx ?? prisma;

/**
 * Get-or-create MaterialCategory berdasarkan nama.
 * Fix: cabang lama men-query `prisma.materialType` + `typeId` yang tidak ada di
 * schema — membuat kategori baru selalu 500. Kategori kini dibuat langsung.
 */
export async function getOrCreateCategory(nama, tx = null) {
	const client = db(tx);
	const existing = await client.materialCategory.findFirst({ where: { nama } });
	if (existing) return existing;
	try {
		return await client.materialCategory.create({ data: { nama, safetyStock: 5 } });
	} catch (error) {
		if (error.code === 'P2002') {
			return client.materialCategory.findFirst({ where: { nama } });
		}
		throw error;
	}
}

/** Get-or-create Brand berdasarkan nama (identifier di-generate bila baru). */
export async function getOrCreateBrand(nama, tx = null) {
	const client = db(tx);
	const existing = await client.brand.findFirst({ where: { nama } });
	if (existing) return existing;
	try {
		return await client.brand.create({
			data: {
				nama,
				origin: 'Global',
				identifier: nama.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 1000),
			},
		});
	} catch (error) {
		if (error.code === 'P2002') {
			return client.brand.findFirst({ where: { nama } });
		}
		throw error;
	}
}

/** Get-or-create MaterialModel pada pasangan (kategori, brand). */
export async function getOrCreateMaterialModel(nama, materialCategoryId, brandId, tx = null) {
	const client = db(tx);
	const existing = await client.materialModel.findFirst({
		where: { nama, materialCategoryId, brandId },
	});
	if (existing) return existing;
	try {
		const generatedCode =
			nama.replace(/\s+/g, '-').substring(0, 10).toUpperCase() +
			'-' +
			Math.floor(Math.random() * 10000);
		return await client.materialModel.create({
			data: { nama, code: generatedCode, materialCategoryId, brandId },
		});
	} catch (error) {
		if (error.code === 'P2002') {
			return client.materialModel.findFirst({ where: { nama } });
		}
		throw error;
	}
}
