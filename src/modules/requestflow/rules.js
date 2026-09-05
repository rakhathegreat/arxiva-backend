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

const TRANSITIONS_BY_TYPE = {
	OUTGOING: ALLOWED_TRANSITIONS_OUTGOING,
	RETURN_RUSAK: ALLOWED_TRANSITIONS_RETURN_RUSAK,
};

const ADMIN_ONLY_OUTGOING = new Set(['SIAP', 'SELESAI', 'DITOLAK']);

/**
 * Validasi satu perpindahan status.
 * @param {string} from
 * @param {string} to
 * @param {string} role
 * @param {string} requesterId
 * @param {string} userId
 * @param {string} [requestType='OUTGOING']
 * @returns {{ ok: true } | { ok: false, httpStatus: number, message: string }}
 */
export function validateTransition(from, to, role, requesterId, userId, requestType = 'OUTGOING') {
	if (!REQUEST_STATUSES.includes(to)) {
		return { ok: false, httpStatus: 400, message: 'Invalid status' };
	}

	const transitions = TRANSITIONS_BY_TYPE[requestType] ?? ALLOWED_TRANSITIONS_OUTGOING;

	// State per-tipe: DISETUJUI/SERAH hanya bermakna untuk RETURN_RUSAK.
	if (requestType !== 'RETURN_RUSAK' && (to === 'DISETUJUI' || to === 'SERAH')) {
		return {
			ok: false,
			httpStatus: 400,
			message: `Status ${to} hanya berlaku untuk tipe request RETURN_RUSAK`,
		};
	}

	// RBAC
	if (requestType === 'RETURN_RUSAK') {
		if (to === 'DISETUJUI' && role !== 'ADMIN') {
			return {
				ok: false,
				httpStatus: 403,
				message: 'Hanya admin yang dapat menyetujui pengajuan material rusak',
			};
		}
		if (to === 'SERAH' && role === 'ADMIN') {
			return {
				ok: false,
				httpStatus: 403,
				message: 'Hanya mitra pemilik yang dapat menandai penyerahan material rusak',
			};
		}
		if (to === 'SERAH' && role === 'MITRA' && userId !== requesterId) {
			return {
				ok: false,
				httpStatus: 403,
				message: 'Hanya mitra pemilik yang dapat menandai penyerahan material rusak',
			};
		}
		if (to === 'SELESAI' && role !== 'ADMIN') {
			return {
				ok: false,
				httpStatus: 403,
				message: 'Hanya admin yang dapat menyelesaikan pengajuan material rusak',
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
