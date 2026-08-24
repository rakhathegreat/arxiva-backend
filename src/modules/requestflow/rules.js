/**
 * Aturan transisi status Request — PURE.
 * Satu definisi untuk seluruh pintu (endpoint status, sign-bast, signature-session).
 */

export const REQUEST_STATUSES = [
	'DRAFT',
	'MENUNGGU',
	'SIAP',
	'SELESAI',
	'DITOLAK',
	'DIBATALKAN',
];

/** Edge transisi yang sah menurut alur bisnis TASLIM. */
const ALLOWED_TRANSITIONS = new Set([
	'MENUNGGU->SIAP',
	'MENUNGGU->DITOLAK',
	'MENUNGGU->DIBATALKAN',
	'SIAP->SELESAI',
	'SIAP->DITOLAK',
	'SIAP->DIBATALKAN',
]);

/**
 * Validasi satu perpindahan status.
 * @returns {{ ok: true } | { ok: false, httpStatus: number, message: string }}
 */
export function validateTransition(from, to, role, requesterId, userId) {
	if (!REQUEST_STATUSES.includes(to)) {
		return { ok: false, httpStatus: 400, message: 'Invalid status' };
	}

	// RBAC
	const adminOnlyActions = ['SIAP', 'SELESAI', 'DITOLAK'];
	if (adminOnlyActions.includes(to) && role !== 'ADMIN') {
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
	if (!ALLOWED_TRANSITIONS.has(`${from}->${to}`)) {
		return {
			ok: false,
			httpStatus: 400,
			message: `Transisi status ${from} → ${to} tidak valid`,
		};
	}

	return { ok: true };
}
