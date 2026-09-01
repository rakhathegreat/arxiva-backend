import prisma from '../shared/prisma.js';
import { logMutation } from '../shared/utils/mutation.util.js';
import { formatLocationDisplay } from '../shared/utils/location.util.js';
import { getOrCreateCategory, getOrCreateBrand, getOrCreateMaterialModel } from '../modules/catalog/service.js';
import { resolveLocationId, assertCapacityAvailableUnlessExit } from '../modules/storage/service.js';
import { resolveActorId } from '../modules/identity/service.js';
import { statusToEnum, enumToDisplay } from '../modules/items/service.js';

export const getItems = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 0;
        const search = req.query.search ? req.query.search.trim() : "";
        const statusFilter = req.query.status;
        const categoryFilter = req.query.kategori;
        const brandFilter = req.query.merek;
        const locationFilter = req.query.lokasi;

        const where = {};

        // RBAC Filter
        if (req.user && req.user.role === 'MITRA') {
            const userDisplayName = req.user.profile?.nama || req.user.username;
            where.OR = [
                { createdById: req.user.id },
                {
                    location: {
                        OR: [
                            { name: { contains: userDisplayName } },
                            { parent: { name: { contains: userDisplayName } } }
                        ]
                    }
                }
            ];
        }

        // Status Filter
        if (statusFilter && statusFilter !== 'all') {
            where.status = statusToEnum(statusFilter);
        }

        // Category Filter
        if (categoryFilter && categoryFilter !== 'all') {
            where.model = {
                ...where.model,
                materialCategory: {
                    nama: categoryFilter
                }
            };
        }

        // Brand Filter
        if (brandFilter && brandFilter !== 'all') {
            where.model = {
                ...where.model,
                brand: {
                    nama: brandFilter
                }
            };
        }

        // Location / Shelf Filter
        if (locationFilter && locationFilter !== 'all') {
            if (locationFilter.includes(' - ')) {
                const [parentName, childName] = locationFilter.split(' - ').map(s => s.trim());
                where.location = {
                    name: childName,
                    parent: { name: parentName }
                };
            } else {
                where.location = { name: locationFilter };
            }
        }

        // Search Keyword
        if (search) {
            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        { serialNumber: { contains: search } },
                        { model: { nama: { contains: search } } },
                        { model: { brand: { nama: { contains: search } } } },
                        { model: { materialCategory: { nama: { contains: search } } } },
                        { location: { name: { contains: search } } },
                        { location: { parent: { name: { contains: search } } } }
                    ]
                }
            ];
        }

        const totalItems = await prisma.item.count({ where });

        const queryOptions = {
            where,
            include: {
                model: {
                    include: {
                        materialCategory: true,
                        brand: true
                    }
                },
                location: { include: { parent: true } },
                createdBy: { include: { profile: true } }
            },
            orderBy: { createdAt: 'desc' }
        };

        if (limit > 0) {
            queryOptions.skip = (page - 1) * limit;
            queryOptions.take = limit;
        }

        const items = await prisma.item.findMany(queryOptions);

        // Agregasi rekon per item (1 record per item per hari).
        // Ambil record dengan `date` terbesar per item yang ada di halaman ini.
        const pageIds = items.map(i => i.id);
        const reconRows = pageIds.length
            ? await prisma.reconRecord.findMany({
                where: { itemId: { in: pageIds } },
                orderBy: { date: 'desc' },
            })
            : [];
        const reconByItem = new Map();
        for (const r of reconRows) {
            if (!reconByItem.has(r.itemId)) reconByItem.set(r.itemId, r);
        }

        const formattedItems = items.map(item => {
            const statusUnit = enumToDisplay(item.status, item.paNumber);

            let lokasiPenyimpanan = "Kardus";
            if (item.location) {
                if (item.location.type === "PARTNER" || item.location.name === "Keluar" || item.location.name === "Diluar") {
                    lokasiPenyimpanan = "Mitra";
                } else if (item.location.parent) {
                    lokasiPenyimpanan = `${item.location.parent.name} - ${item.location.name}`;
                } else {
                    lokasiPenyimpanan = item.location.name;
                }
            }

            const isDistributed = item.status === "digunakan";
            const recon = reconByItem.get(item.id);

            return {
                id: item.id,
                serialNumber: item.serialNumber,
                kategori: item.model?.materialCategory?.nama || "-",
                merek: item.model?.brand?.nama || "-",
                tipe: item.model?.nama || "-",
                model: item.model,
                status: statusUnit,
                kondisi: item.kondisi || "Baru",
                paNumber: item.paNumber || null,
                ticket: item.ticket || null,
                lokasiPenyimpanan,
                tanggalMasuk: item.entryDate ? item.entryDate.toISOString().slice(0, 10) : item.createdAt.toISOString().slice(0, 10),
                tanggalKeluar: item.exitDate ? item.exitDate.toISOString().slice(0, 10) : "",
                mitra: item.createdBy?.role === 'ADMIN' ? "KP Tasikmalaya" : (item.createdBy?.profile?.nama || item.createdBy?.username || "KP Tasikmalaya"),
                lastReconDate: isDistributed ? (recon?.date || "") : "",
                lastPhotoUrl: isDistributed ? (recon?.imageUrl || null) : null
            };
        });

        if (req.query.page || req.query.limit) {
            return res.json({
                data: formattedItems,
                pagination: {
                    page,
                    limit: limit || totalItems,
                    totalItems,
                    totalPages: limit > 0 ? Math.ceil(totalItems / limit) : 1
                }
            });
        }

        res.json(formattedItems);
    } catch (error) {
        console.error('Error in getItems:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getItemById = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await prisma.item.findUnique({
            where: { id },
            include: {
                model: {
                    include: {
                        materialCategory: true,
                        brand: true
                    }
                },
                location: { include: { parent: true } },
                createdBy: { include: { profile: true } }
            }
        });

        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        res.json(item);
    } catch (error) {
        console.error('Error in getItemById:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getItemHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        const mutations = await prisma.itemMutation.findMany({
            where: {
                OR: [
                    { itemId: id },
                    { serialNumber: item.serialNumber }
                ]
            },
            include: {
                user: { include: { profile: true } },
                originLocation: { include: { parent: true } },
                destinationLocation: { include: { parent: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const formatted = mutations.map(t => {
            let actualDate = t.createdAt;
            let kategori = "Masuk";
            if (t.type === "KELUAR") {
                kategori = t.user?.role === "MITRA" ? "Digunakan" : "Keluar";
            }
            if (t.type === "RUSAK") kategori = "Rusak";
            if (t.type === "HILANG") kategori = "Hilang";

            const mutationNo = t.mutationNumber || t.paNumber || "-";
            const asalLoc = formatLocationDisplay(t.originLocation, t.originLocationName) || "Inbound";
            const tujuanLoc = formatLocationDisplay(t.destinationLocation, t.destinationLocationName) || "Gudang Utama";
            const noteStr = `Status barang diubah menjadi ${kategori}`;

            return {
                id: t.id,
                tanggal: actualDate.toISOString().slice(0, 10),
                nomor: mutationNo,
                nomorSurat: mutationNo,
                kategori,
                tipe: kategori,
                status: "Selesai",
                sn: t.serialNumber,
                merek: t.brand,
                asal: asalLoc,
                tujuan: tujuanLoc,
                lokasi: tujuanLoc,
                dariStatus: asalLoc,
                keStatus: kategori,
                mitra: t.user?.role === 'ADMIN' ? "KP Tasikmalaya" : (t.user?.profile?.nama || t.user?.username || "KP Tasikmalaya"),
                keterangan: noteStr,
                catatan: noteStr,
                createdAt: actualDate.toISOString()
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Error in getItemHistory:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createItem = async (req, res) => {
    try {
        const { id, serialNumber, kategori, merek, tipe, status, kondisi, lokasiPenyimpanan, tanggalMasuk, tanggalKeluar, mitra, paNumber, ticket } = req.body;

        if (!serialNumber || !kategori || !merek) {
            return res.status(400).json({ message: 'Serial number, kategori, dan merek wajib diisi' });
        }

        const existing = await prisma.item.findUnique({ where: { serialNumber } });
        if (existing) {
            return res.status(400).json({ message: 'Serial number sudah terdaftar di sistem' });
        }

        const category = await getOrCreateCategory(kategori);
        const brand = await getOrCreateBrand(merek);
        const modelName = tipe || "Default";
        const model = await getOrCreateMaterialModel(modelName, category.id, brand.id);
        const locationId = await resolveLocationId(lokasiPenyimpanan);
        const createdById = await resolveActorId(mitra, req.user);

        const prismaStatus = statusToEnum(status);

        const entryDate = tanggalMasuk ? new Date(tanggalMasuk) : new Date();
        const exitDate = tanggalKeluar ? new Date(tanggalKeluar) : null;

        const itemId = id || crypto.randomUUID();

        // Adapter tipis (ADR-0002): enforcement + ledger identik dengan intake —
        // kapasitas ditagih, setiap pembuatan item menulis baris mutasi tunggal.
        let newItem;
        try {
            newItem = await prisma.$transaction(async (tx) => {
                await assertCapacityAvailableUnlessExit(tx, locationId);

                const created = await tx.item.create({
                    data: {
                        id: itemId,
                        serialNumber,
                        modelId: model.id,
                        status: prismaStatus,
                        kondisi: kondisi || "Baru",
                        paNumber: paNumber || null,
                        ticket: ticket || null,
                        locationId,
                        entryDate,
                        exitDate,
                        createdById
                    },
                    include: {
                        model: { include: { materialCategory: true, brand: true } },
                        location: { include: { parent: true } }
                    }
                });

                await logMutation(tx, {
                    type: prismaStatus === 'rusak' ? 'RUSAK' : 'MASUK',
                    itemId: created.id,
                    userId: createdById,
                    originLocationId: null,
                    destinationLocationId: locationId,
                });

                return created;
            });
        } catch (error) {
            if (error.code === 'CAPACITY_FULL') {
                return res.status(409).json({ message: error.message, reason: error.code });
            }
            throw error;
        }

        res.status(201).json({ message: 'Item created successfully', item: newItem });
    } catch (error) {
        console.error('Error in createItem:', error);
        res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Internal server error' });
    }
};

export const updateItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { serialNumber, kategori, merek, tipe, status, kondisi, lokasiPenyimpanan, tanggalMasuk, tanggalKeluar, mitra, paNumber, ticket } = req.body;

        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        let modelId = item.modelId;
        let brandName = merek;
        let categoryName = kategori;
        if (kategori || merek || tipe) {
            const currentModel = await prisma.materialModel.findUnique({
                where: { id: item.modelId },
                include: { materialCategory: true, brand: true }
            });

            categoryName = kategori || currentModel.materialCategory.nama;
            brandName = merek || currentModel.brand.nama;
            let modelName = tipe || currentModel.nama;

            const category = await getOrCreateCategory(categoryName);
            const brand = await getOrCreateBrand(brandName);
            const model = await getOrCreateMaterialModel(modelName, category.id, brand.id);
            modelId = model.id;
        }

        const locationId = lokasiPenyimpanan ? await resolveLocationId(lokasiPenyimpanan) : item.locationId;
        const createdById = mitra ? await resolveActorId(mitra, req.user) : item.createdById;

        let prismaStatus = item.status;
        if (status) {
            prismaStatus = statusToEnum(status, item.status);
        }

        const entryDate = tanggalMasuk ? new Date(tanggalMasuk) : item.entryDate;
        const exitDate = tanggalKeluar !== undefined ? (tanggalKeluar ? new Date(tanggalKeluar) : null) : item.exitDate;

        const isChangingToRusak = item.status !== 'rusak' && prismaStatus === 'rusak';
        const isMovingLocation = locationId !== item.locationId;

        let updatedItem;
        try {
            updatedItem = await prisma.$transaction(async (tx) => {
                // Enforcement identik intake: pindah lokasi ditagih kapasitasnya
                // (kecuali ke pintu keluar logistik).
                if (isMovingLocation) {
                    await assertCapacityAvailableUnlessExit(tx, locationId);
                }

                const updated = await tx.item.update({
                    where: { id },
                    data: {
                        serialNumber: serialNumber || item.serialNumber,
                        modelId,
                        status: prismaStatus,
                        kondisi: kondisi !== undefined ? kondisi : item.kondisi,
                        locationId,
                        entryDate,
                        exitDate,
                        createdById,
                        paNumber: paNumber !== undefined ? paNumber : item.paNumber,
                        ticket: ticket !== undefined ? ticket : item.ticket
                    },
                    include: {
                        model: { include: { materialCategory: true, brand: true } },
                        location: { include: { parent: true } }
                    }
                });

                if (isChangingToRusak) {
                    await logMutation(tx, {
                        type: 'RUSAK',
                        itemId: id,
                        userId: createdById,
                        originLocationId: item.locationId,
                        destinationLocationId: locationId,
                    });
                }

                return updated;
            });
        } catch (error) {
            if (error.code === 'CAPACITY_FULL') {
                return res.status(409).json({ message: error.message, reason: error.code });
            }
            throw error;
        }

        res.json({ message: 'Item updated successfully', item: updatedItem });
    } catch (error) {
        console.error('Error in updateItem:', error);
        res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Internal server error' });
    }
};

export const deleteItem = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }
        await prisma.item.delete({ where: { id } });
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        console.error('Error in deleteItem:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
