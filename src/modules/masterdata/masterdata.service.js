import prisma from '../../shared/prisma.js';

const parseId = (raw) => {
	const n = parseInt(raw, 10);
	return Number.isNaN(n) ? null : n;
};

const fail = (res, status, message) => res.status(status).json({ message });

/**
 * Factory CRUD master-data — menggantikan 4 controller kerangka-identik
 * (~610 baris) dengan satu parameterisasi. Kontrak respons dipertahankan
 * persis: pesan, shape JSON, dan status code.
 *
 * cfg:
 *   model            nama model prisma
 *   label            untuk pesan not-found ("Category", "Brand", "Material model")
 *   responseKey      key objek pada respons create/update ("category"|"brand"|"model")
 *   listInclude?     include pada list
 *   getInclude?      include pada getById
 *   updateInclude?   include pada update
 *   totalItemsWhere? (row) => where Item count
 *   create: { requiredMessage?, validate?: async(body)=>{status,message}|null, buildData(body)=>{data}|{error:{status,message}}, include? }
 *   update: { pick?(body), validate?: async(body,id)=>{status,message}|null, buildData(body)=>object }
 */
export function makeMasterDataCrud(cfg) {
	const notFound = `${cfg.label} not found`;

	async function findOrFail(res, id) {
		const parsed = parseId(id);
		if (parsed === null) return null;
		const row = await prisma[cfg.model].findUnique({
			where: { id: parsed },
			...(cfg.getInclude ? { include: cfg.getInclude } : {}),
		});
		if (!row) fail(res, 404, notFound);
		return row;
	}

	return {
		// GET /
		async list(req, res) {
			try {
				const query = req.query || {};
				const search = query.search ? String(query.search).trim() : "";
				const limit = query.limit !== undefined ? parseInt(query.limit, 10) : null;
				let where = search && cfg.searchWhere ? cfg.searchWhere(search) : undefined;
				if (cfg.extendWhere) where = cfg.extendWhere(req, where) ?? where;
				let rows = await prisma[cfg.model].findMany({
					...(where ? { where } : {}),
					...(cfg.listInclude ? { include: cfg.listInclude } : {}),
					...(limit && Number.isFinite(limit) && limit > 0 ? { take: limit } : {}),
				});
				if (cfg.totalItemsWhere) {
					rows = await Promise.all(
						rows.map(async (row) => ({
							...row,
							totalItems: (await prisma.item.count({ where: cfg.totalItemsWhere(row) })) ?? 0,
						}))
					);
				}
				if (cfg.decorateList) rows = await cfg.decorateList(rows);
				res.json(rows);
			} catch (error) {
				console.error(`Error in list ${cfg.model}:`, error);
				res.status(500).json({ message: 'Internal server error' });
			}
		},

		// GET /:id
		async getById(req, res) {
			try {
				const row = await findOrFail(res, req.params.id);
				if (!row) return;
				res.json(row);
			} catch (error) {
				console.error(`Error in getById ${cfg.model}:`, error);
				res.status(500).json({ message: 'Internal server error' });
			}
		},

		// POST /
		async create(req, res) {
			try {
				const built = cfg.create.buildData(req.body);
				if (built.error) return fail(res, built.error.status, built.error.message);

				if (cfg.create.validate) {
					const violation = await cfg.create.validate(req.body);
					if (violation) return fail(res, violation.status, violation.message);
				}

				const created = await prisma[cfg.model].create({
					data: built.data,
					...(cfg.create.include ? { include: cfg.create.include } : {}),
				});

				res.status(201).json({
					message: `${cfg.label} created successfully`,
					[cfg.responseKey]: created,
				});
			} catch (error) {
				console.error(`Error in create ${cfg.model}:`, error);
				res.status(500).json({ message: 'Internal server error' });
			}
		},

		// PUT /:id
		async update(req, res) {
			try {
				const id = parseId(req.params.id);
				if (id === null) return fail(res, 404, notFound);
				const existing = await prisma[cfg.model].findUnique({ where: { id } });
				if (!existing) return fail(res, 404, notFound);

				if (cfg.update.validate) {
					const violation = await cfg.update.validate(req.body, id);
					if (violation) return fail(res, violation.status, violation.message);
				}

				const data = cfg.update.buildData(req.body);
				const updated = await prisma[cfg.model].update({
					where: { id },
					data,
					...(cfg.updateInclude ? { include: cfg.updateInclude } : {}),
				});

				res.json({
					message: `${cfg.label} updated successfully`,
					[cfg.responseKey]: updated,
				});
			} catch (error) {
				console.error(`Error in update ${cfg.model}:`, error);
				res.status(500).json({ message: 'Internal server error' });
			}
		},

		// DELETE /:id
		async remove(req, res) {
			try {
				const id = parseId(req.params.id);
				if (id === null) return fail(res, 404, notFound);
				const existing = await prisma[cfg.model].findUnique({ where: { id } });
				if (!existing) return fail(res, 404, notFound);

				await prisma[cfg.model].delete({ where: { id } });
				res.json({ message: `${cfg.label} deleted successfully` });
			} catch (error) {
				console.error(`Error in remove ${cfg.model}:`, error);
				res.status(500).json({ message: 'Internal server error' });
			}
		},
	};
}
