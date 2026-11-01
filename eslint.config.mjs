import js from '@eslint/js';
import globals from 'globals';

/**
 * Konfigurasi ESLint backend (self-contained).
 */
export default [
	{
		ignores: [
			'node_modules/**',
			'coverage/**',
			'public/uploads/**',
			'src/generated/**',
			'prisma/generated/**',
		],
	},

	js.configs.recommended,

	{
		files: ['**/*.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: { ...globals.node },
		},
		rules: {
			'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'no-console': 'off',
		},
	},
];
