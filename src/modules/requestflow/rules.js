/**
 * Aturan transisi status Request — PURE.
 * Satu definisi untuk seluruh pintu (endpoint status, sign-bast, signature-session).
 */

export const REQUEST_STATUSES = [
	'DRAFT',
	'MENUNGGU',
	'SIAP',
	'DISETUJUI',
	'SERAH',
	'SELESAI',
	'DITOLAK',
	'DIBATALKAN',
];

/** Edge transisi yang sah menurut alur bisnis TASLIM — flow OUTGOING (barang keluar). */
const ALLOWED_TRANSITIONS_OUTGOING = new Set([
	'MENUNGGU->SIAP',
	'MENUNGGU->DITOLAK',
	'MENUNGGU->DIBATALKAN',
	'SIAP->SELESAI',
	'SIAP->DITOLAK',
	'SIAP->DIBATALKAN',
]);

/** Edge transisi alur RETURN_RUSAK (mitra mengembalikan material rusak ke KP). */
const ALLOWED_TRANSITIONS_RETURN_RUSAK = new Set([
	'MENUNGGU->DISETUJUI',
	'MENUNGGU->DITOLAK',
	'MENUNGGU->DIBATALKAN',
	'DISETUJUI->SERAH',
	'DISETUJUI->DIBATALKAN',
	'SERAH->SELESAI',
	'SERAH->DIBATALKAN',
]);

/** Edge transisi alur INTER_MITRA: MENUNGGU → DISETUJUI (admin) → SERAH (scan
 * pemberi) → SELESAI (scan penerima). DITOLAK/DIBATALKAN tersedia di tiap tahap. */
const ALLOWED_TRANSITIONS_INTER_MITRA = new Set([
	'MENUNGGU->DISETUJUI',
	'MENUNGGU->DITOLAK',
	'MENUNGGU->DIBATALKAN',
	'DISETUJUI->SERAH',
	'DISETUJUI->DIBATALKAN',
	'SERAH->SELESAI',
	'SERAH->DIBATALKAN',
]);

const TRANSITIONS_BY_TYPE = {
	OUTGOING: ALLOWED_TRANSITIONS_OUTGOING,
	RETURN_RUSAK: ALLOWED_TRANSITIONS_RETURN_RUSAK,
	INTER_MITRA: ALLOWED_TRANSITIONS_INTER_MITRA,
};

const ADMIN_ONLY_OUTGOING = new Set(['SIAP', 'SELESAI', 'DITOLAK']);

/** Status yang hanya boleh ditetapkan ADMIN untuk RETURN_RUSAK/INTER_MITRA. */
const ADMIN_ONLY_APPROVAL = new Set(['DISETUJUI', 'DITOLAK']);

/**
 * Validasi satu perpindahan status.
 * @param {string} from
 * @param {string} to
 * @param {string} role
 * @param {string} requesterId
 * @param {string} userId
 * @param {string} [requestType='OUTGOING']
 * @param {string|null} [providerPartnerId=null] — mitra pemberi (INTER_MITRA)
 * @returns {{ ok: true } | { ok: false, httpStatus: number, message: string }}
 */
export function validateTransition(
	from,
	to,
	role,
	requesterId,
	userId,
	requestType = 'OUTGOING',
	providerPartnerId = null
) {
	if (!REQUEST_STATUSES.includes(to)) {
		return { ok: false, httpStatus: 400, message: 'Invalid status' };
	}

	const transitions = TRANSITIONS_BY_TYPE[requestType] ?? ALLOWED_TRANSITIONS_OUTGOING;

	// State per-tipe: DISETUJUI/SERAH hanya bermakna untuk RETURN_RUSAK/INTER_MITRA.
	if (!['RETURN_RUSAK', 'INTER_MITRA'].includes(requestType) && (to === 'DISETUJUI' || to === 'SERAH')) {
		return {
			ok: false,
			httpStatus: 400,
			message: `Status ${to} hanya berlaku untuk tipe request RETURN_RUSAK atau INTER_MITRA`,
		};
	}

	// RBAC
	if (requestType === 'RETURN_RUSAK' || requestType === 'INTER_MITRA') {
		if (ADMIN_ONLY_APPROVAL.has(to) && role !== 'ADMIN') {
			return {
				ok: false,
				httpStatus: 403,
				message:
					requestType === 'INTER_MITRA'
						? 'Hanya admin yang dapat menyetujui atau menolak permintaan antar mitra'
						: 'Hanya admin yang dapat menyetujui atau menolak pengajuan material rusak',
			};
		}
		if (to === 'SERAH' && requestType === 'RETURN_RUSAK' && role === 'ADMIN') {
			return {
				ok: false,
				httpStatus: 403,
				message: 'Hanya mitra pemilik yang dapat menandai penyerahan material rusak',
			};
		}
		if (to === 'SERAH' && requestType === 'RETURN_RUSAK' && role === 'MITRA' && userId !== requesterId) {
			return {
				ok: false,
				httpStatus: 403,
				message: 'Hanya mitra pemilik yang dapat menandai penyerahan material rusak',
			};
		}
		if (to === 'SERAH' && requestType === 'INTER_MITRA' && role !== 'ADMIN' && userId !== providerPartnerId) {
			return {
				ok: false,
				httpStatus: 403,
				message: 'Hanya mitra pemberi yang dapat menandai penyerahan barang antar mitra',
			};
		}
		if (to === 'SELESAI' && requestType === 'RETURN_RUSAK' && role !== 'ADMIN') {
			return {
				ok: false,
				httpStatus: 403,
				message: 'Hanya admin yang dapat menyelesaikan pengajuan material rusak',
			};
		}
		if (to === 'SELESAI' && requestType === 'INTER_MITRA' && role !== 'ADMIN' && userId !== requesterId) {
			return {
				ok: false,
				httpStatus: 403,
				message: 'Hanya mitra penerima yang dapat mengonfirmasi selesai serah terima',
			};
		}
	} else if (ADMIN_ONLY_OUTGOING.has(to) && role !== 'ADMIN') {
		return {
			ok: false,
			httpStatus: 403,
			message: 'Hanya admin yang dapat menyiapkan, menyelesaikan, atau menolak request',
		};
	}

	if (to === 'DIBATALKAN' && role !== 'ADMIN' && userId !== requesterId) {
		return {
			ok: false,
			httpStatus: 403,
			message: 'Anda hanya dapat membatalkan request milik sendiri',
		};
	}

	// Urutan transisi
	if (!transitions.has(`${from}->${to}`)) {
		return {
			ok: false,
			httpStatus: 400,
			message: `Transisi status ${from} → ${to} tidak valid`,
		};
	}

	return { ok: true };
}
