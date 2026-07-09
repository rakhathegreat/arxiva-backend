import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Mulai proses seeding database ---');

    // 1. Bersihkan database lama secara berurutan untuk menghindari error foreign key
    await prisma.transaction.deleteMany();
    await prisma.requestAllocation.deleteMany();
    await prisma.requestItem.deleteMany();
    await prisma.request.deleteMany();
    await prisma.item.deleteMany();
    await prisma.brandLocationRule.deleteMany();
    await prisma.userLocation.deleteMany();
    await prisma.location.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.category.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.user.deleteMany();
    console.log('🧹 Database berhasil dibersihkan');

    // 2. Hash password
    const hashedAdminPassword = await bcrypt.hash('Admin123!', 10);
    const hashedMitraPassword = await bcrypt.hash('Mitra123!', 10);

    // 3. Buat User & Profile
    const users = [];

    // Admin (KP Tasikmalaya)
    const adminUser = await prisma.user.create({
        data: {
            username: 'admin',
            password: hashedAdminPassword,
            role: 'ADMIN',
            profile: {
                create: {
                    nama: 'KP Tasikmalaya',
                    email: 'kp.tasikmalaya@arxiva.com',
                    telepon: '08123456789',
                    alamat: 'Kantor Pusat Tasikmalaya',
                }
            }
        }
    });
    users.push(adminUser);

    // Mitra-mitra
    const partnersData = [
        { username: 'pt_naratas', nama: 'PT Naratas', email: 'contact@naratas.com' },
        { username: 'pt_tzu', nama: 'PT TZU', email: 'contact@tzu.com' },
        { username: 'mitra_demo', nama: 'Mitra Alpha', email: 'alpha@mitra.com' },
        { username: 'pt_beta', nama: 'PT Beta', email: 'contact@beta.com' },
    ];

    const mappedPartners = {};
    for (const partner of partnersData) {
        const u = await prisma.user.create({
            data: {
                username: partner.username,
                password: hashedMitraPassword,
                role: 'MITRA',
                profile: {
                    create: {
                        nama: partner.nama,
                        email: partner.email,
                        telepon: '081122334455',
                        alamat: 'Jl. Industri No. 5',
                    }
                }
            }
        });
        mappedPartners[partner.nama] = u.id;
        users.push(u);
    }
    console.log('✅ User & Profile Mitra berhasil dibuat');

    // 4. Buat Kategori
    const catLaptop = await prisma.category.create({ data: { nama: 'Laptop', deskripsi: 'Komputer Jinjing', safetyStock: 8 } });
    const catMonitor = await prisma.category.create({ data: { nama: 'Monitor', deskripsi: 'Layar LCD/LED', safetyStock: 5 } });
    const catRouter = await prisma.category.create({ data: { nama: 'Router', deskripsi: 'Perangkat Network', safetyStock: 3 } });
    const catPrinter = await prisma.category.create({ data: { nama: 'Printer', deskripsi: 'Pencetak Dokumen', safetyStock: 4 } });
    console.log('✅ Kategori Aset berhasil dibuat');

    // 5. Buat Brand
    const bLenovo = await prisma.brand.create({ data: { nama: 'Lenovo', origin: 'China', identifier: 'LNV', categoryId: catLaptop.id } });
    const bAsus = await prisma.brand.create({ data: { nama: 'ASUS', origin: 'Taiwan', identifier: 'ASU', categoryId: catLaptop.id } });
    const bDell = await prisma.brand.create({ data: { nama: 'Dell', origin: 'USA', identifier: 'DLL', categoryId: catMonitor.id } });
    const bLg = await prisma.brand.create({ data: { nama: 'LG', origin: 'South Korea', identifier: 'LGE', categoryId: catMonitor.id } });
    const bCisco = await prisma.brand.create({ data: { nama: 'Cisco', origin: 'USA', identifier: 'CSO', categoryId: catRouter.id } });
    const bHp = await prisma.brand.create({ data: { nama: 'HP', origin: 'USA', identifier: 'HPP', categoryId: catPrinter.id } });
    console.log('✅ Brand Aset berhasil dibuat');

    // 6. Buat Lokasi
    const locGudang = await prisma.location.create({ data: { name: 'Gudang Utama', type: 'BRANCH', capacity: 100 } });
    const locRak1 = await prisma.location.create({ data: { name: 'Rak A - Baris 1', type: 'BOX', parentId: locGudang.id, capacity: 20 } });
    const locRak2 = await prisma.location.create({ data: { name: 'Rak A - Baris 2', type: 'BOX', parentId: locGudang.id, capacity: 20 } });
    const locDiluar = await prisma.location.create({ data: { name: 'Diluar', type: 'PARTNER', capacity: 500 } });
    console.log('✅ Lokasi Penyimpanan berhasil dibuat');

    // 7. Buat Items/Aset
    const itemDistribution = [
        { ownerId: adminUser.id, count: 18, status: 'tersedia', locId: locRak1.id }, // KP Tasikmalaya (Tersedia)
        { ownerId: mappedPartners['PT Naratas'], count: 12, status: 'digunakan', locId: locDiluar.id }, // PT Naratas (Diluar)
        { ownerId: mappedPartners['PT TZU'], count: 8, status: 'digunakan', locId: locDiluar.id }, // PT TZU (Diluar)
        { ownerId: mappedPartners['Mitra Alpha'], count: 6, status: 'digunakan', locId: locDiluar.id }, // Mitra Alpha (Diluar)
        { ownerId: mappedPartners['PT Beta'], count: 4, status: 'digunakan', locId: locDiluar.id }, // PT Beta (Diluar)
        { ownerId: adminUser.id, count: 3, status: 'rusak', locId: locRak2.id }, // Rusak (di Gudang)
        { ownerId: mappedPartners['PT Naratas'], count: 2, status: 'hilang', locId: locDiluar.id }, // Hilang
    ];

    const brands = [bLenovo, bAsus, bDell, bLg, bCisco, bHp];
    const createdItems = [];
    let snCounter = 1000;

    for (const dist of itemDistribution) {
        for (let i = 0; i < dist.count; i++) {
            const randomBrand = brands[Math.floor(Math.random() * brands.length)];
            const sn = `SN-${randomBrand.identifier}-${snCounter++}`;
            const item = await prisma.item.create({
                data: {
                    serialNumber: sn,
                    categoryId: randomBrand.categoryId,
                    brandId: randomBrand.id,
                    status: dist.status,
                    locationId: dist.locId,
                    entryDate: new Date(Date.now() - Math.floor(Math.random() * 40 + 10) * 24 * 60 * 60 * 1000), // Masuk 10-50 hari lalu
                    createdById: dist.ownerId,
                    paNumber: `PA-ARX-${snCounter}`
                },
                include: { category: true, brand: true }
            });
            createdItems.push(item);
        }
    }
    console.log(`✅ ${createdItems.length} Item Aset berhasil dibuat`);

    // 8. Buat Transaksi Historis (Untuk Line Area Chart 30 Hari Terakhir)
    let txCounter = 1;
    const now = new Date();
    for (let day = 30; day >= 1; day--) {
        const txDate = new Date();
        txDate.setDate(now.getDate() - day);

        // Tambah fluktuasi transaksi per hari (0 sampai 3 transaksi)
        const txCount = Math.floor(Math.random() * 4);
        for (let i = 0; i < txCount; i++) {
            const randomItem = createdItems[Math.floor(Math.random() * createdItems.length)];
            const txType = Math.random() > 0.4 ? 'MASUK' : 'KELUAR';

            await prisma.transaction.create({
                data: {
                    transactionNumber: `TX-${txDate.getFullYear()}${(txDate.getMonth() + 1).toString().padStart(2, '0')}-${txCounter++}`,
                    transactionType: txType,
                    itemId: randomItem.id,
                    userId: randomItem.createdById, // User pemilik aset
                    serialNumber: randomItem.serialNumber,
                    brand: randomItem.brand.nama,
                    category: randomItem.category.nama,
                    paNumber: randomItem.paNumber || '',
                    createdAt: txDate,
                }
            });
        }
    }
    console.log('✅ Transaksi Historis (30 hari terakhir) berhasil dibuat');

    // 9. Buat Request Permintaan (10 Request Terbaru)
    const requestStatuses = ['MENUNGGU', 'DISETUJUI', 'SIAP', 'SELESAI', 'DITOLAK'];
    const requestPartners = [
        mappedPartners['PT Naratas'],
        mappedPartners['PT TZU'],
        mappedPartners['Mitra Alpha'],
        mappedPartners['PT Beta']
    ];

    for (let i = 1; i <= 10; i++) {
        const requesterId = requestPartners[Math.floor(Math.random() * requestPartners.length)];
        const status = requestStatuses[Math.floor(Math.random() * requestStatuses.length)];
        const reqDate = new Date();
        reqDate.setDate(now.getDate() - Math.floor(Math.random() * 7)); // Dalam 7 hari terakhir

        await prisma.request.create({
            data: {
                requestNumber: `REQ-${reqDate.getFullYear()}-${i.toString().padStart(4, '0')}`,
                requesterId: requesterId,
                status: status,
                notes: `Permintaan pengadaan unit untuk mendukung operasional fase ${i}`,
                requestedAt: reqDate,
                requestItems: {
                    create: [
                        { categoryId: catLaptop.id, brandId: bLenovo.id, quantity: Math.floor(Math.random() * 3) + 1 },
                        { categoryId: catMonitor.id, brandId: bDell.id, quantity: Math.floor(Math.random() * 2) + 1 }
                    ]
                }
            }
        });
    }
    console.log('✅ 10 Data Request Terbaru berhasil dibuat');
    console.log('--- Proses seeding database selesai! ---');
}

main()
    .catch(e => {
        console.error('❌ Gagal melakukan seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });