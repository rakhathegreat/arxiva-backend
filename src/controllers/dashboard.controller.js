import prisma from '../shared/prisma.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toDateKey = (date) => {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
};

const mitraDisplayName = (row) => row.profileNama || row.username || 'Unknown Mitra';

/**
 * Agregasi performa mitra berbasis SQL — menggantikan findMany penuh atas
 * seluruh request (graph) yang sebelumnya dikirim ke JS untuk dihitung.
 * Semantik dipertahankan identik: hanya request SELESAI milik role MITRA,
 * dengan first/last requestedAt, jumlah request & total quantity item.
 */
async function computeMitraPerformance() {
	const rows = await prisma.$queryRaw`
        SELECT
            r.requesterId AS requesterId,
            u.username AS username,
            p.nama AS profileNama,
            CAST(COUNT(DISTINCT r.id) AS SIGNED) AS requestCount,
            MIN(r.requestedAt) AS firstRequestAt,
            MAX(r.requestedAt) AS lastRequestAt,
            CAST(COALESCE(SUM(ri.quantity), 0) AS SIGNED) AS totalItems
        FROM \`Request\` r
        JOIN \`User\` u ON u.id = r.requesterId
        LEFT JOIN \`UserProfile\` p ON p.userId = u.id
        LEFT JOIN \`RequestItem\` ri ON ri.requestId = r.id
        WHERE r.status = 'SELESAI' AND u.role = 'MITRA'
        GROUP BY r.requesterId, u.username, p.nama
        ORDER BY COALESCE(NULLIF(p.nama, ''), u.username) ASC
    `;

	const now = new Date();

	return rows.map((row) => {
		const count = Number(row.requestCount);
		const totalItems = Number(row.totalItems);
		const firstRequestAt = new Date(row.firstRequestAt);
		const lastRequestAt = new Date(row.lastRequestAt);

		let averageLifespanDays = null;
		if (count > 1) {
			const diffDays = Math.ceil(Math.abs(lastRequestAt - firstRequestAt) / MS_PER_DAY);
			averageLifespanDays = diffDays / (count - 1);
		}

		const daysSinceLastRequest = Math.ceil(Math.abs(now - lastRequestAt) / MS_PER_DAY);
		const isIdleStock = daysSinceLastRequest > 30;

		let status = 'Not Enough Data';
		if (averageLifespanDays !== null) {
			if (averageLifespanDays < 10) status = 'Fast';
			else if (averageLifespanDays <= 25) status = 'Steady';
			else status = 'Slow';
		}
		if (isIdleStock) {
			status = 'Idle';
		}

		return {
			id: row.requesterId,
			name: mitraDisplayName(row),
			requestCount: count,
			totalItems,
			averageLifespanDays:
				averageLifespanDays !== null ? Number(averageLifespanDays.toFixed(2)) : null,
			daysSinceLastRequest,
			isIdleStock,
			status,
		};
	});
}

export const getMitraPerformance = async (req, res) => {
	try {
		const performanceData = await computeMitraPerformance();
		res.status(200).json({ data: performanceData });
	} catch (error) {
		console.error('Error in getMitraPerformance:', error);
		res.status(500).json({ error: 'Failed to fetch mitra performance data' });
	}
};

/**
 * Satu endpoint ringan untuk seluruh widget dashboard admin.
 * Semua agregasi dihitung server-side (GROUP BY / COUNT / SQL aggregate),
 * sehingga tidak ada lagi pengiriman tabel penuh ke klien tiap polling.
 */
export const getDashboardSummary = async (req, res) => {
	try {
		const [
			itemStatusRows,
			requestStatusRows,
			recentRequests,
			recentMutations,
			mitraItems,
			perDayRows,
			todayKeyRows,
			mitraPerformance,
		] = await Promise.all([
			// 1. Inventori: hitung per enum status.
			prisma.item.groupBy({
				by: ['status'],
				_count: { _all: true },
			}),

			// 2. Ringkasan request: hitung per status.
			prisma.request.groupBy({
				by: ['status'],
				_count: { _all: true },
			}),

			// 3. 5 request terbaru (semua status) untuk tabel Request Masuk.
			prisma.request.findMany({
				orderBy: { requestedAt: 'desc' },
				take: 5,
				select: {
					id: true,
					requestNumber: true,
					status: true,
					requestedAt: true,
					requester: {
						select: {
							username: true,
							profile: { select: { nama: true, partnerType: true } },
						},
					},
					requestItems: { select: { quantity: true } },
				},
			}),

			// 4. 10 aktivitas mutasi terbaru.
			prisma.itemMutation.findMany({
				orderBy: { createdAt: 'desc' },
				take: 10,
				select: {
					id: true,
					type: true,
					serialNumber: true,
					createdAt: true,
					user: {
						select: {
							role: true,
							username: true,
							profile: { select: { nama: true } },
						},
					},
				},
			}),

			// 5. Distribusi aset per mitra — hanya kolom yang dibutuhkan
			//    (tanpa include model/location/recon yang mahal).
			prisma.item.findMany({
				select: {
					status: true,
					paNumber: true,
					createdBy: {
						select: {
							role: true,
							username: true,
							profile: { select: { nama: true } },
						},
					},
				},
			}),

			// 6. Deret harian transaksi 90 hari terakhir (MASUK/KELUAR per hari).
			// Prisma menulis timestamp dalam UTC → bandingkan/format dengan
			// UTC_DATE() agar konsisten dengan tanggal tersimpan (bukan timezone DB).
			prisma.$queryRaw`
                SELECT
                    DATE_FORMAT(createdAt, '%Y-%m-%d') AS dateKey,
                    type AS type,
                    CAST(COUNT(*) AS SIGNED) AS count
                FROM \`ItemMutation\`
                WHERE createdAt >= DATE_SUB(UTC_DATE(), INTERVAL 89 DAY)
                GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d'), type
                ORDER BY dateKey ASC
            `,

			// Tanggal UTC terakhir sebagai anchor deret.
			prisma.$queryRaw`
                SELECT DATE_FORMAT(UTC_DATE(), '%Y-%m-%d') AS todayKey
            `,

			// 7. KPI performa mitra (idle stock, leaderboard, tabel produktivitas).
			computeMitraPerformance(),
		]);

		// ── Inventori ────────────────────────────────────────────────
		const itemCountByStatus = new Map(
			itemStatusRows.map((r) => [r.status, r._count._all]),
		);
		const totalItems = itemStatusRows.reduce((acc, r) => acc + r._count._all, 0);
		const inventoryStats = {
			totalItems,
			tersedia: itemCountByStatus.get('tersedia') ?? 0,
			diluar: itemCountByStatus.get('digunakan') ?? 0,
			rusak: itemCountByStatus.get('rusak') ?? 0,
			hilang: itemCountByStatus.get('hilang') ?? 0,
		};

		// ── Ringkasan request ────────────────────────────────────────
		const requestCountByStatus = new Map(
			requestStatusRows.map((r) => [r.status, r._count._all]),
		);
		const requestCounts = {
			menunggu: requestCountByStatus.get('MENUNGGU') ?? 0,
			siap: requestCountByStatus.get('SIAP') ?? 0,
		};

		// ── Request terbaru ──────────────────────────────────────────
		const recentRequestsMapped = recentRequests.map((r) => ({
			id: r.id,
			requestNumber: r.requestNumber || '-',
			requesterName:
				r.requester?.profile?.nama || r.requester?.username || 'Unknown',
			partnerCategory: r.requester?.profile?.partnerType || '',
			status: r.status,
			requestedAt: r.requestedAt,
			itemsCount: r.requestItems.reduce(
				(acc, item) => acc + item.quantity,
				0,
			),
		}));

		// ── Aktivitas terbaru ────────────────────────────────────────
		const recentActivity = recentMutations.map((t) => ({
			id: t.id,
			type: t.type,
			serialNumber: t.serialNumber || '-',
			mitra:
				t.user?.role === 'ADMIN'
					? 'KP Tasikmalaya'
					: t.user?.profile?.nama ||
						t.user?.username ||
						'KP Tasikmalaya',
			createdAt: t.createdAt,
		}));

		// ── Distribusi aset per mitra ────────────────────────────────
		// Penentu utama: nomor PA. Punya PA = Terpakai, tanpa PA = Tersedia.
		const mitraMap = new Map();
		for (const item of mitraItems) {
			const rawMitra =
				item.createdBy?.role === 'ADMIN'
					? 'KP Tasikmalaya'
					: item.createdBy?.profile?.nama ||
						item.createdBy?.username ||
						'';
			const mitra = rawMitra.trim() || 'Lainnya';
			if (!mitraMap.has(mitra)) {
				mitraMap.set(mitra, { mitra, tersedia: 0, terpakai: 0 });
			}
			const current = mitraMap.get(mitra);
			if (item.paNumber) {
				current.terpakai += 1;
			} else {
				current.tersedia += 1;
			}
		}
		const mitraDistribution = Array.from(mitraMap.values())
			.map((entry) => ({
				...entry,
				total: entry.tersedia + entry.terpakai,
			}))
			.filter((entry) => entry.mitra !== 'KP Tasikmalaya')
			.sort((a, b) => b.total - a.total);

		// ── Deret harian transaksi (90 hari, anchor ke hari ini) ─────
		const perDay = new Map();
		for (const row of perDayRows) {
			if (!perDay.has(row.dateKey)) {
				perDay.set(row.dateKey, { masuk: 0, keluar: 0 });
			}
			const bucket = perDay.get(row.dateKey);
			if (row.type === 'MASUK') bucket.masuk = Number(row.count);
			else if (row.type === 'KELUAR') bucket.keluar = Number(row.count);
		}
		const todayKey = todayKeyRows?.[0]?.todayKey;
		const todayStart = todayKey ? new Date(`${todayKey}T00:00:00`) : new Date();
		const seriesStart = addDays(todayStart, -89);
		const transactionSeries = [];
		for (let day = 0; day < 90; day += 1) {
			const date = addDays(seriesStart, day);
			const dateKey = toDateKey(date);
			const bucket = perDay.get(dateKey);
			transactionSeries.push({
				date: dateKey,
				masuk: bucket?.masuk ?? 0,
				keluar: bucket?.keluar ?? 0,
			});
		}

		res.status(200).json({
			data: {
				inventoryStats,
				mitraDistribution,
				requestCounts,
				recentRequests: recentRequestsMapped,
				recentActivity,
				transactionSeries,
				mitraPerformance,
			},
		});
	} catch (error) {
		console.error('Error in getDashboardSummary:', error);
		res.status(500).json({ error: 'Failed to fetch dashboard summary' });
	}
};