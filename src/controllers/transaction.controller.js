import prisma from '../shared/prisma.js';
import { createItemMutationWithRetry } from '../shared/utils/mutation.util.js';
import { formatLocationDisplay } from '../shared/utils/location.util.js';
import { resolveActorId } from '../modules/identity/service.js';
import { notifyAdmins } from '../modules/notification/service.js';

export const getTransactions = async (req, res) => {
    try {
        const transactions = await prisma.itemMutation.findMany({
            include: {
                user: { include: { profile: true } },
                item: true,
                originLocation: { include: { parent: true } },
                destinationLocation: { include: { parent: true } }
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
                asal: formatLocationDisplay(t.originLocation, t.originLocationName),
                tujuan: formatLocationDisplay(t.destinationLocation, t.destinationLocationName),
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
        const { id, tanggal, nomor, kategori, status, sn, merek, asal, tujuan, mitra, keterangan, paNumber, ticket } = req.body;

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
        // Dulu: fallback diam-diam ke "item pertama di DB" — atribusi ledger korup.
        // Kini SN wajib cocok.
        if (!item) {
            return res.status(404).json({ message: `Item dengan serial number ${sn} tidak ditemukan di sistem` });
        }

        let userId;
        try {
            userId = await resolveActorId(mitra, req.user);
        } catch (actorError) {
            return res.status(actorError.statusCode || 400).json({ message: actorError.message });
        }

        let type = "MASUK";
        if (kategori === "Keluar" || kategori === "Digunakan") type = "KELUAR";
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

        // Nomor PA material sesungguhnya diutamakan; `nomor` transaksi menjadi
        // fallback agar Riwayat Mutasi tetap menampilkan nomor yang terkait.
        const paNumberValue = paNumber || nomor || "";

        const newTransaction = await createItemMutationWithRetry(
            prisma,
            {
                id: id || undefined,
                type,
                itemId: item.id,
                userId,
                serialNumber: sn,
                brand: merek || item.model?.brand?.nama || "Unknown",
                category: item.model?.materialCategory?.nama || "Unknown",
                paNumber: paNumberValue,
                ticket: ticket || null,
                originLocationId,
                destinationLocationId,
                originLocationName: asal || null,
                destinationLocationName: tujuan || null,
                createdAt: createdAtDate
            },
            'MUT',
            { include: { user: { include: { profile: true } }, item: true } }
        );

        // Sinkronkan nomor PA ke Item: kehadiran nomor PA pada transaksi pemakaian
        // mitra ("Digunakan") menandakan material sudah dipakai. Tanpa sinkron ini,
        // `GET /items` menampilkan status "Terdistribusi" walau item sudah dipakai
        // ber-PA. Transaksi "Keluar" (distribusi KP → mitra) sengaja TIDAK ikut
        // karena nomornya adalah nomor mutasi, bukan nomor PA.
        if (kategori === "Digunakan" && paNumberValue) {
            await prisma.item.update({
                where: { id: item.id },
                data: { paNumber: paNumberValue },
            });
        }

        // Event: pengajuan barang keluar oleh MITRA → notify semua admin
        // (menggantikan POST client-side yang salah target penerima)
        if (type === 'KELUAR' && req.user?.role === 'MITRA') {
            try {
                const mitraName = req.user.profile?.nama || req.user.username;
                await notifyAdmins({
                    title: `Permintaan barang mitra ${mitraName}`,
                    message: `${mitraName} mengajukan permintaan ${sn} keluar.${keterangan ? ` Keterangan: ${keterangan}` : ''}`,
                    type: 'REQUEST',
                    referenceId: item.id,
                });
            } catch (notifyError) {
                console.error('Gagal membuat notifikasi permintaan:', notifyError);
            }
        }

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
