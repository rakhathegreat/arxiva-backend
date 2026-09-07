import prisma from '../shared/prisma.js';
import { assertCapacityAvailable } from '../modules/storage/service.js';
import { createSheetForLevel, updateSheetName, deleteSheet, writeItemsToSheet } from '../services/sheet.service.js';

const getBrandRuleId = async (brandName) => {
    if (!brandName || brandName === "Campuran") return null;
    const brand = await prisma.brand.findUnique({ where: { nama: brandName } });
    return brand ? brand.id : null;
};

const findLocationByParentAndName = async (name, parentId = null) => {
    return prisma.location.findFirst({
        where: {
            name,
            parentId: parentId ?? null
        }
    });
};

const assertLocationNameAvailable = async (name, parentId = null, excludeId = null) => {
    const existing = await findLocationByParentAndName(name, parentId);
    if (existing && existing.id !== excludeId) {
        const scope = parentId ? 'level/shelf' : 'lokasi';
        throw Object.assign(new Error(`Nama ${scope} "${name}" sudah digunakan`), { statusCode: 400 });
    }
};


/** Buatkan spreadsheet lokasi, simpan link-nya, lalu isi item lokasi (best-effort; gagal → tetap tanpa QR). */
const attachSheetToLocation = async (locationId, displayName) => {
    const { sheetId, sheetUrl } = await createSheetForLevel(displayName);
    if (!sheetUrl) return;
    try {
        await prisma.location.update({ where: { id: locationId }, data: { sheetId, sheetUrl } });
    } catch (error) {
        console.error('Error attaching sheet to location:', error.message);
    }
    // Isi item yang sudah ada di lokasi ke dalam spreadsheet-nya (best-effort).
    try {
        const items = await prisma.item.findMany({
            where: { locationId },
            include: { model: { include: { materialCategory: true, brand: true } } },
        });
        await writeItemsToSheet(sheetId, items);
    } catch (error) {
        console.error('Error writing initial items to sheet:', error.message);
    }
};
// GET /locations
export const getLocations = async (req, res) => {
    try {
        const query = req.query || {};
        const search = query.search ? String(query.search).trim() : "";
        const limit = query.limit !== undefined ? parseInt(query.limit, 10) : null;
        const baseWhere = {
            name: {
                notIn: ["Keluar", "Diluar", "Digunakan", "Terdistribusi", "Rusak", "Hilang"]
            },
            type: {
                notIn: ["PARTNER", "BRANCH"]
            },
            parentId: null
        };
        const where = search
            ? {
                ...baseWhere,
                AND: [{
                    OR: [
                        { name: { contains: search } },
                        { children: { some: { name: { contains: search } } } }
                    ]
                }]
            }
            : baseWhere;

        const locations = await prisma.location.findMany({
            where,
            include: {
                children: {
                    include: {
                        brandRules: { include: { brand: true } },
                        items: true
                    }
                },
                brandRules: { include: { brand: true } },
                items: true
            },
            ...(limit && Number.isFinite(limit) && limit > 0 ? { take: limit } : {}),
        });

        const formattedLocations = locations.map(loc => {
            const isRak = loc.type === 'RACK';
            if (isRak) {
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Rak",
                    owner: "KP Tasikmalaya",
                    isActive: loc.isActive,
                    levels: loc.children.map(lvl => ({
                        id: lvl.id,
                        name: lvl.name,
                        capacity: lvl.capacity,
                        usedCapacity: lvl.items ? lvl.items.length : 0,
                        brandRule: lvl.brandRules && lvl.brandRules.length > 0 ? lvl.brandRules[0].brand.nama : "Campuran",
                        isActive: lvl.isActive,
                        sheetUrl: lvl.sheetUrl
                    }))
                };
            } else if (loc.type === "PALLET") {
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Pallet",
                    owner: "KP Tasikmalaya",
                    isActive: loc.isActive,
                    capacity: loc.capacity,
                    usedCapacity: loc.items ? loc.items.length : 0,
                    brandRule: loc.brandRules && loc.brandRules.length > 0 ? loc.brandRules[0].brand.nama : "Campuran",
                    sheetUrl: loc.sheetUrl
                };
            } else {
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Kardus",
                    owner: "KP Tasikmalaya",
                    isActive: loc.isActive,
                    capacity: loc.capacity,
                    usedCapacity: loc.items ? loc.items.length : 0,
                    brandRule: loc.brandRules && loc.brandRules.length > 0 ? loc.brandRules[0].brand.nama : "Campuran",
                    sheetUrl: loc.sheetUrl
                };
            }
        });

        res.json(formattedLocations);
    } catch (error) {
        console.error('Error in getLocations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /locations
export const createLocation = async (req, res) => {
    try {
        const { name, type, capacity, brandRule, levels, parentId } = req.body;

        if (!name || !type) {
            return res.status(400).json({ message: 'Name and type are required' });
        }

        const parsedParentId = parentId ? parseInt(parentId) : null;

        try {
            await assertLocationNameAvailable(name, parsedParentId);
        } catch (error) {
            return res.status(error.statusCode || 400).json({ message: error.message });
        }

        const brandRuleId = await getBrandRuleId(brandRule);

        if (type === "Pallet" || type === "PALLET") {
            const newLocation = await prisma.location.create({
                data: {
                    name,
                    type: "PALLET",
                    isActive: true,
                    capacity: capacity || 0,
                    parentId: parsedParentId,
                    brandRules: brandRuleId ? {
                        create: { brandId: brandRuleId }
                    } : undefined
                }
            });
            await attachSheetToLocation(newLocation.id, name);
            return res.status(201).json({ message: 'Location created successfully', location: newLocation });
        } else if (type === "Rak" || type === "RACK") {
            const levelNames = (levels || []).map((l) => l.name);
            const duplicateLevel = levelNames.find((n, i) => levelNames.indexOf(n) !== i);
            if (duplicateLevel) {
                return res.status(400).json({ message: `Nama shelf "${duplicateLevel}" duplikat di rak ini` });
            }

            const newLocation = await prisma.location.create({
                data: {
                    name,
                    type: "RACK",
                    isActive: true,
                    children: {
                        create: await Promise.all((levels || []).map(async (l) => {
                            const bId = await getBrandRuleId(l.brandRule);
                            return {
                                name: l.name,
                                type: "BOX",
                                capacity: l.capacity || 0,
                                isActive: true,
                                brandRules: bId ? { create: { brandId: bId } } : undefined
                            };
                        }))
                    }
                },
                include: { children: true }
            });
            for (const child of newLocation.children) {
                await attachSheetToLocation(child.id, `${name} - ${child.name}`);
            }
            return res.status(201).json({ message: 'Location created successfully', location: newLocation });
        } else {
            const newLocation = await prisma.location.create({
                data: {
                    name,
                    type: "BOX",
                    isActive: true,
                    capacity: capacity || 0,
                    parentId: parsedParentId,
                    brandRules: brandRuleId ? {
                        create: { brandId: brandRuleId }
                    } : undefined
                }
            });
            await attachSheetToLocation(newLocation.id, name);
            return res.status(201).json({ message: 'Location created successfully', location: newLocation });
        }
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Nama lokasi sudah terdaftar' });
        }
        console.error('Error in createLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateLocation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, capacity, brandRule } = req.body;

        const existing = await prisma.location.findUnique({
            where: { id },
            select: { id: true, name: true, parentId: true, capacity: true, sheetId: true },
        });
        if (!existing) {
            return res.status(404).json({ message: 'Location not found' });
        }

        // Nama opsional — bila dikirim & berubah, validasi unik dalam parent yang sama.
        let newName = existing.name;
        if (name !== undefined && String(name).trim() !== "") {
            newName = String(name).trim();
            if (newName !== existing.name) {
                try {
                    await assertLocationNameAvailable(newName, existing.parentId, id);
                } catch (error) {
                    return res.status(error.statusCode || 400).json({ message: error.message });
                }
            }
        }

        const brandRuleId = await getBrandRuleId(brandRule);

        // Update location basic fields
        await prisma.location.update({
            where: { id },
            data: {
                ...(newName !== existing.name ? { name: newName } : {}),
                capacity: capacity || existing.capacity,
            }
        });

        // Sinkronkan nama spreadsheet Drive bila lokasi punya sheet (best-effort).
        if (existing.sheetId && newName !== existing.name) {
            try {
                const { updateSheetName } = await import('../services/sheet.service.js');
                await updateSheetName(existing.sheetId, newName);
            } catch (err) {
                console.warn('Sheet rename skipped:', err.message);
            }
        }

        // Update brand rule if provided
        if (brandRuleId) {
            await prisma.brandLocationRule.deleteMany({ where: { locationId: id } });
            await prisma.brandLocationRule.create({
                data: { locationId: id, brandId: brandRuleId }
            });
        } else if (brandRule === "Campuran") {
            await prisma.brandLocationRule.deleteMany({ where: { locationId: id } });
        }

        res.json({ message: 'Location updated successfully' });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(400).json({ message: 'Nama lokasi sudah terdaftar' });
        }
        console.error('Error in updateLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const toggleLocation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { isActive } = req.body;

        if (isActive === undefined) {
            return res.status(400).json({ message: 'isActive flag is required' });
        }

        const updated = await prisma.location.update({
            where: { id },
            data: { isActive }
        });

        res.json({ message: 'Location status updated successfully', location: updated });
    } catch (error) {
        console.error('Error in toggleLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteLocation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        const existing = await prisma.location.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ message: 'Location not found' });
        }

        let totalItems = await prisma.item.count({ where: { locationId: id } });
        if (existing.type === 'RACK') {
            const children = await prisma.location.findMany({
                where: { parentId: id },
                select: { id: true },
            });
            if (children.length > 0) {
                totalItems += await prisma.item.count({
                    where: { locationId: { in: children.map(c => c.id) } },
                });
            }
        }
        if (totalItems > 0) {
            return res.status(409).json({
                message: `Masih ada ${totalItems} barang di lokasi ini. Pindahkan atau hapus barang terlebih dahulu.`,
            });
        }

        if (existing.sheetId) {
            await deleteSheet(existing.sheetId);
        }

        await prisma.location.delete({ where: { id } });

        res.json({ message: 'Location deleted successfully' });
    } catch (error) {
        console.error('Error in deleteLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /locations/:id/migrate-items — pindahkan seluruh item ke lokasi tujuan.
// Satu transaksi + row lock kapasitas target: bila kurang, migrasi ditolak total.
export const migrateLocationItems = async (req, res) => {
    try {
        const sourceId = parseInt(req.params.id);
        const targetId = parseInt(req.body?.targetLocationId);

        if (Number.isNaN(sourceId)) {
            return res.status(400).json({ message: 'ID lokasi sumber tidak valid' });
        }
        if (!req.body?.targetLocationId || Number.isNaN(targetId)) {
            return res.status(400).json({ message: 'targetLocationId wajib diisi' });
        }
        if (sourceId === targetId) {
            return res.status(400).json({ message: 'Lokasi sumber dan tujuan tidak boleh sama' });
        }

        const [source, target] = await Promise.all([
            prisma.location.findUnique({
                where: { id: sourceId },
                select: {
                    id: true, name: true, type: true,
                    _count: { select: { items: true, children: true } },
                },
            }),
            prisma.location.findUnique({
                where: { id: targetId },
                select: { id: true, name: true, type: true, isActive: true },
            }),
        ]);

        if (!source || !target) {
            return res.status(404).json({ message: 'Lokasi tidak ditemukan' });
        }
        if (source.type === 'PARTNER' || target.type === 'PARTNER') {
            return res.status(400).json({ message: 'Migrasi tidak berlaku untuk lokasi partner' });
        }
        if (target.name === 'Keluar' || target.name === 'Diluar') {
            return res.status(400).json({ message: 'Tujuan tidak boleh pintu keluar logistik' });
        }
        if (!target.isActive) {
            return res.status(400).json({ message: 'Lokasi tujuan sedang nonaktif' });
        }
        if (source._count.children > 0) {
            return res.status(400).json({ message: 'Migrasi hanya untuk level/lokasi tanpa sub-lokasi' });
        }
        if (source._count.items === 0) {
            return res.status(400).json({ message: 'Lokasi sumber kosong — tidak ada item untuk dipindahkan' });
        }

        const moved = await prisma.$transaction(async (tx) => {
            await assertCapacityAvailable(tx, targetId, source._count.items);
            const result = await tx.item.updateMany({
                where: { locationId: sourceId },
                data: { locationId: targetId },
            });
            return result.count;
        });

        res.json({
            message: `${moved} item dipindahkan ke ${target.name}`,
            moved,
            targetName: target.name,
        });
    } catch (error) {
        if (error?.statusCode === 409 || error?.code === 'CAPACITY_FULL') {
            return res.status(409).json({ message: error.message });
        }
        console.error('Error in migrateLocationItems:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
