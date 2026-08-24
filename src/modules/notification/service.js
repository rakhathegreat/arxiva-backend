import prisma from '../../shared/prisma.js';

const db = (tx) => tx ?? prisma;

/**
 * Satu pintu penulisan notifikasi. Tidak ada lagi penulisan notifikasi
 * dari controller lain atau dari client (endpoint generik sudah dihapus).
 *
 * @param {object} data
 * @param {string} data.userId - penerima
 * @param {string} data.title
 * @param {string} data.message
 * @param {string} [data.type] - salah satu NotificationType (default SYSTEM)
 * @param {string} [data.referenceId]
 * @param {string} [data.referenceType]
 */
export async function createNotification(data, tx = null) {
	const { userId, title, message, type = 'SYSTEM', referenceId = null, referenceType = null } = data;
	if (!userId || !title || !message) {
		throw Object.assign(new Error('userId, title, dan message wajib untuk notifikasi'), {
			statusCode: 400,
		});
	}
	return db(tx).notification.create({
		data: { userId, title, message, type, isRead: false, referenceId, referenceType },
	});
}

/**
 * Kirim notifikasi ke seluruh ADMIN aktif.
 * @returns {Promise<number>} jumlah notifikasi terkirim
 */
export async function notifyAdmins(data, tx = null) {
	const admins = await db(tx).user.findMany({
		where: { role: 'ADMIN', isAktif: true },
		select: { id: true },
	});
	for (const admin of admins) {
		await createNotification({ ...data, userId: admin.id }, tx);
	}
	return admins.length;
}
