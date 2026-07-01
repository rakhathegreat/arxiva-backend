import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Mulai proses seeding database ---');

    // 1. Seed User Admin & Mitra beserta Profile
    const adminPassword = await bcrypt.hash('Admin123!', 10);
    let admin = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (!admin) {
        admin = await prisma.user.create({
            data: {
                username: 'admin',
                password: adminPassword,
                role: 'ADMIN',
                isAktif: true,
                profile: {
                    create: {
                        nama: 'Administrator Utama',
                        email: 'admin@arxiva.com',
                        telepon: '081234567890',
                        alamat: 'Jl. Merdeka No. 1, Jakarta',
                        contactPerson: 'Admin Support'
                    }
                }
            }
        });
        console.log('✅ User Admin berhasil dibuat');
    } else {
        console.log('⚡ User Admin sudah ada');
    }

    const mitraPassword = await bcrypt.hash('Mitra123!', 10);
    let mitra = await prisma.user.findUnique({ where: { username: 'mitra1' } });
    if (!mitra) {
        mitra = await prisma.user.create({
            data: {
                username: 'mitra1',
                password: mitraPassword,
                role: 'MITRA',
                isAktif: true,
                profile: {
                    create: {
                        nama: 'PT Mitra Teknologi Mandiri',
                        email: 'mitra1@arxiva.com',
                        telepon: '081987654321',
                        alamat: 'Jl. Sudirman No. 45, Jakarta',
                        code: 'MTR-001',
                        partnerType: 'MITRA',
                        contactPerson: 'Budi Santoso'
                    }
                }
            }
        });
        console.log('✅ User Mitra berhasil dibuat');
    } else {
        console.log('⚡ User Mitra sudah ada');
    }

    // 2. Seed Category
    const categoriesData = [
        { nama: 'Networking', deskripsi: 'Perangkat Jaringan & Konektivitas', safetyStock: 5 },
        { nama: 'Server & Storage', deskripsi: 'Perangkat Server dan Media Penyimpanan Data', safetyStock: 3 },
        { nama: 'Peripherals', deskripsi: 'Aksesoris dan Perangkat Pendukung Komputer', safetyStock: 10 },
    ];

    const categories = [];
    for (const catData of categoriesData) {
        let cat = await prisma.category.findFirst({ where: { nama: catData.nama } });
        if (!cat) {
            cat = await prisma.category.create({ data: catData });
            console.log(`✅ Kategori "${cat.nama}" berhasil dibuat`);
        } else {
            console.log(`⚡ Kategori "${cat.nama}" sudah ada`);
        }
        categories.push(cat);
    }

    // 3. Seed Brand
    const brandsData = [
        { nama: 'Cisco', origin: 'USA', identifier: 'CSCO', categoryId: categories[0].id },
        { nama: 'Mikrotik', origin: 'Latvia', identifier: 'MKRT', categoryId: categories[0].id },
        { nama: 'Dell EMC', origin: 'USA', identifier: 'DELL', categoryId: categories[1].id },
        { nama: 'Logitech', origin: 'Switzerland', identifier: 'LOGI', categoryId: categories[2].id },
    ];

    const brands = [];
    for (const bData of brandsData) {
        let brand = await prisma.brand.findUnique({ where: { identifier: bData.identifier } });
        if (!brand) {
            brand = await prisma.brand.create({ data: bData });
            console.log(`✅ Brand "${brand.nama}" berhasil dibuat`);
        } else {
            console.log(`⚡ Brand "${brand.nama}" sudah ada`);
        }
        brands.push(brand);
    }

    // 4. Seed Location & Level
    const locationsData = [
        {
            name: 'Rak Utama A',
            type: 'RAK',
            isActive: true,
            levels: [
                { name: 'Level 1', capacity: 20, brandRuleId: brands[0].id }, // Khusus Cisco
                { name: 'Level 2', capacity: 30, brandRuleId: null },
            ]
        },
        {
            name: 'Kardus Storage B',
            type: 'KARDUS',
            isActive: true,
            levels: [
                { name: 'Box B-1', capacity: 15, brandRuleId: null },
                { name: 'Box B-2', capacity: 15, brandRuleId: null },
            ]
        }
    ];

    const allLevels = [];
    for (const locData of locationsData) {
        const { levels, ...locFields } = locData;
        let location = await prisma.location.findUnique({ where: { name: locFields.name } });
        if (!location) {
            location = await prisma.location.create({ data: locFields });
            console.log(`✅ Lokasi "${location.name}" berhasil dibuat`);
        } else {
            console.log(`⚡ Lokasi "${location.name}" sudah ada`);
        }

        for (const levData of levels) {
            let level = await prisma.level.findFirst({
                where: { locationId: location.id, name: levData.name }
            });
            if (!level) {
                level = await prisma.level.create({
                    data: { ...levData, locationId: location.id }
                });
                console.log(`✅ Level "${level.name}" di "${location.name}" berhasil dibuat`);
            } else {
                console.log(`⚡ Level "${level.name}" di "${location.name}" sudah ada`);
            }
            allLevels.push(level);
        }
    }

    // 5. Seed Items & Initial Transaction
    const itemsData = [
        {
            serialNumber: 'SN-CSCO-001',
            categoryId: categories[0].id,
            brandId: brands[0].id,
            status: 'tersedia',
            levelId: allLevels[0].id, // Level 1 di Rak Utama A
            createdById: admin.id,
            entryDate: new Date(),
        },
        {
            serialNumber: 'SN-MKRT-002',
            categoryId: categories[0].id,
            brandId: brands[1].id,
            status: 'tersedia',
            levelId: allLevels[1].id, // Level 2 di Rak Utama A
            createdById: admin.id,
            entryDate: new Date(),
        },
        {
            serialNumber: 'SN-DELL-003',
            categoryId: categories[1].id,
            brandId: brands[2].id,
            status: 'tersedia',
            levelId: allLevels[2].id, // Box B-1 di Kardus Storage B
            createdById: mitra.id,
            entryDate: new Date(),
        }
    ];

    for (const itemData of itemsData) {
        let item = await prisma.item.findUnique({ where: { serialNumber: itemData.serialNumber } });
        if (!item) {
            item = await prisma.item.create({ data: itemData });
            console.log(`✅ Item dengan SN "${item.serialNumber}" berhasil dibuat`);

            // Catat transaksi pertama (MASUK)
            const brand = brands.find(b => b.id === item.brandId);
            const category = categories.find(c => c.id === item.categoryId);
            
            await prisma.transaction.create({
                data: {
                    transactionType: 'MASUK',
                    itemId: item.id,
                    userId: item.createdById,
                    serialNumber: item.serialNumber,
                    brand: brand ? brand.nama : 'Unknown',
                    category: category ? category.nama : 'Unknown',
                    paNumber: `PA-${Date.now()}-${item.serialNumber}`,
                    destination: 'Storage Initial Seeding',
                }
            });
            console.log(`✅ Transaksi MASUK untuk "${item.serialNumber}" berhasil dicatat`);
        } else {
            console.log(`⚡ Item dengan SN "${item.serialNumber}" sudah ada`);
        }
    }

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