import prisma from '../utils/prisma.js';
import { createSheetForLevel, syncLevelSheet } from '../services/sheet.service.js';

async function getLevelId(lokasiPenyimpanan) {
    if (!lokasiPenyimpanan || lokasiPenyimpanan === "Diluar") {
        let loc = await prisma.location.findUnique({ where: { name: "Diluar" } });
        if (!loc) {
            // Also check for legacy "Keluar" location name
            loc = await prisma.location.findUnique({ where: { name: "Keluar" } });
        }
        if (!loc) {
            const { sheetId, sheetUrl } = await createSheetForLevel("Diluar");
            loc = await prisma.location.create({
                data: {
                    name: "Diluar",
                    type: "KARDUS",
                    isActive: true,
                    levels: {
                        create: { name: "Diluar Level", capacity: 9999, isActive: true, sheetId, sheetUrl }
                    }
                },
                include: { levels: true }
            });
        }
        const lvl = await prisma.level.findFirst({ where: { locationId: loc.id } });
        return lvl.id;
    }

    if (lokasiPenyimpanan.includes(" - ")) {
        const [locName, lvlName] = lokasiPenyimpanan.split(" - ");
        let loc = await prisma.location.findUnique({ where: { name: locName } });
        if (!loc) {
            const { sheetId, sheetUrl } = await createSheetForLevel(`${locName} - ${lvlName}`);
            loc = await prisma.location.create({
                data: {
                    name: locName,
                    type: "RAK",
                    isActive: true,
                    levels: {
                        create: { name: lvlName, capacity: 50, isActive: true, sheetId, sheetUrl }
                    }
                },
                include: { levels: true }
            });
        }
        let lvl = await prisma.level.findFirst({ where: { locationId: loc.id, name: lvlName } });
        if (!lvl) {
            const { sheetId, sheetUrl } = await createSheetForLevel(`${locName} - ${lvlName}`);
            lvl = await prisma.level.create({ data: { name: lvlName, locationId: loc.id, capacity: 50, isActive: true, sheetId, sheetUrl } });
        }
        return lvl.id;
    }

    let loc = await prisma.location.findUnique({ where: { name: lokasiPenyimpanan } });
    if (!loc) {
        const { sheetId, sheetUrl } = await createSheetForLevel(lokasiPenyimpanan);
        loc = await prisma.location.create({
            data: {
                name: lokasiPenyimpanan,
                type: "KARDUS",
                isActive: true,
                levels: {
                    create: { name: "Kardus Level", capacity: 50, isActive: true, sheetId, sheetUrl }
                }
            },
            include: { levels: true }
        });
    }
    const lvl = await prisma.level.findFirst({ where: { locationId: loc.id } });
    return lvl.id;
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

// GET /items
export const getItems = async (req, res) => {
    try {
        const items = await prisma.item.findMany({
            include: {
                category: true,
                brand: true,
                level: {
                    include: { location: true }
                },
                createdBy: {
                    include: { profile: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const formattedItems = items.map(item => {
            let statusUnit = "Tersedia";
            if (item.status === "digunakan") statusUnit = "Diluar";
            if (item.status === "rusak") statusUnit = "Rusak";
            if (item.status === "hilang") statusUnit = "Hilang";

            let lokasiPenyimpanan = "Kardus";
            if (item.level && item.level.location) {
                if (item.level.location.name === "Keluar" || item.level.location.name === "Diluar") {
                    lokasiPenyimpanan = "Diluar";
                } else if (item.level.location.type === "RAK") {
                    lokasiPenyimpanan = `${item.level.location.name} - ${item.level.name}`;
                } else {
                    lokasiPenyimpanan = item.level.location.name;
                }
            }

            return {
                id: item.id,
                serialNumber: item.serialNumber,
                kategori: item.category ? item.category.nama : "-",
                merek: item.brand ? item.brand.nama : "-",
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

// GET /items/:id
export const getItemById = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await prisma.item.findUnique({
            where: { id },
            include: { category: true, brand: true, level: { include: { location: true } }, createdBy: { include: { profile: true } } }
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

// POST /items
export const createItem = async (req, res) => {
    try {
        const { id, serialNumber, kategori, merek, status, lokasiPenyimpanan, tanggalMasuk, tanggalKeluar, mitra } = req.body;

        if (!serialNumber || !kategori || !merek) {
            return res.status(400).json({ message: 'Serial number, kategori, dan merek wajib diisi' });
        }

        const existing = await prisma.item.findUnique({ where: { serialNumber } });
        if (existing) {
            return res.status(400).json({ message: 'Serial number sudah terdaftar di sistem' });
        }

        let category = await prisma.category.findFirst({ where: { nama: kategori } });
        if (!category) {
            category = await prisma.category.create({ data: { nama: kategori, deskripsi: "-", safetyStock: 5 } });
        }

        let brand = await prisma.brand.findFirst({ where: { nama: merek } });
        if (!brand) {
            brand = await prisma.brand.create({
                data: {
                    nama: merek,
                    origin: "Global",
                    identifier: merek.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 1000),
                    categoryId: category.id
                }
            });
        }

        const levelId = await getLevelId(lokasiPenyimpanan);
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
                categoryId: category.id,
                brandId: brand.id,
                status: prismaStatus,
                levelId,
                entryDate,
                exitDate,
                createdById
            },
            include: { category: true, brand: true, level: { include: { location: true } } }
        });

        await syncLevelSheet(newItem.levelId);

        res.status(201).json({ message: 'Item created successfully', item: newItem });
    } catch (error) {
        console.error('Error in createItem:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /items/:id
export const updateItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { serialNumber, kategori, merek, status, lokasiPenyimpanan, tanggalMasuk, tanggalKeluar, mitra } = req.body;

        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        if (serialNumber && serialNumber !== item.serialNumber) {
            const existing = await prisma.item.findUnique({ where: { serialNumber } });
            if (existing) {
                return res.status(400).json({ message: 'Serial number sudah terdaftar di sistem' });
            }
        }

        let categoryId = item.categoryId;
        if (kategori) {
            let category = await prisma.category.findFirst({ where: { nama: kategori } });
            if (!category) {
                category = await prisma.category.create({ data: { nama: kategori, deskripsi: "-", safetyStock: 5 } });
            }
            categoryId = category.id;
        }

        let brandId = item.brandId;
        if (merek) {
            let brand = await prisma.brand.findFirst({ where: { nama: merek } });
            if (!brand) {
                brand = await prisma.brand.create({
                    data: {
                        nama: merek,
                        origin: "Global",
                        identifier: merek.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 1000),
                        categoryId
                    }
                });
            }
            brandId = brand.id;
        }

        const oldLevelId = item.levelId;
        const levelId = lokasiPenyimpanan ? await getLevelId(lokasiPenyimpanan) : item.levelId;
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
                categoryId,
                brandId,
                status: prismaStatus,
                levelId,
                entryDate,
                exitDate,
                createdById
            },
            include: { category: true, brand: true, level: { include: { location: true } } }
        });

        if (oldLevelId !== updatedItem.levelId) {
            await syncLevelSheet(oldLevelId);
        }
        await syncLevelSheet(updatedItem.levelId);

        res.json({ message: 'Item updated successfully', item: updatedItem });
    } catch (error) {
        console.error('Error in updateItem:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /items/:id
export const deleteItem = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        await prisma.item.delete({ where: { id } });
        await syncLevelSheet(item.levelId);

        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        console.error('Error in deleteItem:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
