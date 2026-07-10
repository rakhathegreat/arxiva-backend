import prisma from '../utils/prisma.js';

async function getLocationId(lokasiPenyimpanan) {
    if (!lokasiPenyimpanan || lokasiPenyimpanan === "Diluar") {
        let loc = await prisma.location.findUnique({ where: { name: "Diluar" } });
        if (!loc) {
            loc = await prisma.location.findUnique({ where: { name: "Keluar" } });
        }
        if (!loc) {
            loc = await prisma.location.create({
                data: { name: "Diluar", type: "BOX", isActive: true }
            });
        }
        return loc.id;
    }

    if (lokasiPenyimpanan.includes(" - ")) {
        const [locName, lvlName] = lokasiPenyimpanan.split(" - ");
        let loc = await prisma.location.findUnique({ where: { name: locName } });
        if (!loc) {
            loc = await prisma.location.create({
                data: { name: locName, type: "RACK", isActive: true }
            });
        }
        let child = await prisma.location.findFirst({ where: { parentId: loc.id, name: lvlName } });
        if (!child) {
            child = await prisma.location.create({ data: { name: lvlName, parentId: loc.id, type: "BOX", capacity: 50, isActive: true } });
        }
        return child.id;
    }

    let loc = await prisma.location.findUnique({ where: { name: lokasiPenyimpanan } });
    if (!loc) {
        loc = await prisma.location.create({
            data: { name: lokasiPenyimpanan, type: "BOX", isActive: true, capacity: 50 }
        });
    }
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
        const items = await prisma.item.findMany({
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
        });

        const formattedItems = items.map(item => {
            let statusUnit = "Tersedia";
            if (item.status === "digunakan") statusUnit = "Diluar";
            if (item.status === "rusak") statusUnit = "Rusak";
            if (item.status === "hilang") statusUnit = "Hilang";

            let lokasiPenyimpanan = "Kardus";
            if (item.location) {
                if (item.location.name === "Keluar" || item.location.name === "Diluar") {
                    lokasiPenyimpanan = "Diluar";
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
                status: statusUnit,
                lokasiPenyimpanan,
                tanggalMasuk: item.entryDate ? item.entryDate.toISOString().slice(0, 10) : item.createdAt.toISOString().slice(0, 10),
                tanggalKeluar: item.exitDate ? item.exitDate.toISOString().slice(0, 10) : "",
                mitra: item.createdBy?.role === 'ADMIN' ? "KP Tasikmalaya" : (item.createdBy?.profile?.nama || item.createdBy?.username || "KP Tasikmalaya")
            };
        });

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

        let brand = await prisma.brand.findFirst({ where: { nama: merek } });
        if (!brand) {
            brand = await prisma.brand.create({
                data: {
                    nama: merek,
                    origin: "Global",
                    identifier: merek.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 1000)
                }
            });
        }

        const modelName = tipe || "Default";
        let model = await prisma.materialModel.findFirst({
            where: { nama: modelName, materialCategoryId: category.id, brandId: brand.id }
        });
        if (!model) {
            model = await prisma.materialModel.create({
                data: {
                    nama: modelName,
                    materialCategoryId: category.id,
                    brandId: brand.id
                }
            });
        }

        const locationId = await getLocationId(lokasiPenyimpanan);
        const createdById = await getUserId(mitra, req.user);

        let prismaStatus = "tersedia";
        if (status === "Diluar") prismaStatus = "digunakan";
        if (status === "Rusak") prismaStatus = "rusak";
        if (status === "Hilang") prismaStatus = "hilang";

        const entryDate = tanggalMasuk ? new Date(tanggalMasuk) : new Date();
        const exitDate = tanggalKeluar ? new Date(tanggalKeluar) : null;

        const newItem = await prisma.item.create({
            data: {
                id: id || undefined,
                serialNumber,
                modelId: model.id,
                status: prismaStatus,
                locationId,
                entryDate,
                exitDate,
                createdById
            },
            include: {
                model: {
                    include: {
                        materialCategory: true,
                        brand: true
                    }
                },
                location: { include: { parent: true } }
            }
        });

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
        if (kategori || merek || tipe) {
            const currentModel = await prisma.materialModel.findUnique({
                where: { id: item.modelId },
                include: { materialCategory: true, brand: true }
            });

            let categoryName = kategori || currentModel.materialCategory.nama;
            let brandName = merek || currentModel.brand.nama;
            let modelName = tipe || currentModel.nama;

            let category = await prisma.materialCategory.findFirst({ where: { nama: categoryName } });
            if (!category) {
                let defaultType = await prisma.materialType.findFirst({ where: { nama: 'Lainnya' } });
                if (!defaultType) defaultType = await prisma.materialType.create({ data: { nama: 'Lainnya' } });
                category = await prisma.materialCategory.create({ data: { nama: categoryName, typeId: defaultType.id, safetyStock: 5 } });
            }

            let brand = await prisma.brand.findFirst({ where: { nama: brandName } });
            if (!brand) {
                brand = await prisma.brand.create({
                    data: {
                        nama: brandName,
                        origin: "Global",
                        identifier: brandName.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 1000)
                    }
                });
            }

            let model = await prisma.materialModel.findFirst({
                where: { nama: modelName, materialCategoryId: category.id, brandId: brand.id }
            });
            if (!model) {
                model = await prisma.materialModel.create({
                    data: {
                        nama: modelName,
                        materialCategoryId: category.id,
                        brandId: brand.id
                    }
                });
            }
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

        const updatedItem = await prisma.item.update({
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
                model: {
                    include: {
                        materialCategory: true,
                        brand: true
                    }
                },
                location: { include: { parent: true } }
            }
        });

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
