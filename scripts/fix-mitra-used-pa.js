/**
 * Perbaikan data: isi `paNumber` item yang DIUPAKAI mitra namun tercatat tanpa
 * PA (karena alur lama memakai kategori "Keluar"), agar tampil sebagai
 * "Digunakan" bukan "Terdistribusi".
 *
 * Aman: jalankan dengan `--dry-run` untuk melihat rencana tanpa mengubah apa pun.
 *
 *   node scripts/fix-mitra-used-pa.js --dry-run
 *   node scripts/fix-mitra-used-pa.js            # benar-benar eksekusi
 */
import prisma from '../src/shared/prisma.js';
import { planUsedPaBackfill } from '../src/modules/items/backfillUsedPa.js';

const isDryRun = process.argv.includes('--dry-run');

async function fixMitraUsedPa() {
	// Item yang berpotensi: enum digunakan & tanpa PA (tampil "Terdistribusi").
	const items = await prisma.item.findMany({
		where: { status: 'digunakan' },
		select: {
			id: true,
			serialNumber: true,
			status: true,
			paNumber: true,
			location: { select: { name: true } },
			model: { select: { brand: { select: { nama: true } } } },
			createdBy: { select: { role: true, username: true, profile: { select: { nama: true } } } },
			mutations: {
				select: {
					id: true,
					type: true,
					requestId: true,
					userId: true,
					paNumber: true,
					destinationLocationName: true,
					createdAt: true,
				},
			},
		},
	});

	const userIds = [...new Set(items.flatMap((i) => i.mutations.map((m) => m.userId)))];
	const users = await prisma.user.findMany({
		where: { id: { in: userIds } },
		select: { id: true, role: true },
	});
	const usersById = Object.fromEntries(users.map((u) => [u.id, u]));

	const mutationsByItem = Object.fromEntries(items.map((i) => [i.id, i.mutations]));

	const itemContext = Object.fromEntries(
		items.map((i) => [
			i.id,
			{
				ownerName: i.createdBy?.profile?.nama || i.createdBy?.username || null,
				locationName: i.location?.name || null,
				brandName: i.model?.brand?.nama || null,
			},
		])
	);

	const plan = planUsedPaBackfill(
		items.map(({ mutations, location, model, createdBy, ...rest }) => rest),
		mutationsByItem,
		usersById,
		{ itemContext }
	);

	console.log(`Item eligible (digunakan tanpa PA): ${items.filter((i) => !(i.paNumber || '').trim()).length}`);
	console.log(`Akan di-backfill: ${plan.length}`);
	if (plan.length === 0) {
		console.log('Tidak ada yang perlu diperbaiki.');
		return;
	}

	for (const p of plan) {
		console.log(`  ${p.item.serialNumber} → paNumber = ${p.paNumber}`);
	}

	if (isDryRun) {
		console.log('\n(dry-run — tidak ada perubahan ditulis)');
		return;
	}

	let updated = 0;
	for (const p of plan) {
		await prisma.item.update({
			where: { id: p.item.id },
			data: { paNumber: p.paNumber },
		});
		updated += 1;
	}
	console.log(`\nSelesai. ${updated} item diperbarui.`);
}

fixMitraUsedPa()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
