import prisma from '../utils/prisma.js';

async function safeGetOrCreateLocation(name, createData) {
    let loc = await prisma.location.findUnique({ where: { name } });
    if (!loc) {
        try {
            loc = await prisma.location.create({ data: { name, ...createData } });
        } catch (error) {
            if (error.code === 'P2002') {
                loc = await prisma.location.findUnique({ where: { name } });
            } else {
                throw error;
            }
        }
    }
    return loc;
}

async function safeGetOrCreateBrand(nama) {
    let brand = await prisma.brand.findFirst({ where: { nama } });
    if (!brand) {
        try {
            brand = await prisma.brand.create({
                data: {
                    nama,
                    origin: "Global",
                    identifier: nama.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 1000)
                }
            });
        } catch (error) {
            if (error.code === 'P2002') {
                brand = await prisma.brand.findFirst({ where: { nama } });
            } else {
                throw error;
            }
        }
    }
    return brand;
}

async function safeGetOrCreateMaterialModel(nama, materialCategoryId, brandId) {
    let model = await prisma.materialModel.findFirst({
        where: { nama, materialCategoryId, brandId }
    });
    if (!model) {
        try {
            const generatedCode = nama.replace(/\s+/g, '-').substring(0, 10).toUpperCase() + '-' + Math.floor(Math.random() * 10000);
            model = await prisma.materialModel.create({
                data: { nama, code: generatedCode, materialCategoryId, brandId }
            });
        } catch (error) {
            if (error.code === 'P2002') {
                model = await prisma.materialModel.findFirst({
                    where: { nama }
                });
            } else {
                throw error;
            }
        }
    }
    return model;
}

async function getLocationId(lokasiPenyimpanan) {
    if (!lokasiPenyimpanan || lokasiPenyimpanan === "Diluar") {
        let loc = await prisma.location.findUnique({ where: { name: "Diluar" } });
        if (!loc) {
            loc = await prisma.location.findUnique({ where: { name: "Keluar" } });
        }
        if (!loc) {
            loc = await safeGetOrCreateLocation("Diluar", { type: "BOX", isActive: true });
        }
        return loc.id;
    }

    if (lokasiPenyimpanan.includes(" - ")) {
        const [locName, lvlName] = lokasiPenyimpanan.split(" - ");
        let loc = await safeGetOrCreateLocation(locName, { type: "RACK", isActive: true });
        let child = await prisma.location.findFirst({ where: { parentId: loc.id, name: lvlName } });
        if (!child) {
            child = await safeGetOrCreateLocation(lvlName, { parentId: loc.id, type: "BOX", capacity: 50, isActive: true });
        }
        return child.id;
    }

    let loc = await safeGetOrCreateLocation(lokasiPenyimpanan, { type: "BOX", isActive: true, capacity: 50 });
    return loc.id;
}

async function getUserId(mitra, reqUser) {
    if (reqUser && reqUser.id) return reqUser.id;
    if (mitra && mitra !== "KP Tasikmalaya") {
        const u = await prisma.user.findFirst({
            where: { OR: [{ username: mitra }, { profile: { nama: mitra } }] }
        });
        if (u) return u.id;
    }
    const firstUser = await prisma.user.findFirst({ where: { role: "ADMIN" } }) || await prisma.user.findFirst();
    if (firstUser) return firstUser.id;
    const newUser = await prisma.user.create({
        data: { username: "admin_default", password: "password", role: "ADMIN" }
    });
    return newUser.id;
}

export const getItems = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 0;
        const search = req.query.search ? req.query.search.trim() : "";
        const statusFilter = req.query.status;
        const categoryFilter = req.query.kategori;
        const brandFilter = req.query.merek;

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
            let prismaStatus = "tersedia";
            if (statusFilter === "Terdistribusi" || statusFilter === "Diluar") prismaStatus = "digunakan";
            if (statusFilter === "Rusak") prismaStatus = "rusak";
            if (statusFilter === "Hilang") prismaStatus = "hilang";
            where.status = prismaStatus;
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

        const formattedItems = items.map(item => {
            let statusUnit = "Tersedia";
            if (item.status === "digunakan") statusUnit = "Terdistribusi";
            if (item.status === "rusak") statusUnit = "Rusak";
            if (item.status === "hilang") statusUnit = "Hilang";

            let lokasiPenyimpanan = "Kardus";
            if (item.location) {
                if (item.location.name === "Keluar" || item.location.name === "Diluar") {
                    lokasiPenyimpanan = "Mitra";
                } else if (item.location.parent) {
                    lokasiPenyimpanan = `${item.location.parent.name} - ${item.location.name}`;
                } else {
                    lokasiPenyimpanan = item.location.name;
                }
            }

            return {
                id: item.id,
                serialNumber: item.serialNumber,
                kategori: item.model?.materialCategory?.nama || "-",
                merek: item.model?.brand?.nama || "-",
                tipe: item.model?.nama || "-",
                model: item.model,
                status: statusUnit,
                lokasiPenyimpanan,
                tanggalMasuk: item.entryDate ? item.entryDate.toISOString().slice(0, 10) : item.createdAt.toISOString().slice(0, 10),
                tanggalKeluar: item.exitDate ? item.exitDate.toISOString().slice(0, 10) : "",
                mitra: item.createdBy?.role === 'ADMIN' ? "KP Tasikmalaya" : (item.createdBy?.profile?.nama || item.createdBy?.username || "KP Tasikmalaya")
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
                originLocation: true,
                destinationLocation: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const formatted = mutations.map(t => {
            let actualDate = t.createdAt;
            let kategori = "Masuk";
            if (t.type === "KELUAR") kategori = "Keluar";
            if (t.type === "RUSAK") kategori = "Rusak";
            if (t.type === "HILANG") kategori = "Hilang";

            const mutationNo = t.mutationNumber || t.paNumber || "-";
            const asalLoc = t.originLocation?.name || "Inbound";
            const tujuanLoc = t.destinationLocation?.name || "Gudang Utama";
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
        const { id, serialNumber, kategori, merek, tipe, status, lokasiPenyimpanan, tanggalMasuk, tanggalKeluar, mitra } = req.body;

        if (!serialNumber || !kategori || !merek) {
            return res.status(400).json({ message: 'Serial number, kategori, dan merek wajib diisi' });
        }

        const existing = await prisma.item.findUnique({ where: { serialNumber } });
        if (existing) {
            return res.status(400).json({ message: 'Serial number sudah terdaftar di sistem' });
        }

        let category = await prisma.materialCategory.findFirst({ where: { nama: kategori } });
        if (!category) {
            let defaultType = await prisma.materialType.findFirst({ where: { nama: 'Lainnya' } });
            if (!defaultType) defaultType = await prisma.materialType.create({ data: { nama: 'Lainnya' } });
            category = await prisma.materialCategory.create({ data: { nama: kategori, typeId: defaultType.id, safetyStock: 5 } });
        }

        const brand = await safeGetOrCreateBrand(merek);
        const modelName = tipe || "Default";
        const model = await safeGetOrCreateMaterialModel(modelName, category.id, brand.id);
        const locationId = await getLocationId(lokasiPenyimpanan);
        const createdById = await getUserId(mitra, req.user);

        let prismaStatus = "tersedia";
        if (status === "Diluar") prismaStatus = "digunakan";
        if (status === "Rusak") prismaStatus = "rusak";
        if (status === "Hilang") prismaStatus = "hilang";

        const entryDate = tanggalMasuk ? new Date(tanggalMasuk) : new Date();
        const exitDate = tanggalKeluar ? new Date(tanggalKeluar) : null;

        const itemId = id || crypto.randomUUID();

        let newItem;
        if (status === "Rusak") {
            const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            const mutationNumber = `DMG-${dateCode}-${Math.floor(1000 + Math.random() * 9000)}`;

            const [created] = await prisma.$transaction([
                prisma.item.create({
                    data: {
                        id: itemId,
                        serialNumber,
                        modelId: model.id,
                        status: prismaStatus,
                        locationId,
                        entryDate,
                        exitDate,
                        createdById
                    },
                    include: {
                        model: { include: { materialCategory: true, brand: true } },
                        location: { include: { parent: true } }
                    }
                }),
                prisma.itemMutation.create({
                    data: {
                        mutationNumber,
                        type: "RUSAK",
                        itemId: itemId,
                        userId: createdById,
                        serialNumber,
                        brand: brand.nama,
                        category: category.nama,
                        paNumber: mutationNumber,
                        originLocationId: locationId,
                        destinationLocationId: locationId,
                    }
                })
            ]);
            newItem = created;
        } else {
            newItem = await prisma.item.create({
                data: {
                    id: itemId,
                    serialNumber,
                    modelId: model.id,
                    status: prismaStatus,
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
        }

        res.status(201).json({ message: 'Item created successfully', item: newItem });
    } catch (error) {
        console.error('Error in createItem:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { serialNumber, kategori, merek, tipe, status, lokasiPenyimpanan, tanggalMasuk, tanggalKeluar, mitra } = req.body;

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

            let category = await prisma.materialCategory.findFirst({ where: { nama: categoryName } });
            if (!category) {
                let defaultType = await prisma.materialType.findFirst({ where: { nama: 'Lainnya' } });
                if (!defaultType) defaultType = await prisma.materialType.create({ data: { nama: 'Lainnya' } });
                category = await prisma.materialCategory.create({ data: { nama: categoryName, typeId: defaultType.id, safetyStock: 5 } });
            }

            const brand = await safeGetOrCreateBrand(brandName);
            const model = await safeGetOrCreateMaterialModel(modelName, category.id, brand.id);
            modelId = model.id;
        }

        const locationId = lokasiPenyimpanan ? await getLocationId(lokasiPenyimpanan) : item.locationId;
        const createdById = mitra ? await getUserId(mitra, req.user) : item.createdById;

        let prismaStatus = item.status;
        if (status) {
            if (status === "Tersedia") prismaStatus = "tersedia";
            if (status === "Diluar") prismaStatus = "digunakan";
            if (status === "Rusak") prismaStatus = "rusak";
            if (status === "Hilang") prismaStatus = "hilang";
        }

        const entryDate = tanggalMasuk ? new Date(tanggalMasuk) : item.entryDate;
        const exitDate = tanggalKeluar !== undefined ? (tanggalKeluar ? new Date(tanggalKeluar) : null) : item.exitDate;

        const isChangingToRusak = item.status !== 'rusak' && prismaStatus === 'rusak';

        let updatedItem;
        if (isChangingToRusak) {
            const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            const mutationNumber = `DMG-${dateCode}-${Math.floor(1000 + Math.random() * 9000)}`;

            const [updated] = await prisma.$transaction([
                prisma.item.update({
                    where: { id },
                    data: {
                        serialNumber: serialNumber || item.serialNumber,
                        modelId,
                        status: prismaStatus,
                        locationId,
                        entryDate,
                        exitDate,
                        createdById
                    },
                    include: {
                        model: { include: { materialCategory: true, brand: true } },
                        location: { include: { parent: true } }
                    }
                }),
                prisma.itemMutation.create({
                    data: {
                        mutationNumber,
                        type: "RUSAK",
                        itemId: id,
                        userId: createdById,
                        serialNumber: serialNumber || item.serialNumber,
                        brand: brandName || "Unknown",
                        category: categoryName || "Unknown",
                        paNumber: mutationNumber,
                        originLocationId: item.locationId,
                        destinationLocationId: locationId,
                    }
                })
            ]);
            updatedItem = updated;
        } else {
            updatedItem = await prisma.item.update({
                where: { id },
                data: {
                    serialNumber: serialNumber || item.serialNumber,
                    modelId,
                    status: prismaStatus,
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
        }

        res.json({ message: 'Item updated successfully', item: updatedItem });
    } catch (error) {
        console.error('Error in updateItem:', error);
        res.status(500).json({ message: 'Internal server error' });
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
