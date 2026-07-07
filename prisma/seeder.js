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

    // 2. Seed User Mitra
    const mitraPassword = await bcrypt.hash('Mitra123!', 10);
    let mitra = await prisma.user.findUnique({ where: { username: 'mitra_demo' } });
    if (!mitra) {
        mitra = await prisma.user.create({
            data: {
                username: 'mitra_demo',
                password: mitraPassword,
                role: 'MITRA',
                isAktif: true,
                profile: {
                    create: {
                        nama: 'Mitra Alpha',
                        email: 'alpha@mitra.com',
                        telepon: '08111222333',
                        alamat: 'Jl. Sudirman No. 10, Jakarta',
                        contactPerson: 'Budi'
                    }
                }
            }
        });
        console.log('✅ User Mitra berhasil dibuat');
    } else {
        console.log('⚡ User Mitra sudah ada');
    }

    // 3. Seed Category
    let catLaptop = await prisma.category.findFirst({ where: { nama: 'Laptop' } });
    if (!catLaptop) {
        catLaptop = await prisma.category.create({
            data: { nama: 'Laptop', deskripsi: 'Komputer Jinjing', safetyStock: 10 }
        });
        console.log('✅ Kategori Laptop berhasil dibuat');
    }

    let catMonitor = await prisma.category.findFirst({ where: { nama: 'Monitor' } });
    if (!catMonitor) {
        catMonitor = await prisma.category.create({
            data: { nama: 'Monitor', deskripsi: 'Layar Komputer', safetyStock: 5 }
        });
        console.log('✅ Kategori Monitor berhasil dibuat');
    }

    // 4. Seed Brand
    let brandLenovo = await prisma.brand.findUnique({ where: { nama: 'Lenovo' } });
    if (!brandLenovo) {
        brandLenovo = await prisma.brand.create({
            data: { nama: 'Lenovo', origin: 'China', identifier: 'LNV', categoryId: catLaptop.id }
        });
        console.log('✅ Brand Lenovo berhasil dibuat');
    }

    let brandDell = await prisma.brand.findUnique({ where: { nama: 'Dell' } });
    if (!brandDell) {
        brandDell = await prisma.brand.create({
            data: { nama: 'Dell', origin: 'USA', identifier: 'DLL', categoryId: catMonitor.id }
        });
        console.log('✅ Brand Dell berhasil dibuat');
    }

    // 5. Seed Requests
    const existingRequests = await prisma.request.count();
    if (existingRequests === 0) {
        const dummyRequests = [
            {
                requestNumber: 'REQ-2026-0001',
                requesterId: mitra.id,
                status: 'DISETUJUI',
                notes: 'Permintaan pengadaan laptop untuk tim marketing',
                requestedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
                items: [
                    { categoryId: catLaptop.id, brandId: brandLenovo.id, quantity: 5 }
                ]
            },
            {
                requestNumber: 'REQ-2026-0002',
                requesterId: mitra.id,
                status: 'MENUNGGU',
                notes: 'Kebutuhan tambahan monitor',
                requestedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
                items: [
                    { categoryId: catMonitor.id, brandId: brandDell.id, quantity: 2 }
                ]
            },
            {
                requestNumber: 'REQ-2026-0003',
                requesterId: mitra.id,
                status: 'SELESAI',
                notes: 'Penggantian unit rusak',
                requestedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
                items: [
                    { categoryId: catLaptop.id, brandId: brandLenovo.id, quantity: 1 },
                    { categoryId: catMonitor.id, brandId: brandDell.id, quantity: 1 }
                ]
            }
        ];

        for (const req of dummyRequests) {
            await prisma.request.create({
                data: {
                    requestNumber: req.requestNumber,
                    requesterId: req.requesterId,
                    status: req.status,
                    notes: req.notes,
                    requestedAt: req.requestedAt,
                    requestItems: {
                        create: req.items
                    }
                }
            });
        }
        console.log('✅ Data Dummy Request berhasil dibuat');
    } else {
        console.log('⚡ Data Request sudah ada, skip pembuatan dummy');
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