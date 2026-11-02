import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
	console.log('--- Mulai proses seeding database ---');

	// 0. Validasi konfigurasi SEBELUM menyentuh database. Kalau tidak, salah
	// input env akan mengosongkan seluruh tabel lalu gagal di tengah jalan.
	// Password diambil dari env — JANGAN hardcode: repo ini publik, jadi
	// password yang tertulis di sini sama saja dengan membocorkannya.
	const adminPassword = process.env.SEED_ADMIN_PASSWORD;
	if (!adminPassword) {
		throw new Error(
			'SEED_ADMIN_PASSWORD wajib diset. Contoh: SEED_ADMIN_PASSWORD=... node prisma/seeder.js',
		);
	}
	if (adminPassword.length < 12) {
		throw new Error('SEED_ADMIN_PASSWORD minimal 12 karakter.');
	}

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

	// 2. Buat User & Profile
	const adminUser = await prisma.user.create({
		data: {
			username: process.env.SEED_ADMIN_USERNAME || 'admin',
			password: await bcrypt.hash(adminPassword, 12),
			role: 'ADMIN',
			profile: {
				create: {
					nama: 'KP Tasikmalaya',
					email: 'kp.tasikmalaya@arxiva.com',
					telepon: '08123456789',
					alamat: 'Kantor Pusat Tasikmalaya',
				},
			},
		},
	});
	console.log(`👤 User '${adminUser.username}' (${adminUser.role}) dibuat`);
}

main()
	.catch((e) => {
		console.error('❌ Gagal melakukan seeding:', e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
