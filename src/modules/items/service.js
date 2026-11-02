/**
 * Pemetaan status item display (Indonesia) ↔ enum Prisma (`Status`).
 * Satu definisi untuk seluruh controller — sebelumnya diduplikasi 3+ situs.
 */

const DISPLAY_TO_ENUM = new Map([
	['tersedia', 'tersedia'],
	['Tersedia', 'tersedia'],
	['digunakan', 'digunakan'],
	['Digunakan', 'digunakan'],
	['Diluar', 'digunakan'],
	['Keluar', 'digunakan'],
	['Terdistribusi', 'digunakan'],
	['rusak', 'rusak'],
	['Rusak', 'rusak'],
	['hilang', 'hilang'],
	['Hilang', 'hilang'],
]);

/** Display string → enum Status. Nilai tak dikenal → fallback. */
export function statusToEnum(display, fallback = 'tersedia') {
	if (!display) return fallback;
	return DISPLAY_TO_ENUM.get(display) ?? fallback;
}

/** Enum Status → display string untuk UI. `paNumber` membedakan Digunakan vs Terdistribusi. */
export function enumToDisplay(status, paNumber = null) {
	switch (status) {
		case 'digunakan':
			return paNumber ? 'Digunakan' : 'Terdistribusi';
		case 'rusak':
			return 'Rusak';
		case 'hilang':
			return 'Hilang';
		default:
			return 'Tersedia';
	}
}
