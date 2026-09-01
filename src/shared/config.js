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
	minio: {
		endPoint: process.env.MINIO_ENDPOINT || 'localhost',
		port: parseInt(process.env.MINIO_PORT || '9000', 10),
		useSSL: process.env.MINIO_USE_SSL === 'true',
		accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
		secretKey: process.env.MINIO_SECRET_KEY || 'minioadminpassword',
		bucket: process.env.MINIO_BUCKET || 'arxiva-images',
		publicUrl: process.env.MINIO_PUBLIC_URL || '',
	},
};
