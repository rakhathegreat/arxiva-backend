import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Mulai proses seeding database ---');

    // 1. Bersihkan database lama secara berurutan untuk menghindari error foreign key
    await prisma.itemMutation.deleteMany();
    await prisma.requestAllocation.deleteMany();
    await prisma.requestItem.deleteMany();
    await prisma.deliveryDocument.deleteMany();
    await prisma.request.deleteMany();
    await prisma.item.deleteMany();
    await prisma.materialModel.deleteMany();
    await prisma.brandLocationRule.deleteMany();
    await prisma.userLocation.deleteMany();
    await prisma.location.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.materialCategory.deleteMany();
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
}

main()
    .catch(e => {
        console.error('❌ Gagal melakukan seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });