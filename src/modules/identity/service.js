import prisma from '../../shared/prisma.js';

/**
 * Lookup user oleh username / nama profil mitra. Lookup-only — TIDAK membuat user.
 */
export async function findUserByName(mitra) {
	if (!mitra || mitra === 'KP Tasikmalaya') return null;
	return prisma.user.findFirst({
		where: { OR: [{ username: mitra }, { profile: { nama: mitra } }] },
	});
}

/**
 * Temukan user role ADMIN (KP Tasikmalaya). Dipakai untuk memindahkan
 * ownership material berstatus Rusak kembali ke KP, apa pun aktornya.
 */
export async function findKpAdmin() {
	return prisma.user.findFirst({ where: { role: 'ADMIN' } });
}

/**
 * Resolve aktor untuk atribusi data.
 * Prioritas: req.user (selalu ada di route ter-autentikasi) → lookup mitra → admin pertama.
 * Melempar error ber-status bila tidak ada kandidat — TIDAK lagi menciptakan
 * user `admin_default` ber-password plaintext.
 */
export async function resolveActorId(mitra, reqUser) {
	if (reqUser && reqUser.id) return reqUser.id;

	const matched = await findUserByName(mitra);
	if (matched) return matched.id;

	const firstAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
	if (firstAdmin) return firstAdmin.id;

	throw Object.assign(new Error('Tidak ada pengguna valid untuk dikaitkan dengan data ini'), {
		statusCode: 400,
	});
}
