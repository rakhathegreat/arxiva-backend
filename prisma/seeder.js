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