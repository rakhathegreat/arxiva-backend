/**
 * Seeder DATA DEMO untuk kebutuhan visualisasi (dashboard, tabel, grafik).
 *
 * ⚠️ Destruktif: menghapus seluruh data transaksi/master lalu mengisi ulang.
 * Jalankan hanya di database development:
 *
 *   npm run seed:demo
 *
 * Data yang dibuat deterministik (seeded PRNG) supaya grafik stabil tiap run.
 */
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Util deterministik ───────────────────────────────────────────────────────
function mulberry32(seed) {
	let a = seed;
	return function random() {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const rng = mulberry32(20261029);
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const chance = (p) => rng() < p;
const pad = (n, len = 4) => String(n).padStart(len, '0');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();

function daysAgo(days, hour = randInt(8, 16), minute = randInt(0, 59)) {
	const d = new Date(NOW.getTime() - days * MS_PER_DAY);
	d.setHours(hour, minute, 0, 0);
	return d;
}

function addDays(base, days) {
	return new Date(base.getTime() + days * MS_PER_DAY);
}

function dayKey(date) {
	const y = date.getFullYear();
	const m = pad(date.getMonth() + 1, 2);
	const d = pad(date.getDate(), 2);
	return `${y}${m}${d}`;
}

function dateOnly(date) {
	const y = date.getFullYear();
	const m = pad(date.getMonth() + 1, 2);
	const d = pad(date.getDate(), 2);
	return `${y}-${m}-${d}`;
}

// ── Master data ──────────────────────────────────────────────────────────────
const CATEGORIES = [
	{ nama: 'Laptop', safetyStock: 12 },
	{ nama: 'Desktop', safetyStock: 8 },
	{ nama: 'Monitor', safetyStock: 10 },
	{ nama: 'Printer', safetyStock: 6 },
	{ nama: 'Networking', safetyStock: 15 },
	{ nama: 'Aksesoris', safetyStock: 25 },
];

const BRANDS = [
	{ nama: 'Lenovo', origin: 'China', identifier: 'LNV' },
	{ nama: 'HP', origin: 'Amerika Serikat', identifier: 'HP' },
	{ nama: 'Dell', origin: 'Amerika Serikat', identifier: 'DELL' },
	{ nama: 'Asus', origin: 'Taiwan', identifier: 'ASUS' },
	{ nama: 'Acer', origin: 'Taiwan', identifier: 'ACER' },
	{ nama: 'Cisco', origin: 'Amerika Serikat', identifier: 'CSCO' },
	{ nama: 'Logitech', origin: 'Swiss', identifier: 'LOGI' },
];

const MODELS = [
	{
		code: 'LNV-T14',
		nama: 'ThinkPad T14 Gen 4',
		kategori: 'Laptop',
		merek: 'Lenovo',
		deskripsi: 'Laptop bisnis 14 inci, Core i5, 16GB RAM',
	},
	{
		code: 'LNV-M70Q',
		nama: 'ThinkCentre M70q',
		kategori: 'Desktop',
		merek: 'Lenovo',
		deskripsi: 'Mini PC desktop untuk workstation',
	},
	{
		code: 'LNV-T24',
		nama: 'ThinkVision T24i-30',
		kategori: 'Monitor',
		merek: 'Lenovo',
		deskripsi: 'Monitor IPS 24 inci Full HD',
	},
	{
		code: 'HP-PB450',
		nama: 'ProBook 450 G10',
		kategori: 'Laptop',
		merek: 'HP',
		deskripsi: 'Laptop kerja 15,6 inci, Core i7',
	},
	{
		code: 'HP-ED800',
		nama: 'EliteDesk 800 G9',
		kategori: 'Desktop',
		merek: 'HP',
		deskripsi: 'Desktop SFF kelas enterprise',
	},
	{
		code: 'HP-LJ404',
		nama: 'LaserJet Pro M404dn',
		kategori: 'Printer',
		merek: 'HP',
		deskripsi: 'Printer laser monokrom duplex',
	},
	{
		code: 'DELL-L5440',
		nama: 'Latitude 5440',
		kategori: 'Laptop',
		merek: 'Dell',
		deskripsi: 'Laptop bisnis 14 inci, Core i5',
	},
	{
		code: 'DELL-OP7010',
		nama: 'OptiPlex 7010',
		kategori: 'Desktop',
		merek: 'Dell',
		deskripsi: 'Desktop tower untuk kantor',
	},
	{
		code: 'DELL-U2422',
		nama: 'UltraSharp U2422H',
		kategori: 'Monitor',
		merek: 'Dell',
		deskripsi: 'Monitor 24 inci USB-C',
	},
	{
		code: 'ASUS-EB1',
		nama: 'ExpertBook B1',
		kategori: 'Laptop',
		merek: 'Asus',
		deskripsi: 'Laptop produktivitas 14 inci',
	},
	{
		code: 'ASUS-PA248',
		nama: 'ProArt PA248QV',
		kategori: 'Monitor',
		merek: 'Asus',
		deskripsi: 'Monitor color-accurate 24 inci',
	},
	{
		code: 'ACER-VX',
		nama: 'Veriton X',
		kategori: 'Desktop',
		merek: 'Acer',
		deskripsi: 'Desktop compact untuk administrasi',
	},
	{
		code: 'ACER-TMP2',
		nama: 'TravelMate P2',
		kategori: 'Laptop',
		merek: 'Acer',
		deskripsi: 'Laptop bisnis 14 inci',
	},
	{
		code: 'CSCO-C1000',
		nama: 'Catalyst 1000 Switch',
		kategori: 'Networking',
		merek: 'Cisco',
		deskripsi: 'Switch manageable 24 port',
	},
	{
		code: 'CSCO-RV340',
		nama: 'RV340 Router',
		kategori: 'Networking',
		merek: 'Cisco',
		deskripsi: 'Router VPN untuk kantor cabang',
	},
	{
		code: 'CSCO-MR36',
		nama: 'Meraki MR36',
		kategori: 'Networking',
		merek: 'Cisco',
		deskripsi: 'Access point Wi-Fi 6 cloud managed',
	},
	{
		code: 'LOGI-MK540',
		nama: 'MK540 Wireless Combo',
		kategori: 'Aksesoris',
		merek: 'Logitech',
		deskripsi: 'Keyboard + mouse wireless',
	},
	{
		code: 'LOGI-B100',
		nama: 'B100 Optical Mouse',
		kategori: 'Aksesoris',
		merek: 'Logitech',
		deskripsi: 'Mouse USB optik',
	},
];

const MITRA_SEED = [
	{
		username: 'pt_tzu',
		profile: {
			nama: 'PT TZU',
			partnerType: 'Distributor',
			alamat: 'Jl. Sutisna Senjaya No. 12, Tasikmalaya',
		},
	},
	{
		username: 'mitra_nusantara',
		profile: {
			nama: 'PT Mitra Nusantara',
			partnerType: 'Vendor',
			alamat: 'Jl. Cihampelas No. 88, Bandung',
		},
	},
	{
		username: 'karya_digital',
		profile: {
			nama: 'CV Karya Digital',
			partnerType: 'Reseller',
			alamat: 'Jl. Ahmad Yani No. 45, Tasikmalaya',
		},
	},
	{
		username: 'sinar_teknologi',
		profile: {
			nama: 'PT Sinar Teknologi',
			partnerType: 'Service Center',
			alamat: 'Jl. Pahlawan No. 7, Garut',
		},
	},
	{
		username: 'berkah_komputer',
		profile: {
			nama: 'CV Berkah Komputer',
			partnerType: 'Reseller',
			alamat: 'Jl. Raya Ciamis No. 21, Ciamis',
		},
	},
	{
		username: 'andalan_media',
		profile: {
			nama: 'PT Andalan Media',
			partnerType: 'Vendor',
			alamat: 'Jl. Soekarno Hatta No. 301, Bandung',
		},
	},
];

const KONTAK = [
	{ contactPerson: 'Budi Santoso', picName: 'Budi Santoso', telepon: '0812-3456-7890' },
	{ contactPerson: 'Rina Marlina', picName: 'Rina Marlina', telepon: '0813-7788-1122' },
	{ contactPerson: 'Dedi Kurniawan', picName: 'Dedi Kurniawan', telepon: '0821-3344-5566' },
	{ contactPerson: 'Sri Wahyuni', picName: 'Sri Wahyuni', telepon: '0857-2211-8899' },
	{ contactPerson: 'Agus Setiawan', picName: 'Agus Setiawan', telepon: '0819-6677-5544' },
	{ contactPerson: 'Maya Lestari', picName: 'Maya Lestari', telepon: '0822-9988-7766' },
];

// ── Wipe (urutan aman FK) ────────────────────────────────────────────────────
async function wipe() {
	console.log('🧹 Menghapus data lama...');
	await prisma.itemMutation.deleteMany();
	await prisma.requestAllocation.deleteMany();
	await prisma.deliveryDocument.deleteMany();
	await prisma.requestItem.deleteMany();
	await prisma.request.deleteMany();
	await prisma.reconRecord.deleteMany();
	await prisma.signatureSession.deleteMany();
	await prisma.notification.deleteMany();
	await prisma.item.deleteMany();
	await prisma.brandLocationRule.deleteMany();
	await prisma.userLocation.deleteMany();
	await prisma.location.deleteMany();
	await prisma.materialModel.deleteMany();
	await prisma.brand.deleteMany();
	await prisma.materialCategory.deleteMany();
	await prisma.userProfile.deleteMany();
	await prisma.user.deleteMany();
}

// ── Builder ──────────────────────────────────────────────────────────────────
async function main() {
	await wipe();

	const adminPassword = await bcrypt.hash('Admin123!', 10);
	const mitraPassword = await bcrypt.hash('Mitra123!', 10);

	// Users -------------------------------------------------------------------
	console.log('👤 Membuat user & mitra...');
	const admin = await prisma.user.create({
		data: {
			username: 'admin',
			password: adminPassword,
			role: 'ADMIN',
			profile: {
				create: {
					nama: 'KP Tasikmalaya',
					email: 'kp.tasikmalaya@arxiva.id',
					telepon: '0265-331-200',
					alamat: 'Jl. Sutisna Senjaya No. 1, Tasikmalaya',
				},
			},
		},
	});

	const internals = [];
	for (const [i, nama] of ['Rudi Hartono', 'Sari Dewi'].entries()) {
		internals.push(
			await prisma.user.create({
				data: {
					username: `internal${i + 1}`,
					password: adminPassword,
					role: 'INTERNAL',
					profile: {
						create: {
							nama,
							email: `internal${i + 1}@arxiva.id`,
							telepon: `0812-0000-${pad(i + 1, 4)}`,
							alamat: 'KP Tasikmalaya',
						},
					},
				},
			}),
		);
	}

	const mitras = [];
	const mitraNameById = new Map();
	for (const [i, seed] of MITRA_SEED.entries()) {
		const kontak = KONTAK[i % KONTAK.length];
		mitras.push(
			await prisma.user.create({
				data: {
					username: seed.username,
					password: mitraPassword,
					role: 'MITRA',
					createdAt: daysAgo(200 - i * 12),
					profile: {
						create: {
							nama: seed.profile.nama,
							email: `${seed.username}@mitra.co.id`,
							telepon: kontak.telepon,
							alamat: seed.profile.alamat,
							code: `MTR-${pad(i + 1, 3)}`,
							partnerType: seed.profile.partnerType,
							contactPerson: kontak.contactPerson,
							picName: kontak.picName,
						},
					},
				},
			}),
		);
		mitraNameById.set(mitras[i].id, seed.profile.nama);
	}

	// Master barang ------------------------------------------------------------
	console.log('📦 Membuat master kategori, merek, model...');
	const categories = {};
	for (const c of CATEGORIES) {
		categories[c.nama] = await prisma.materialCategory.create({ data: c });
	}

	const brands = {};
	for (const b of BRANDS) {
		brands[b.nama] = await prisma.brand.create({ data: b });
	}

	const models = [];
	for (const m of MODELS) {
		const created = await prisma.materialModel.create({
			data: {
				code: m.code,
				nama: m.nama,
				deskripsi: m.deskripsi,
				materialCategoryId: categories[m.kategori].id,
				brandId: brands[m.merek].id,
			},
			include: { brand: true, materialCategory: true },
		});
		models.push(created);
	}

	// Lokasi ------------------------------------------------------------------
	console.log('🏢 Membuat hierarki lokasi...');
	// Catatan: UI lokasi (GET /locations) hanya membaca RACK/PALLET level atas
	// (parentId null); BRANCH/PARTNER memang disaring keluar.
	await prisma.location.create({
		data: { name: 'KP Tasikmalaya', type: 'BRANCH', capacity: 5000, code: 'KP-TSM' },
	});

	const kpBoxes = [];
	const kpBoxLabels = new Map();
	for (const [ri, rackName] of ['Rak A', 'Rak B', 'Rak C'].entries()) {
		const rack = await prisma.location.create({
			data: {
				name: rackName,
				type: 'RACK',
				capacity: 150,
				code: `KP-RACK-${ri + 1}`,
			},
		});
		for (let level = 1; level <= 2; level += 1) {
			const box = await prisma.location.create({
				data: {
					name: `Level ${level}`,
					type: 'BOX',
					capacity: 60,
					code: `KP-${ri + 1}-${level}`,
					parentId: rack.id,
				},
			});
			kpBoxes.push(box);
			kpBoxLabels.set(box.id, `${rackName} - Level ${level}`);
		}
	}

	// PARTNER = lokasi milik mitra (nama mitra), dipakai langsung sebagai
	// penempatan item terdistribusi — sama dengan provisioning user mitra.
	const mitraBoxes = new Map();
	for (const [i, mitra] of mitras.entries()) {
		const partnerLoc = await prisma.location.create({
			data: {
				name: mitra.profile?.nama ?? mitra.username,
				type: 'PARTNER',
				capacity: 999999,
				code: `MTR-LOC-${pad(i + 1, 3)}`,
			},
		});
		mitraBoxes.set(mitra.id, partnerLoc);
		await prisma.userLocation.create({
			data: { userId: mitra.id, locationId: partnerLoc.id },
		});
	}

	// Brand → lokasi rule -----------------------------------------------------
	for (const [i, nama] of ['Lenovo', 'HP', 'Dell', 'Asus'].entries()) {
		await prisma.brandLocationRule.create({
			data: {
				brandId: brands[nama].id,
				locationId: kpBoxes[i % kpBoxes.length].id,
				isDefault: true,
			},
		});
	}

	// Items -------------------------------------------------------------------
	console.log('💻 Membuat item inventaris...');
	const items = [];
	const year = NOW.getFullYear();
	let serialSeq = 0;
	let paSeq = 0;
	let ticketSeq = 0;

	const modelPool = models;
	const statuses = [
		['tersedia', 46],
		['digunakan_pa', 26],
		['digunakan_no_pa', 10],
		['rusak', 10],
		['hilang', 8],
	];

	function weightedStatus() {
		const total = statuses.reduce((a, [, w]) => a + w, 0);
		let roll = rng() * total;
		for (const [name, weight] of statuses) {
			roll -= weight;
			if (roll <= 0) return name;
		}
		return 'tersedia';
	}

	const TOTAL_ITEMS = 230;
	const KP_ITEMS = 120;

	for (let i = 0; i < TOTAL_ITEMS; i += 1) {
		const isKp = i < KP_ITEMS;
		const owner = isKp ? admin : mitras[(i - KP_ITEMS) % mitras.length];
		const model = pick(modelPool);
		const statusKind = isKp
			? chance(0.16)
				? 'rusak'
				: chance(0.05)
					? 'hilang'
					: 'tersedia'
			: weightedStatus();

		serialSeq += 1;
		const serialNumber = `${model.brand.identifier}-${year}-${pad(serialSeq)}`;

		const entryDaysAgo = chance(0.72) ? randInt(0, 88) : randInt(89, 210);
		const entryDate = daysAgo(entryDaysAgo);

		let status = 'tersedia';
		let kondisi = 'Baru';
		let paNumber = null;
		let ticket = null;
		let catatan = null;
		let locationId = pick(kpBoxes).id;
		let exitDate = null;

		if (statusKind === 'digunakan_pa' || statusKind === 'digunakan_no_pa') {
			status = 'digunakan';
			kondisi = chance(0.2) ? 'Dismantle' : 'Baru';
			paSeq += 1;
			if (statusKind === 'digunakan_pa') paNumber = `PA/${year}/${pad(paSeq)}`;
			locationId = mitraBoxes.get(owner.id)?.id ?? locationId;
			exitDate = daysAgo(randInt(0, Math.max(1, entryDaysAgo - 1)));
		} else if (statusKind === 'rusak') {
			status = 'rusak';
			kondisi = 'Rusak';
			ticketSeq += 1;
			ticket = `TCK-${year}-${pad(ticketSeq)}`;
			catatan = pick([
				'Layar retak akibat benturan saat pengiriman.',
				'Tidak menyala setelah tegangan listrik tidak stabil.',
				'Port USB tidak berfungsi, perlu penggantian mainboard.',
				'Kerusakan fisik pada casing dan engsel.',
				'Printer macet permanen, unit roller aus.',
			]);
			locationId = pick(kpBoxes).id;
			exitDate = daysAgo(randInt(0, Math.max(1, entryDaysAgo - 1)));
		} else if (statusKind === 'hilang') {
			status = 'hilang';
			kondisi = 'Dismantle';
			paSeq += 1;
			paNumber = `PA/${year}/${pad(paSeq)}`;
			catatan = pick([
				'Tidak ditemukan saat stock opname bulanan.',
				'Diduga tertukar saat proses distribusi ke mitra.',
			]);
			locationId = mitraBoxes.get(owner.id)?.id ?? locationId;
			exitDate = daysAgo(randInt(0, Math.max(1, entryDaysAgo - 1)));
		}

		const item = await prisma.item.create({
			data: {
				serialNumber,
				modelId: model.id,
				status,
				kondisi,
				paNumber,
				ticket,
				catatan,
				locationId,
				entryDate,
				exitDate,
				createdById: owner.id,
				createdAt: entryDate,
				updatedAt: entryDate,
			},
			include: {
				model: { include: { brand: true, materialCategory: true } },
				location: true,
				createdBy: true,
			},
		});
		items.push({ ...item, statusKind, entryDaysAgo, ownerId: owner.id, isKp });
	}

	// Ledger ------------------------------------------------------------------
	console.log('📒 Membuat ledger mutasi 90 hari...');
	const mutationCounters = new Map();
	const nextMutationNumber = (prefix, date) => {
		const key = `${prefix}-${dayKey(date)}`;
		const next = (mutationCounters.get(key) ?? 0) + 1;
		mutationCounters.set(key, next);
		return `${prefix}-${dayKey(date)}-${pad(next)}`;
	};

	const snapshot = (item) => ({
		serialNumber: item.serialNumber,
		brand: item.model.brand.nama,
		category: item.model.materialCategory.nama,
		paNumber: item.paNumber ?? '',
		ticket: item.ticket ?? null,
	});

	const mutationRows = [];

	for (const item of items) {
		const base = snapshot(item);
		const destination = item.location;
		const destinationName = destination
			? (kpBoxLabels.get(destination.id) ?? destination.name)
			: null;

		// Barang masuk pertama kali.
		mutationRows.push({
			...base,
			itemId: item.id,
			userId: admin.id,
			type: item.statusKind === 'rusak' ? 'RUSAK' : 'MASUK',
			originLocationId: null,
			destinationLocationId: destination?.id ?? null,
			originLocationName: 'KP Tasikmalaya',
			destinationLocationName: destinationName,
			createdAt: item.entryDate,
			updatedAt: item.entryDate,
			requestId: null,
			mutationNumber: nextMutationNumber(
				item.statusKind === 'rusak' ? 'DMG' : 'IN',
				item.entryDate,
			),
		});

		// Keluar dari KP / rusak / hilang.
		if (item.exitDate) {
			const eventDate = item.exitDate;
			let type = 'KELUAR';
			let userId = admin.id;
			let originLocationId = item.locationId;
			let originLocationName = destinationName;
			let destinationLocationId = null;
			let destinationLocationName = null;

			if (item.statusKind === 'rusak') {
				type = 'RUSAK';
				destinationLocationName = item.ticket;
			} else if (item.statusKind === 'hilang') {
				type = 'HILANG';
				userId = item.ownerId;
			} else if (!item.isKp) {
				const kpBox = pick(kpBoxes);
				originLocationId = kpBox.id;
				originLocationName = kpBoxLabels.get(kpBox.id) ?? 'KP Tasikmalaya';
				destinationLocationId = item.locationId;
				destinationLocationName = mitraNameById.get(item.ownerId) ?? 'Lokasi Mitra';
			} else if (kpBoxLabels.has(originLocationId)) {
				originLocationName = kpBoxLabels.get(originLocationId);
			}

			mutationRows.push({
				...base,
				itemId: item.id,
				userId,
				type,
				originLocationId,
				destinationLocationId,
				originLocationName,
				destinationLocationName,
				createdAt: eventDate,
				updatedAt: eventDate,
				requestId: null,
				mutationNumber: nextMutationNumber(
					type === 'KELUAR' ? 'OUT' : type === 'RUSAK' ? 'DMG' : 'LST',
					eventDate,
				),
			});
		}
	}

	// Aktivitas tambahan agar grafik 30/90 hari tetap hidup (pindah/retur).
	const movableItems = items.filter((it) => it.statusKind === 'tersedia');
	for (let i = 0; i < 70; i += 1) {
		const item = pick(movableItems);
		const when = daysAgo(randInt(0, 89));
		const base = snapshot(item);
		const dest = pick(Array.from(mitraBoxes.values()));
		const outNumber = nextMutationNumber('OUT', when);
		mutationRows.push({
			...base,
			itemId: item.id,
			userId: admin.id,
			type: 'KELUAR',
			originLocationId: item.locationId,
			destinationLocationId: dest.id,
			originLocationName:
				kpBoxLabels.get(item.locationId) ?? item.location?.name ?? 'Rak A - Level 1',
			destinationLocationName: dest.name,
			createdAt: when,
			updatedAt: when,
			requestId: null,
			mutationNumber: outNumber,
		});
		const backAt = addDays(when, randInt(2, 12));
		if (backAt < NOW) {
			mutationRows.push({
				...base,
				itemId: item.id,
				userId: admin.id,
				type: 'MASUK',
				originLocationId: dest.id,
				destinationLocationId: item.locationId,
				originLocationName: dest.name,
				destinationLocationName: kpBoxLabels.get(item.locationId) ?? 'Rak A - Level 1',
				createdAt: backAt,
				updatedAt: backAt,
				requestId: null,
				mutationNumber: nextMutationNumber('IN', backAt),
			});
		}
	}

	await prisma.itemMutation.createMany({ data: mutationRows });

	// Requests ----------------------------------------------------------------
	console.log('📝 Membuat request, alokasi, dan BAST...');
	const requestPlan = [
		...Array.from({ length: 18 }, () => 'SELESAI'),
		...Array.from({ length: 6 }, () => 'MENUNGGU'),
		...Array.from({ length: 5 }, () => 'SIAP'),
		...Array.from({ length: 4 }, () => 'DITERIMA'),
		...Array.from({ length: 4 }, () => 'DITOLAK'),
		...Array.from({ length: 3 }, () => 'DIBATALKAN'),
		...Array.from({ length: 2 }, () => 'DISETUJUI'),
		...Array.from({ length: 2 }, () => 'SERAH'),
		...Array.from({ length: 1 }, () => 'DRAFT'),
	];

	// Stok tersedia KP yang bisa dialokasikan.
	const allocatable = items.filter((it) => it.isKp && it.status === 'tersedia');
	let allocIdx = 0;
	const allocatedOwner = new Map();

	// Jadwal request SELESAI dikunci per mitra supaya leaderboard dashboard
	// menampilkan variasi status (Fast / Steady / Slow / Idle / Not Enough Data).
	const completedSchedule = [
		...[
			[0, 12],
			[0, 19],
			[0, 26],
			[0, 33],
		],
		...[
			[1, 20],
			[1, 38],
			[1, 56],
		],
		...[
			[2, 10],
			[2, 45],
			[2, 80],
		],
		...[[3, 5]],
		...[
			[4, 2],
			[4, 8],
			[4, 14],
			[4, 20],
		],
		...[
			[5, 40],
			[5, 65],
			[5, 90],
		],
	].map(([mitraIndex, days]) => ({ mitraIndex, days }));
	let completedCursor = 0;

	const requestRows = [];
	let requestSeq = 0;
	let bastSeq = 0;

	for (const status of requestPlan) {
		requestSeq += 1;
		const completedSlot = status === 'SELESAI' ? completedSchedule[completedCursor++] : null;
		const requester = completedSlot ? mitras[completedSlot.mitraIndex] : pick(mitras);
		const isReturn = status !== 'DRAFT' && chance(0.18);
		const type = isReturn ? 'RETURN_RUSAK' : chance(0.16) ? 'INTER_MITRA' : 'OUTGOING';
		const provider =
			type === 'INTER_MITRA' ? pick(mitras.filter((m) => m.id !== requester.id)) : null;

		const requestedAt = completedSlot ? daysAgo(completedSlot.days) : daysAgo(randInt(0, 120));
		const approvedAt = ['MENUNGGU', 'DRAFT', 'DIBATALKAN'].includes(status)
			? null
			: addDays(requestedAt, randInt(1, 3));
		const processedAt = ['SIAP', 'DITERIMA', 'SELESAI', 'SERAH'].includes(status)
			? addDays(approvedAt ?? requestedAt, randInt(1, 2))
			: null;
		const shippedAt = ['DITERIMA', 'SELESAI', 'SERAH'].includes(status)
			? addDays(processedAt ?? approvedAt ?? requestedAt, randInt(1, 2))
			: null;
		const receivedAt = ['DITERIMA', 'SELESAI'].includes(status)
			? addDays(shippedAt ?? requestedAt, randInt(1, 3))
			: null;
		const completedAt =
			status === 'SELESAI' ? addDays(receivedAt ?? requestedAt, randInt(1, 3)) : null;

		const requestNumber = `REQ-${year}-${pad(requestSeq)}`;
		const request = await prisma.request.create({
			data: {
				requestNumber,
				requesterId: requester.id,
				destinationUserId:
					type === 'INTER_MITRA' ? requester.id : chance(0.25) ? requester.id : null,
				providerPartnerId: provider?.id ?? null,
				status,
				type,
				notes: pick([
					'Pengadaan rutin untuk kebutuhan operasional cabang.',
					'Permintaan penggantian unit yang sudah rusak.',
					'Kebutuhan proyek instalasi jaringan bulan ini.',
					'Permintaan tambahan untuk tim lapangan.',
					'',
				]),
				rejectionNotes:
					status === 'DITOLAK'
						? 'Stok tidak mencukupi dan prioritas dialihkan ke kebutuhan lain.'
						: status === 'DIBATALKAN'
							? 'Dibatalkan oleh mitra karena kebutuhan sudah terpenuhi.'
							: null,
				requestedAt,
				approvedAt,
				processedAt,
				shippedAt,
				receivedAt,
				completedAt,
				createdAt: requestedAt,
				updatedAt: receivedAt ?? processedAt ?? approvedAt ?? requestedAt,
			},
		});

		const itemCount = randInt(1, 2);
		const usedModels = new Set();
		const requestItems = [];
		for (let k = 0; k < itemCount; k += 1) {
			let model = pick(models);
			let guard = 0;
			while (usedModels.has(model.id) && guard < 10) {
				model = pick(models);
				guard += 1;
			}
			usedModels.add(model.id);
			requestItems.push(model);
		}

		const requestModelRows = requestItems.map((model) => ({ model, qty: randInt(1, 3) }));
		const allocationsByModel = new Map();
		if (['SIAP', 'DITERIMA', 'SELESAI'].includes(status)) {
			for (const row of requestModelRows) {
				const rows = [];
				while (rows.length < row.qty && allocIdx < allocatable.length) {
					const allocatedItem = allocatable[allocIdx];
					allocIdx += 1;
					rows.push(allocatedItem);
					allocatedOwner.set(allocatedItem.id, requester.id);
				}
				allocationsByModel.set(row.model.id, rows);
			}
		}

		for (const { model, qty } of requestModelRows) {
			const rows = allocationsByModel.get(model.id) ?? [];
			const serialNumber =
				type === 'RETURN_RUSAK'
					? `${model.brand.identifier}-${year}-${pad(randInt(1, 220))}`
					: null;

			const reqItem = await prisma.requestItem.create({
				data: {
					requestId: request.id,
					materialCategoryId: model.materialCategoryId,
					brandId: model.brandId,
					modelId: model.id,
					quantity: qty,
					fulfilledQuantity: rows.length,
					serialNumber,
					donorSerialNumbers:
						type === 'INTER_MITRA' && status === 'SELESAI'
							? rows.map((row) => row.serialNumber).join(',')
							: null,
					receiverSerialNumbers:
						type === 'INTER_MITRA' && status === 'SELESAI'
							? rows.map((row) => row.serialNumber).join(',')
							: null,
					donorScannedAt:
						type === 'INTER_MITRA' && status === 'SELESAI' ? shippedAt : null,
					receiverScannedAt:
						type === 'INTER_MITRA' && status === 'SELESAI' ? receivedAt : null,
					createdAt: requestedAt,
					updatedAt: requestedAt,
				},
			});

			for (const row of rows) {
				await prisma.requestAllocation.create({
					data: {
						requestItemId: reqItem.id,
						itemId: row.id,
						allocatedById: admin.id,
						allocatedAt: processedAt ?? approvedAt ?? requestedAt,
						createdAt: processedAt ?? approvedAt ?? requestedAt,
					},
				});
			}
		}

		// BAST untuk request yang sudah siap/berjalan/selesai.
		if (['SIAP', 'DITERIMA', 'SELESAI', 'DISETUJUI', 'SERAH'].includes(status)) {
			bastSeq += 1;
			const signed = status === 'SELESAI';
			const kpSigned = ['DITERIMA', 'SELESAI'].includes(status);
			const documentNumber = `BAST/${year}/${pad(bastSeq, 3)}`;
			const snapshotRows = requestModelRows.map(({ model }) => {
				const first = (allocationsByModel.get(model.id) ?? [])[0];
				return {
					materialNumber: model.code,
					materialName: model.deskripsi ?? model.nama,
					brandName: model.brand.nama,
					serialNumber: first?.serialNumber ?? '-',
					quantity: (allocationsByModel.get(model.id) ?? []).length || 1,
					unit: 'Unit',
					kondisi: 'Baik',
				};
			});

			await prisma.deliveryDocument.create({
				data: {
					requestId: request.id,
					documentNumber,
					generatedById: admin.id,
					generatedAt: processedAt ?? approvedAt ?? requestedAt,
					kpSignedAt: kpSigned ? (shippedAt ?? processedAt ?? requestedAt) : null,
					kpSignedById: kpSigned ? admin.id : null,
					kpName: kpSigned ? 'Rudi Hartono' : null,
					picSignedAt: signed ? (receivedAt ?? requestedAt) : null,
					picSignedById: signed ? requester.id : null,
					signerName: signed ? 'Budi Santoso' : null,
					signerSignatureUrl: signed
						? 'https://placehold.co/320x120/ffffff/111827?text=Tanda+Tangan'
						: null,
					driveViewUrl: signed
						? `https://drive.google.com/file/d/demo-${pad(bastSeq, 3)}/view`
						: null,
					itemsSnapshot: JSON.stringify(snapshotRows),
					createdAt: processedAt ?? approvedAt ?? requestedAt,
				},
			});
		}

		requestRows.push({ id: request.id, status, type, requester });
	}

	// Update item hasil alokasi agar konsisten dengan status "terdistribusi".
	for (const [itemId, ownerId] of allocatedOwner) {
		await prisma.item.update({
			where: { id: itemId },
			data: {
				status: 'digunakan',
				paNumber: null,
				locationId: mitraBoxes.get(ownerId)?.id,
				createdById: ownerId,
			},
		});
	}

	// Notifikasi --------------------------------------------------------------
	console.log('🔔 Membuat notifikasi...');
	const notifTemplates = [
		{
			type: 'STOCK_LOW',
			title: 'Stok menipis',
			message: 'Stok kategori Laptop berada di bawah safety stock.',
		},
		{
			type: 'STOCK_IN',
			title: 'Barang masuk',
			message: 'Batch penerimaan material baru telah tercatat di ledger.',
		},
		{
			type: 'REQUEST',
			title: 'Permintaan baru',
			message: 'Ada pengajuan material baru yang menunggu persetujuan.',
		},
		{
			type: 'STOCK_OUT',
			title: 'Barang keluar',
			message: 'Material telah diserahkan ke mitra dan tercatat pada ledger.',
		},
		{
			type: 'SYSTEM',
			title: 'Sinkronisasi selesai',
			message: 'Data inventaris berhasil disinkronkan dengan server.',
		},
	];

	const notifications = [];
	for (let i = 0; i < 18; i += 1) {
		const t = pick(notifTemplates);
		const target = chance(0.5) ? admin : pick(mitras);
		const when = daysAgo(randInt(0, 20));
		notifications.push({
			userId: target.id,
			title: t.title,
			message: t.message,
			type: t.type,
			isRead: chance(0.55),
			referenceType: t.type === 'REQUEST' ? 'USER' : null,
			referenceId: t.type === 'REQUEST' ? pick(mitras).id : null,
			createdAt: when,
			updatedAt: when,
		});
	}
	await prisma.notification.createMany({ data: notifications });

	// Recon -------------------------------------------------------------------
	console.log('📷 Membuat recon harian mitra...');
	const reconItems = items
		.filter((it) => !it.isKp && ['digunakan', 'tersedia'].includes(it.status))
		.slice(0, 42);
	const reconRows = [];
	for (const item of reconItems) {
		const days = randInt(1, 10);
		for (let d = 0; d < days; d += 1) {
			if (!chance(0.7)) continue;
			const date = daysAgo(d);
			reconRows.push({
				itemId: item.id,
				userId: item.ownerId,
				date: dateOnly(date),
				imageUrl: `https://placehold.co/640x480/1e293b/ffffff?text=Recon+${item.serialNumber}`,
				capturedAt: date,
				createdAt: date,
			});
		}
	}
	// Hindari bentrok unique [itemId, date] (hari yang sama bisa terpilih dua kali).
	const uniqueRecon = new Map();
	for (const row of reconRows) uniqueRecon.set(`${row.itemId}-${row.date}`, row);
	await prisma.reconRecord.createMany({ data: Array.from(uniqueRecon.values()) });

	// Ringkasan ---------------------------------------------------------------
	const [itemTotal, mutationTotal, requestTotal, notifTotal, reconTotal] = await Promise.all([
		prisma.item.count(),
		prisma.itemMutation.count(),
		prisma.request.count(),
		prisma.notification.count(),
		prisma.reconRecord.count(),
	]);

	console.log('\n✅ Seeding demo selesai');
	console.log(`   Item          : ${itemTotal}`);
	console.log(`   Mutasi/ledger : ${mutationTotal}`);
	console.log(`   Request       : ${requestTotal}`);
	console.log(`   Notifikasi    : ${notifTotal}`);
	console.log(`   Recon         : ${reconTotal}`);
	console.log('\n🔑 Login demo:');
	console.log('   ADMIN : admin / Admin123!');
	console.log('   MITRA : pt_tzu / Mitra123!');
}

main()
	.catch((e) => {
		console.error('❌ Gagal seeding demo:', e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
