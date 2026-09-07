/**
 * Aturan validasi intake — PURE (tanpa IO).
 * Sumber kebenaran: spec `material-intake` + port semantik dari
 * `arxiva-frontend/src/features/barang-masuk/utils/validators.ts`.
 * Saran di client, hukum di server.
 */

export const REJECT = {
	MISSING_SERIAL: 'MISSING_SERIAL',
	DUPLICATE_SN_IN_BATCH: 'DUPLICATE_SN_IN_BATCH',
	SN_REGISTERED: 'SN_REGISTERED',
	INVALID_SN_FOR_DISMANTLE: 'INVALID_SN_FOR_DISMANTLE',
	MODEL_REQUIRED_FOR_BARU: 'MODEL_REQUIRED_FOR_BARU',
	PA_REQUIRED_FOR_DISMANTLE: 'PA_REQUIRED_FOR_DISMANTLE',
	TICKET_REQUIRED_FOR_RUSAK: 'TICKET_REQUIRED_FOR_RUSAK',
	CATEGORY_REQUIRED: 'CATEGORY_REQUIRED',
	BRAND_REQUIRED: 'BRAND_REQUIRED',
	INVALID_MITRA_SOURCE: 'INVALID_MITRA_SOURCE',
	INVALID_CONDITION: 'INVALID_CONDITION',
	REQUEST_NOT_FOUND: 'REQUEST_NOT_FOUND',
	REQUEST_INVALID_TYPE: 'REQUEST_INVALID_TYPE',
	REQUEST_NOT_APPROVED: 'REQUEST_NOT_APPROVED',
	REQUEST_NOT_OWNED: 'REQUEST_NOT_OWNED',
	CAPACITY_FULL: 'CAPACITY_FULL',
};

export const CONDITIONS = ['Baru', 'Dismantle', 'Rusak'];

export const normalizeSn = (code) => String(code ?? '').trim().toUpperCase();

const normalizeOwner = (owner) => (owner || '').trim().toLocaleLowerCase('id-ID');

/**
 * Validasi bentuk + field kondisional satu item. Tanpa akses DB.
 * @returns {string|null} reject code, atau null bila lolos
 */
export function validateInboundItem(raw) {
	const sn = normalizeSn(raw.serialNumber);
	if (!sn) return REJECT.MISSING_SERIAL;

	const kondisi = raw.kondisi;
	if (!CONDITIONS.includes(kondisi)) return REJECT.INVALID_CONDITION;

	if (kondisi === 'Baru' && !raw.tipe) return REJECT.MODEL_REQUIRED_FOR_BARU;
	if (kondisi === 'Dismantle' && !raw.paNumber) return REJECT.PA_REQUIRED_FOR_DISMANTLE;
	if (kondisi === 'Rusak' && !raw.ticket) return REJECT.TICKET_REQUIRED_FOR_RUSAK;

	return null;
}

/**
 * Port `isValidMitraInboundSource` (frontend) ke sisi server.
 * @param {object} existingLike snapshot item existing dari DB:
 *   { statusEnum, locationName, parentName, ownerDisplay }
 * @param {string} mitraName nama tampilan user MITRA yang login
 * @returns {boolean}
 */
export function isMitraInboundAllowed(existingLike, mitraName) {
	if (!existingLike) return false;

	const owner = normalizeOwner(existingLike.ownerDisplay);
	const statusDisplay = String(
		existingLike.statusEnum === 'digunakan'
			? (existingLike.paNumber ? 'Digunakan' : 'Terdistribusi')
			: existingLike.statusEnum === 'rusak'
				? 'Rusak'
				: existingLike.statusEnum === 'hilang'
					? 'Hilang'
					: 'Tersedia'
	).trim().toLocaleLowerCase('id-ID');
	const locName = String(existingLike.locationName || '').trim().toLocaleLowerCase('id-ID');

	const isOutbound =
		statusDisplay === 'keluar' ||
		statusDisplay === 'diluar' ||
		statusDisplay === 'terdistribusi' ||
		locName === 'keluar' ||
		locName === 'diluar';

	if (!isOutbound) return false;
	if (locName === 'keluar' || locName === 'diluar') return true;

	const m = normalizeOwner(mitraName);
	return (
		owner === m ||
		owner === normalizeOwner('KP Tasikmalaya') ||
		owner === normalizeOwner('KP') ||
		owner === ''
	);
}

/**
 * Nomor transaksi berurutan harian: IN-YYYYMMDD-NNNN
 * @param {string} lastMutationNumber nomor IN- terakhir hari ini (atau null)
 */
export function nextInboundNumber(lastMutationNumber, now = new Date()) {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	const prefix = `IN-${y}${m}${d}-`;
	let seq = 1;
	if (lastMutationNumber && lastMutationNumber.startsWith(prefix)) {
		seq = parseInt(lastMutationNumber.slice(prefix.length), 10) + 1;
	}
	return `${prefix}${String(seq).padStart(4, '0')}`;
}
