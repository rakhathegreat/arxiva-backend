import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/**
 * Header keamanan standar. CSP hanya diaktifkan di production dan longgar
 * seperlunya agar Swagger UI + gambar hasil upload tetap bisa dimuat.
 * CORP dibuat cross-origin karena klien Tauri/webview memuat aset dari origin lain.
 */
export const securityHeaders = helmet({
	contentSecurityPolicy: config.isProduction
		? {
				directives: {
					defaultSrc: ["'self'"],
					scriptSrc: ["'self'", "'unsafe-inline'"],
					styleSrc: ["'self'", "'unsafe-inline'"],
					imgSrc: ["'self'", 'data:', 'blob:'],
					connectSrc: ["'self'"],
				},
			}
		: false,
	// HSTS hanya relevan lewat HTTPS; jangan sampai cache HSTS lokal saat dev.
	hsts: config.isProduction,
	crossOriginResourcePolicy: { policy: 'cross-origin' },
});

/**
 * CORS berbasis allowlist.
 * - Tidak ada header Origin (klien desktop/mobile Tauri, curl, server-server) → lolos.
 * - production: hanya origin pada `CORS_ORIGINS`.
 * - development: semua origin lolos supaya Vite dev server praktis.
 *
 * Origin yang ditolak TIDAK menghasilkan error 500 — request tetap diproses
 * tanpa header CORS, sehingga browser yang menolak (perilaku yang diinginkan).
 */
const corsOptions = {
	origin(origin, callback) {
		if (!origin) return callback(null, true);
		if (config.cors.allowAll) return callback(null, true);
		return callback(null, config.cors.origins.includes(origin));
	},
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	maxAge: 600,
};

export const corsMiddleware = cors(corsOptions);

const rateLimitOptions = {
	windowMs: config.rateLimit.windowMs,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	skip: () => !config.rateLimit.enabled || config.isTest,
	message: { message: 'Terlalu banyak permintaan. Coba lagi nanti.' },
};

/** Batas umum untuk seluruh API. */
export const apiRateLimiter = rateLimit({ ...rateLimitOptions, limit: config.rateLimit.max });

/**
 * Batas ketat untuk endpoint autentikasi (anti brute-force).
 * Login yang berhasil tidak dihitung, jadi user sah tidak terkunci.
 */
export const authRateLimiter = rateLimit({
	...rateLimitOptions,
	limit: config.rateLimit.authMax,
	skipSuccessfulRequests: true,
	message: { message: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
});

/** Fallback 404 untuk route yang tidak dikenal. */
export function notFoundHandler(req, res) {
	res.status(404).json({ message: `Route tidak ditemukan: ${req.method} ${req.originalUrl}` });
}

/**
 * Central error handler — jaring pengaman untuk error yang lolos dari controller.
 * Detail internal hanya dibocorkan saat bukan production.
 */
export function errorHandler(err, req, res, next) {
	const status = err.statusCode || err.status || 500;
	const isServerError = status >= 500;

	console.error(`[unhandled] ${req.method} ${req.originalUrl}`, err);

	if (res.headersSent) return next(err);

	const message =
		isServerError && config.isProduction
			? 'Internal server error'
			: err.message || 'Internal server error';

	res.status(status).json({
		message,
		...(err.code && !isServerError ? { reason: err.code } : {}),
	});
}
