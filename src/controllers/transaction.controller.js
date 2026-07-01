import prisma from '../utils/prisma.js';
import { syncLevelSheet } from '../services/sheet.service.js';

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

// GET /transactions
export const getTransactions = async (req, res) => {
    try {
        const transactions = await prisma.transaction.findMany({
            include: {
                user: { include: { profile: true } },
                item: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const formattedTransactions = transactions.map(t => {
            let actualDate = t.createdAt;
            if (t.id && t.id.startsWith("TRX-")) {
                const parts = t.id.split("-");
                // Scan all parts for a valid millisecond timestamp
                // Handles: TRX-1719823456789-123 and TRX-DMG-1719823456789-123
                for (const part of parts) {
                    if (part && !isNaN(part)) {
                        const ts = parseInt(part, 10);
                        if (ts > 1000000000000) {
                            actualDate = new Date(ts);
                            break;
                        }
                    }
                }
            }

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
                nomor: t.paNumber || "-",
                kategori,
                status: "Selesai",
                sn: t.serialNumber,
                merek: t.brand,
                asal: t.origin || null,
                tujuan: t.destination || null,
                mitra: t.user?.role === 'ADMIN' ? "KP Tasikmalaya" : (t.user?.profile?.nama || t.user?.username || "KP Tasikmalaya"),
                keterangan: `Status barang diubah menjadi ${kategori}`
            };
        });

        formattedTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.json(formattedTransactions);
    } catch (error) {
        console.error('Error in getTransactions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /transactions/:id
export const getTransactionById = async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await prisma.transaction.findUnique({
            where: { id },
            include: { user: { include: { profile: true } }, item: true }
        });

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json(transaction);
    } catch (error) {
        console.error('Error in getTransactionById:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /transactions
export const createTransaction = async (req, res) => {
    try {
        const { id, tanggal, nomor, kategori, status, sn, merek, asal, tujuan, mitra, keterangan } = req.body;

        if (!sn || !nomor || !kategori) {
            return res.status(400).json({ message: 'SN, nomor, dan kategori wajib diisi' });
        }

        let item = await prisma.item.findUnique({ where: { serialNumber: sn } });
        if (!item) {
            // Find first item or return error if strict relation needed
            item = await prisma.item.findFirst();
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
                    createdAtDate = new Date(`${tanggal}T${now.toISOString().slice(11)}`);
                }
            } else {
                createdAtDate = new Date(tanggal);
            }
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
                origin: asal || null,
                destination: tujuan || null,
                createdAt: createdAtDate
            },
            include: { user: { include: { profile: true } }, item: true }
        });

        await syncLevelSheet(item.levelId);

        res.status(201).json({ message: 'Transaction created successfully', transaction: newTransaction });
    } catch (error) {
        console.error('Error in createTransaction:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /transactions/:id
export const deleteTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await prisma.transaction.findUnique({ where: { id } });
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        await prisma.transaction.delete({ where: { id } });
        res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
        console.error('Error in deleteTransaction:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
