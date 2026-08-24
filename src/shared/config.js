/**
 * Konfigurasi aplikasi dibaca SEKALI di sini — tidak ada lagi
 * process.env tersebar di controller/service.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
if (!process.env.JWT_SECRET) {
	console.warn('[config] JWT_SECRET tidak diset — memakai fallback TIDAK AMAN untuk produksi.');
}

export const config = {
	port: process.env.PORT || 3001,
	host: process.env.HOST || 'localhost',
	jwtSecret: JWT_SECRET,
	databaseUrl: process.env.DATABASE_URL || '',
};
