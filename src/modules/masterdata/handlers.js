import prisma from '../../shared/prisma.js';
import { makeMasterDataCrud } from './masterdata.service.js';

const generateModelCode = (nama) =>
	nama.replace(/\s+/g, '-').substring(0, 10).toUpperCase() + '-' + Math.floor(Math.random() * 10000);

// ─── Kategori Material ───────────────────────────────────────────────────────
export const categoryHandlers = makeMasterDataCrud({
	model: 'materialCategory',
	label: 'Category',
	responseKey: 'category',
	searchWhere: (q) => ({ nama: { contains: q } }),
	totalItemsWhere: (row) => ({ model: { materialCategoryId: row.id } }),
	create: {
		buildData(body) {
			const { nama, safetyStock } = body;
			if (!nama) return { error: { status: 400, message: 'Nama is required' } };
			return { data: { nama, safetyStock: safetyStock || 0 } };
		},
	},
	update: {
		buildData(body) {
			const data = {};
			if (body.nama) data.nama = body.nama;
			if (body.safetyStock !== undefined) data.safetyStock = body.safetyStock;
			return data;
		},
	},
});

// ─── Brand / Merek ──────────────────────────────────────────────────────────
async function brandUniqueViolation(body, excludeId = null) {
	const nama = body.nama || body.name;
	if (!nama && !body.identifier) return null;
	const existing = await prisma.brand.findFirst({
		where: {
			...(excludeId ? { id: { not: excludeId } } : {}),
			OR: [...(nama ? [{ nama }] : []), ...(body.identifier ? [{ identifier: body.identifier }] : [])],
		},
	});
	return existing ? { status: 400, message: 'Brand name or identifier already exists' } : null;
}

export const brandHandlers = makeMasterDataCrud({
	model: 'brand',
	label: 'Brand',
	responseKey: 'brand',
	searchWhere: (q) => ({
		OR: [
			{ nama: { contains: q } },
			{ identifier: { contains: q } },
		],
	}),
	listInclude: { models: { include: { materialCategory: true } } },
	getInclude: { models: { include: { materialCategory: true } } },
	totalItemsWhere: (row) => ({ model: { brandId: row.id } }),
	create: {
		buildData(body) {
			const { nama, origin, identifier } = body;
			if (!nama || !origin || !identifier) {
				return { error: { status: 400, message: 'Nama, origin, and identifier are required' } };
			}
			return { data: { nama, origin, identifier } };
		},
		validate: (body) => brandUniqueViolation(body),
	},
	update: {
		validate: (body, id) => brandUniqueViolation(body, id),
		buildData(body) {
			const nama = body.nama || body.name;
			const data = {};
			if (nama) data.nama = nama;
			if (body.origin) data.origin = body.origin;
			if (body.identifier) data.identifier = body.identifier;
			return data;
		},
	},
});

// ─── Model Material ─────────────────────────────────────────────────────────
export const materialModelHandlers = makeMasterDataCrud({
	model: 'materialModel',
	label: 'Material model',
	responseKey: 'model',
	searchWhere: (q) => ({
		OR: [
			{ nama: { contains: q } },
			{ brand: { is: { nama: { contains: q } } } },
			{ materialCategory: { is: { nama: { contains: q } } } },
		],
	}),
	extendWhere: (req, where) => {
		const query = req.query || {};
		const brand = query.brand ? String(query.brand).trim() : "";
		if (!brand) return where;
		const brandClause = {
			brand: { is: { nama: { contains: brand } } },
		};
		return where ? { AND: [where, brandClause] } : brandClause;
	},
	listInclude: {
		materialCategory: true,
		brand: true,
		_count: { select: { items: true } },
	},
	getInclude: { materialCategory: true, brand: true },
	updateInclude: { materialCategory: true, brand: true },
	async decorateList(rows) {
		return rows.map((model) => ({ ...model, totalItems: model._count?.items ?? 0 }));
	},
	create: {
		include: { materialCategory: true, brand: true },
		buildData(body) {
			const { nama, materialCategoryId, brandId, code } = body;
			if (!nama || !materialCategoryId || !brandId) {
				return { error: { status: 400, message: 'Nama, materialCategoryId, and brandId are required' } };
			}
			const data = {
				nama,
				code: code || generateModelCode(nama),
				materialCategoryId: parseInt(materialCategoryId, 10),
				brandId: parseInt(brandId, 10),
			};
			if (body.deskripsi !== undefined) data.deskripsi = body.deskripsi;
			return { data };
		},
		async validate(body) {
			const categoryId = parseInt(body.materialCategoryId, 10);
			if (categoryId && !(await prisma.materialCategory.findUnique({ where: { id: categoryId } }))) {
				return { status: 404, message: 'Category not found' };
			}
			const brandId = parseInt(body.brandId, 10);
			if (brandId && !(await prisma.brand.findUnique({ where: { id: brandId } }))) {
				return { status: 404, message: 'Brand not found' };
			}
			if (body.nama && (await prisma.materialModel.findUnique({ where: { nama: body.nama } }))) {
				return { status: 400, message: 'Material model name already exists' };
			}
			return null;
		},
	},
	update: {
		async validate(body, id) {
			const categoryId = parseInt(body.materialCategoryId, 10);
			if (categoryId && !(await prisma.materialCategory.findUnique({ where: { id: categoryId } }))) {
				return { status: 404, message: 'Category not found' };
			}
			const brandId = parseInt(body.brandId, 10);
			if (brandId && !(await prisma.brand.findUnique({ where: { id: brandId } }))) {
				return { status: 404, message: 'Brand not found' };
			}
			const nama = body.nama || body.name;
			if (
				nama &&
				(await prisma.materialModel.findFirst({ where: { id: { not: id }, nama } }))
			) {
				return { status: 400, message: 'Material model name already exists' };
			}
			return null;
		},
		buildData(body) {
			const nama = body.nama || body.name;
			const data = {};
			if (nama) data.nama = nama;
			if (body.code) data.code = body.code;
			if (body.deskripsi !== undefined) data.deskripsi = body.deskripsi;
			if (body.materialCategoryId) data.materialCategoryId = parseInt(body.materialCategoryId, 10);
			if (body.brandId) data.brandId = parseInt(body.brandId, 10);
			return data;
		},
	},
});
