/**
 * Konfigurasi aplikasi dibaca SEKALI di sini — tidak ada lagi
 * process.env tersebar di controller/service.
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
	if (isProduction) {
		throw new Error(
			'[config] JWT_SECRET wajib diset di production. Server menolak start dengan secret fallback.',
		);
	}
	console.warn(
		'[config] JWT_SECRET tidak diset — memakai fallback TIDAK AMAN. Hanya untuk development.',
	);
}

/**
 * Daftar origin yang diizinkan, dipisahkan koma pada env `CORS_ORIGINS`.
 * Kosong di production berarti tidak ada origin browser yang diizinkan
 * (klien desktop/mobile Tauri tidak mengirim Origin sehingga tetap lolos).
 */
const corsOrigins = (process.env.CORS_ORIGINS || '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

/**
 * Kredensial object storage tidak punya fallback: tanpa ini upload gambar akan
 * gagal 500 di runtime. Lebih baik gagal saat start di production.
 */
const STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY;
const STORAGE_SECRET_KEY = process.env.STORAGE_SECRET_KEY;
if (!STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
	if (isProduction) {
		throw new Error(
			'[config] STORAGE_ACCESS_KEY & STORAGE_SECRET_KEY wajib diset di production.',
		);
	}
	console.warn('[config] Kredensial object storage belum diset — upload gambar akan gagal.');
}

export const config = {
	env: NODE_ENV,
	isProduction,
	isTest,
	port: process.env.PORT || 3001,
	host: process.env.HOST || '0.0.0.0',
	jwtSecret: JWT_SECRET || 'fallback_secret',
	databaseUrl: process.env.DATABASE_URL || '',
	cors: {
		origins: corsOrigins,
		// Di luar production kita izinkan semua origin agar dev server Vite
		// (port acak / IP LAN) tidak perlu didaftarkan manual.
		allowAll: !isProduction,
	},
	http: {
		// 2mb cukup untuk payload JSON biasa; upload file punya route & limit sendiri.
		bodyLimit: process.env.BODY_LIMIT || '2mb',
		// Jumlah hop proxy tepercaya untuk menghitung IP klien (rate limit & log).
		trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0,
	},
	rateLimit: {
		enabled: process.env.RATE_LIMIT_DISABLED !== 'true',
		windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
		max: Number(process.env.RATE_LIMIT_MAX || 300),
		authMax: Number(process.env.RATE_LIMIT_AUTH_MAX || 10),
	},
	storage: {
		endPoint: process.env.STORAGE_ENDPOINT || 'localhost',
		port: parseInt(process.env.STORAGE_PORT || '9000', 10),
		useSSL: process.env.STORAGE_USE_SSL === 'true',
		region: process.env.STORAGE_REGION || 'us-east-1',
		accessKey: STORAGE_ACCESS_KEY,
		secretKey: STORAGE_SECRET_KEY,
		bucket: process.env.STORAGE_BUCKET || 'arxiva-images',
		publicUrl: process.env.STORAGE_PUBLIC_URL || '',
	},
};
