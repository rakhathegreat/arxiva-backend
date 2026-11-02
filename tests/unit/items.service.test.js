import { describe, it, expect } from 'vitest';
import { statusToEnum, enumToDisplay } from '../../src/modules/items/service.js';

describe('statusToEnum', () => {
	it.each([
		['Tersedia', 'tersedia'],
		['Diluar', 'digunakan'],
		['Keluar', 'digunakan'],
		['Digunakan', 'digunakan'],
		['Terdistribusi', 'digunakan'],
		['Rusak', 'rusak'],
		['Hilang', 'hilang'],
	])('%s → %s', (display, expected) => {
		expect(statusToEnum(display)).toBe(expected);
	});

	it('nilai tak dikenal → fallback', () => {
		expect(statusToEnum('Aneh', 'tersedia')).toBe('tersedia');
		expect(statusToEnum(undefined, 'digunakan')).toBe('digunakan');
	});
});

describe('enumToDisplay', () => {
	it('digunakan + paNumber → Digunakan', () => {
		expect(enumToDisplay('digunakan', 'PA-1')).toBe('Digunakan');
	});

	it('digunakan tanpa paNumber → Terdistribusi', () => {
		expect(enumToDisplay('digunakan', null)).toBe('Terdistribusi');
	});

	it.each([
		['tersedia', 'Tersedia'],
		['rusak', 'Rusak'],
		['hilang', 'Hilang'],
	])('%s → %s', (en, display) => {
		expect(enumToDisplay(en)).toBe(display);
	});
});
