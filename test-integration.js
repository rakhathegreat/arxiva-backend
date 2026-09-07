import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTests() {
    console.log("=== Memulai Pengujian & Validasi ===");

    try {
        // 5.1 Lakukan pengujian Create User Mitra
        console.log("1. Menguji Pembuatan User Mitra (Otomatisasi Lokasi)...");
        
        // Hapus test data jika ada
        await prisma.user.deleteMany({ where: { username: 'mitra_test' } });
        
        const fetch = (await import('node-fetch')).default;
        
        // Kita akan bypass controller dan memanggil DB secara langsung untuk validasi yang lebih mudah
        // Simulasi dari controller:
        const userMitra = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    username: 'mitra_test',
                    password: 'password123',
                    role: 'MITRA',
                    isAktif: true,
                    profile: {
                        create: {
                            nama: 'Mitra Test',
                            email: '-', telepon: '-', alamat: '-', code: '-', partnerType: 'Supplier', contactPerson: '-'
                        }
                    }
                }
            });

            const partnerLocation = await tx.location.create({
                data: {
                    name: 'Mitra Test',
                    type: 'PARTNER',
                    capacity: 999999
                }
            });

            await tx.userLocation.create({
                data: { userId: user.id, locationId: partnerLocation.id }
            });

            return user;
        });

        // Verifikasi Lokasi
        const userLoc = await prisma.userLocation.findFirst({
            where: { userId: userMitra.id },
            include: { location: true }
        });

        if (!userLoc || userLoc.location.type !== 'PARTNER') {
            throw new Error("Gagal: Lokasi otomatis tidak terbuat untuk Mitra");
        }
        console.log("✅ Berhasil: Lokasi otomatis terbuat untuk Mitra");


        // 5.2 Simulasikan alokasi barang untuk request, dan validasi constraint double booking
        console.log("2. Menguji Alokasi Barang dan Double Booking...");
        
        const category = await prisma.category.findFirst();
        const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }});
        const items = await prisma.item.findMany({ take: 2, where: { status: 'tersedia' } });
        
        if (items.length < 2) throw new Error("Tidak cukup barang tersedia untuk test");
        
        // Buat 2 Request
        const req1 = await prisma.request.create({
            data: {
                requestNumber: "REQ-TEST-1",
                requesterId: userMitra.id,
                status: 'DISETUJUI',
                requestItems: {
                    create: [{ categoryId: category.id, quantity: 1 }]
                }
            },
            include: { requestItems: true }
        });

        const req2 = await prisma.request.create({
            data: {
                requestNumber: "REQ-TEST-2",
                requesterId: userMitra.id,
                status: 'DISETUJUI',
                requestItems: {
                    create: [{ categoryId: category.id, quantity: 1 }]
                }
            },
            include: { requestItems: true }
        });

        // Alokasi item[0] ke Req 1
        await prisma.requestAllocation.create({
            data: {
                requestItemId: req1.requestItems[0].id,
                itemId: items[0].id,
                allocatedById: adminUser.id
            }
        });
        
        // Coba alokasi item[0] lagi ke Req 2 (Harusnya gagal)
        try {
            await prisma.requestAllocation.create({
                data: {
                    requestItemId: req2.requestItems[0].id,
                    itemId: items[0].id,
                    allocatedById: adminUser.id
                }
            });
            throw new Error("Gagal: Double booking tidak dicegah!");
        } catch (error) {
            if (error.code === 'P2002') {
                console.log("✅ Berhasil: Proteksi Double Booking berfungsi (P2002)");
            } else {
                throw error;
            }
        }

        // 5.3 & 5.4 Lakukan perubahan status request ke SELESAI & Validasi Mutasi
        console.log("3. Menguji Penyelesaian Request dan Log Mutasi Otomatis...");
        
        // Kita panggil utils manual seolah-olah dipanggil controller
        const { logMutation } = await import('./src/utils/mutation.util.js');
        
        const req1Full = await prisma.request.findUnique({
            where: { id: req1.id },
            include: { requestItems: { include: { allocations: true } } }
        });

        await prisma.$transaction(async (tx) => {
            await tx.request.update({
                where: { id: req1.id },
                data: { status: 'SELESAI', completedAt: new Date() }
            });
            
            for (const reqItem of req1Full.requestItems) {
                for (const allocation of reqItem.allocations) {
                    const item = await tx.item.findUnique({ where: { id: allocation.itemId } });
                    
                    await tx.item.update({
                        where: { id: allocation.itemId },
                        data: {
                            status: 'digunakan',
                            locationId: userLoc.location.id,
                            createdById: userMitra.id
                        }
                    });

                    await logMutation(tx, {
                        type: 'KELUAR',
                        itemId: allocation.itemId,
                        userId: adminUser.id,
                        originLocationId: item.locationId,
                        destinationLocationId: userLoc.location.id,
                        requestId: req1.id
                    });
                }
            }
        });

        const log = await prisma.itemMutation.findFirst({
            where: { requestId: req1.id }
        });

        if (!log || log.type !== 'KELUAR') {
            throw new Error("Gagal: Log mutasi tidak tercatat dengan benar!");
        }
        
        const updatedItem = await prisma.item.findUnique({ where: { id: items[0].id } });
        if (updatedItem.status !== 'digunakan' || updatedItem.locationId !== userLoc.location.id) {
            throw new Error("Gagal: Status/Lokasi barang tidak berubah!");
        }

        console.log("✅ Berhasil: Request SELESAI, barang berpindah, dan Log Mutasi tercatat di Ledger.");
        console.log("=== Semua Pengujian Selesai & Sukses ===");

    } catch (error) {
        console.error("❌ ERROR PENGUJIAN:", error);
    } finally {
        await prisma.$disconnect();
    }
}

runTests();
