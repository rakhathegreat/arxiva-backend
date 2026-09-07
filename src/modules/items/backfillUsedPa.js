/**
 * Backfill nomor PA untuk material yang DIUPAKAI mitra.
 *
 * Latar belakang: sebelum ada kategori transaksi "Digunakan", alur pemakaian
 * material oleh mitra (barang keluar) mengirim kategori "Keluar". Akibatnya
 * path sinkron `paNumber` → item di `createTransaction` tidak pernah berjalan,
 * sehingga item terlanjur berstatus enum `digunakan` tapi `paNumber` kosong.
 * Karena `enumToDisplay` membedakan Digunakan vs Terdistribusi berdasar
 * `paNumber`, item tersebut keliru tampil sebagai "Terdistribusi" padahal
 * sudah dipakai.
 *
 * Ciri mutasi "dipakai mitra" (alur lama):
 *   - type KELUAR
 *   - dikerjakan user role MITRA
 *   - requestId kosong (distribusi via requestflow memiliki requestId)
 *   - nomor PA yang diketik tersimpan di `destinationLocationName`
 *
 * Fungsi ini MURNI (pure) agar mudah diuji dengan data dummy. Ia tidak
 * menyentuh database; hanya menghitung rencana backfill berdasar data yang
 * diberikan. Script prisma tinggal memanggil lalu mengaplikasikan hasilnya.
 *
 * Guard terhadap false-positive: kandidat PA yang ternyata sama dengan nama
 * entitas (nama mitra/owner, nama lokasi, nama brand) DITOLAK — bukan nomor PA.
 */

/**
 * @typedef {Object} ItemRow
 * @property {string} id
 * @property {string} serialNumber
 * @property {string} status
 * @property {string|null} paNumber
 */

/**
 * @typedef {Object} MutationRow
 * @property {string} id
 * @property {string} type
 * @property {string|null} requestId
 * @property {string} userId
 * @property {string} paNumber
 * @property {string|null} destinationLocationName
 * @property {number|string} createdAt
 */

/**
 * Mengambil nomor PA yang dipakai dari sebuah mutasi KELUAR mitra.
 * Nilai terbaik adalah `destinationLocationName` (PA yang diketik user di alur
 * lama). Jika kosong, pakai `paNumber` snapshot selama bukan merupakan nomor
 * mutasi sistem (OUT-/MUT-/IN-).
 *
 * @param {MutationRow} m
 * @param {Set<string>} knownNames  nama entitas (owner/lokasi/brand) — PA tak boleh sama
 * @returns {string|null}
 */
export function paFromMitraMutation(m, knownNames = new Set()) {
	const name = m.destinationLocationName?.trim();
	if (name && !knownNames.has(normalizeName(name))) return name;

	const pa = m.paNumber?.trim();
	if (!pa) return null;

	// Snapshot `paNumber` di alur lama diisi `nomor` transaksi (OUT-/MUT-…),
	// bukan PA asli. Jangan memakai nilai semacam itu sebagai PA.
	if (/^(OUT-|MUT-|IN-|INBOUND-)/i.test(pa)) return null;
	if (knownNames.has(normalizeName(pa))) return null;

	return pa;
}

function normalizeName(s) {
	return (s || '').trim().toLocaleLowerCase('id-ID');
}

/**
 * Menyusun daftar backfill: item berstatus `digunakan` tanpa paNumber yang
 * ternyata DIUPAKAI mitra (ada mutasi KELUAR mitra tanpa requestId).
 *
 * @param {ItemRow[]} items
 * @param {Record<string, MutationRow[]>} mutationsByItem  key = item id
 * @param {Record<string, {role: string}>} usersById  key = user id
 * @param {Object} [opts]
 * @param {Record<string, {ownerName?: string|null, locationName?: string|null, brandName?: string|null}>} [opts.itemContext]  per item, untuk guard nama entitas
 * @returns {Array<{item: ItemRow, paNumber: string}>} rencana backfill
 */
export function planUsedPaBackfill(items, mutationsByItem = {}, usersById = {}, opts = {}) {
	const result = [];

	for (const item of items) {
		if (item.status !== 'digunakan') continue;
		if (item.paNumber && item.paNumber.trim()) continue;

		const mutations = mutationsByItem[item.id] || [];
		const mitraUsage = mutations
			.filter((m) => {
				if (m.type !== 'KELUAR') return false;
				if (m.requestId) return false; // distribusi via requestflow
				const user = usersById[m.userId];
				return user?.role === 'MITRA';
			})
			.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

		const latest = mitraUsage[mitraUsage.length - 1];
		if (!latest) continue;

		const ctx = opts.itemContext?.[item.id] || {};
		const knownNames = new Set(
			[ctx.ownerName, ctx.locationName, ctx.brandName]
				.map(normalizeName)
				.filter(Boolean)
		);

		const pa = paFromMitraMutation(latest, knownNames);
		if (!pa) continue;

		result.push({ item, paNumber: pa });
	}

	return result;
}
