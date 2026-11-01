import 'dotenv/config';
import { config } from './src/shared/config.js';
import { createApp } from './src/server.js';

const app = createApp();

const server = app.listen(config.port, config.host, () => {
	console.log(`Backend Server is running on port ${config.port} (${config.env})`);
});

/**
 * Shutdown rapi: berhenti menerima koneksi baru, lalu tutup koneksi DB.
 * Mencegah request terpotong saat container di-restart/deploy.
 */
let shuttingDown = false;
async function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[server] ${signal} diterima — mematikan server...`);

	server.close(async () => {
		try {
			const { default: prisma } = await import('./src/shared/prisma.js');
			await prisma.$disconnect();
		} catch (err) {
			console.error('[server] Gagal menutup koneksi Prisma', err);
		}
		process.exit(0);
	});

	// Jaring pengaman kalau koneksi menggantung.
	setTimeout(() => process.exit(1), 10_000).unref();
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
	process.on(signal, () => shutdown(signal));
});
