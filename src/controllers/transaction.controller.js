import prisma from '../utils/prisma.js';

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
        const transactions = await prisma.itemMutation.findMany({
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
            if (t.type === "KELUAR") kategori = "Keluar";
            if (t.type === "RUSAK") kategori = "Rusak";
            if (t.type === "HILANG") kategori = "Hilang";

            const tanggalStr = actualDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
            const waktuStr = actualDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

            return {
                id: t.id,
                tanggal: actualDate.toISOString().slice(0, 10),
                tanggalDisplay: tanggalStr,
                waktu: waktuStr,
                createdAt: actualDate.toISOString(),
                nomor: t.mutationNumber || "-",
                kategori,
                status: "Selesai",
                sn: t.serialNumber,
                merek: t.brand,
                asal: t.originLocation?.name || null,
                tujuan: t.destinationLocation?.name || null,
                mitra: t.user?.role === 'ADMIN' ? "KP Tasikmalaya" : (t.user?.profile?.nama || t.user?.username || "KP Tasikmalaya"),
                keterangan: `Status barang diubah menjadi ${kategori}`
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
        const transaction = await prisma.itemMutation.findUnique({
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

        let item = await prisma.item.findUnique({
            where: { serialNumber: sn },
            include: {
                model: {
                    include: {
                        brand: true,
                        materialCategory: true
                    }
                }
            }
        });
        if (!item) {
            item = await prisma.item.findFirst({
                include: {
                    model: {
                        include: {
                            brand: true,
                            materialCategory: true
                        }
                    }
                }
            });
            if (!item) {
                return res.status(404).json({ message: 'Item terkait tidak ditemukan di sistem' });
            }
        }

        const userId = await getUserId(mitra, req.user);

        let type = "MASUK";
        if (kategori === "Keluar") type = "KELUAR";
        if (kategori === "Rusak") type = "RUSAK";
        if (kategori === "Hilang") type = "HILANG";

        let createdAtDate = new Date();
        if (tanggal) {
            if (tanggal.length === 10) {
                if (tanggal !== new Date().toISOString().slice(0, 10)) {
                    const now = new Date();
                    createdAtDate = new Date(`${tanggal}T${now.toISOString().slice(11)}`);
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

        // Generate mutationNumber
        const date = new Date();
        const yearMonth = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const mutationNumber = `MUT-${yearMonth}-${randomSuffix}`;

        const newTransaction = await prisma.itemMutation.create({
            data: {
                id: id || undefined,
                mutationNumber,
                type,
                itemId: item.id,
                userId,
                serialNumber: sn,
                brand: merek || item.model?.brand?.nama || "Unknown",
                category: item.model?.materialCategory?.nama || "Unknown",
                paNumber: nomor || "",
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
        const transaction = await prisma.itemMutation.findUnique({ where: { id } });
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

        await prisma.itemMutation.delete({ where: { id } });
        res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
        console.error('Error in deleteTransaction:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
