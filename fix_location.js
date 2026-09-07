const fs = require('fs');

const locationController = `import prisma from '../utils/prisma.js';
import { createSheetForLevel, updateSheetName, deleteSheet } from '../services/sheet.service.js';

const getBrandRuleId = async (brandName) => {
    if (!brandName || brandName === "Campuran") return null;
    const brand = await prisma.brand.findUnique({ where: { nama: brandName } });
    return brand ? brand.id : null;
};

export const getLocations = async (req, res) => {
    try {
        const locations = await prisma.location.findMany({
            where: { name: { notIn: ["Keluar", "Diluar"] }, parentId: null },
            include: {
                children: { include: { brandRules: { include: { brand: true } }, items: true } },
                brandRules: { include: { brand: true } },
                items: true
            }
        });

        const formattedLocations = locations.map(loc => {
            const isRak = loc.type === 'RACK';
            if (isRak) {
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Rak",
                    isActive: loc.isActive,
                    levels: loc.children.map(lvl => ({
                        id: lvl.id,
                        name: lvl.name,
                        capacity: lvl.capacity,
                        usedCapacity: lvl.items ? lvl.items.length : 0,
                        brandRule: lvl.brandRules && lvl.brandRules.length > 0 ? lvl.brandRules[0].brand.nama : "Campuran",
                        isActive: lvl.isActive,
                        sheetUrl: null
                    }))
                };
            } else {
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Kardus",
                    isActive: loc.isActive,
                    capacity: loc.capacity,
                    usedCapacity: loc.items ? loc.items.length : 0,
                    brandRule: loc.brandRules && loc.brandRules.length > 0 ? loc.brandRules[0].brand.nama : "Campuran",
                    sheetUrl: null
                };
            }
        });

        res.json(formattedLocations);
    } catch (error) {
        console.error('Error in getLocations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createLocation = async (req, res) => {
    res.status(501).json({ message: 'Not implemented for new schema yet' });
};
export const updateLocation = async (req, res) => {
    res.status(501).json({ message: 'Not implemented for new schema yet' });
};
export const createLevel = async (req, res) => {
    res.status(501).json({ message: 'Not implemented for new schema yet' });
};
export const updateLevel = async (req, res) => {
    res.status(501).json({ message: 'Not implemented for new schema yet' });
};
export const toggleLocation = async (req, res) => {
    res.status(501).json({ message: 'Not implemented for new schema yet' });
};
export const toggleLevel = async (req, res) => {
    res.status(501).json({ message: 'Not implemented for new schema yet' });
};
export const deleteLocation = async (req, res) => {
    res.status(501).json({ message: 'Not implemented for new schema yet' });
};
export const deleteLevel = async (req, res) => {
    res.status(501).json({ message: 'Not implemented for new schema yet' });
};
`;

const itemController = `import prisma from '../utils/prisma.js';
import { createSheetForLevel, syncLevelSheet } from '../services/sheet.service.js';

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
                category: true,
                brand: true,
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
                    lokasiPenyimpanan = \`\${item.location.parent.name} - \${item.location.name}\`;
                } else {
                    lokasiPenyimpanan = item.location.name;
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

export const getItemById = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await prisma.item.findUnique({
            where: { id },
            include: { category: true, brand: true, location: { include: { parent: true } }, createdBy: { include: { profile: true } } }
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
                categoryId: category.id,
                brandId: brand.id,
                status: prismaStatus,
                locationId,
                entryDate,
                exitDate,
                createdById
            },
            include: { category: true, brand: true, location: { include: { parent: true } } }
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
        const { serialNumber, kategori, merek, status, lokasiPenyimpanan, tanggalMasuk, tanggalKeluar, mitra } = req.body;

        const item = await prisma.item.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
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
                categoryId,
                brandId,
                status: prismaStatus,
                locationId,
                entryDate,
                exitDate,
                createdById
            },
            include: { category: true, brand: true, location: { include: { parent: true } } }
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
`;

const transactionController = `import prisma from '../utils/prisma.js';

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

export const getTransactions = async (req, res) => {
    try {
        const transactions = await prisma.transaction.findMany({
            include: {
                user: { include: { profile: true } },
                item: true,
                originLocation: true,
                destinationLocation: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const formattedTransactions = transactions.map(t => {
            let actualDate = t.createdAt;

            let kategori = "Masuk";
            if (t.transactionType === "KELUAR") kategori = "Keluar";
            if (t.transactionType === "RUSAK") kategori = "Rusak";
            if (t.transactionType === "HILANG") kategori = "Hilang";

            const tanggalStr = actualDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
            const waktuStr = actualDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

            return {
                id: t.id,
                tanggal: actualDate.toISOString().slice(0, 10),
                tanggalDisplay: tanggalStr,
                waktu: waktuStr,
                createdAt: actualDate.toISOString(),
                nomor: t.transactionNumber || "-",
                kategori,
                status: "Selesai",
                sn: t.serialNumber,
                merek: t.brand,
                asal: t.originLocation?.name || null,
                tujuan: t.destinationLocation?.name || null,
                mitra: t.user?.role === 'ADMIN' ? "KP Tasikmalaya" : (t.user?.profile?.nama || t.user?.username || "KP Tasikmalaya"),
                keterangan: \`Status barang diubah menjadi \${kategori}\`
            };
        });

        res.json(formattedTransactions);
    } catch (error) {
        console.error('Error in getTransactions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getTransactionById = async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await prisma.transaction.findUnique({
            where: { id },
            include: { user: { include: { profile: true } }, item: true }
        });
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
        res.json(transaction);
    } catch (error) {
        console.error('Error in getTransactionById:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createTransaction = async (req, res) => {
    try {
        const { id, tanggal, nomor, kategori, status, sn, merek, asal, tujuan, mitra, keterangan } = req.body;

        if (!sn || !nomor || !kategori) {
            return res.status(400).json({ message: 'SN, nomor, dan kategori wajib diisi' });
        }

        let item = await prisma.item.findUnique({ where: { serialNumber: sn }, include: { brand: true, category: true } });
        if (!item) {
            item = await prisma.item.findFirst({ include: { brand: true, category: true } });
            if (!item) {
                return res.status(404).json({ message: 'Item terkait tidak ditemukan di sistem' });
            }
        }

        const userId = await getUserId(mitra, req.user);

        let transactionType = "MASUK";
        if (kategori === "Keluar") transactionType = "KELUAR";
        if (kategori === "Rusak") transactionType = "RUSAK";
        if (kategori === "Hilang") transactionType = "HILANG";

        let createdAtDate = new Date();
        if (tanggal) {
            if (tanggal.length === 10) {
                if (tanggal !== new Date().toISOString().slice(0, 10)) {
                    const now = new Date();
                    createdAtDate = new Date(\`\${tanggal}T\${now.toISOString().slice(11)}\`);
                }
            } else {
                createdAtDate = new Date(tanggal);
            }
        }
        
        let originLocationId = null;
        if (asal) {
            let loc = await prisma.location.findFirst({ where: { name: asal } });
            if (loc) originLocationId = loc.id;
        }

        let destinationLocationId = null;
        if (tujuan) {
            let loc = await prisma.location.findFirst({ where: { name: tujuan } });
            if (loc) destinationLocationId = loc.id;
        }

        const newTransaction = await prisma.transaction.create({
            data: {
                id: id || undefined,
                transactionType,
                itemId: item.id,
                userId,
                serialNumber: sn,
                brand: merek || item.brand?.nama || "Unknown",
                category: item.category?.nama || "Unknown",
                paNumber: nomor,
                originLocationId,
                destinationLocationId,
                createdAt: createdAtDate
            },
            include: { user: { include: { profile: true } }, item: true }
        });

        res.status(201).json({ message: 'Transaction created successfully', transaction: newTransaction });
    } catch (error) {
        console.error('Error in createTransaction:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await prisma.transaction.findUnique({ where: { id } });
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

        await prisma.transaction.delete({ where: { id } });
        res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
        console.error('Error in deleteTransaction:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
`;

fs.writeFileSync('src/controllers/location.controller.js', locationController);
fs.writeFileSync('src/controllers/item.controller.js', itemController);
fs.writeFileSync('src/controllers/transaction.controller.js', transactionController);
