import prisma from '../../shared/prisma.js';
import { uploadImageToMinio } from '../../services/minio.service.js';

const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB

/**
 * Decode base64 data URL → Buffer + mimeType.
 * Mendukung "data:image/jpeg;base64,..." dan base64 polos.
 */
export function decodeImage(base64) {
	if (typeof base64 !== 'string' || base64.length === 0) return null;

	let mimeType = 'image/jpeg';
	let raw = base64;

	const dataUrlMatch = base64.match(/^data:([^;,]+);base64,(.+)$/s);
	if (dataUrlMatch) {
		mimeType = dataUrlMatch[1];
		raw = dataUrlMatch[2];
	} else if (base64.includes(',')) {
		// Mungkin ada prefix "data:image/...;base64," — ambil setelah koma jika ada.
		const idx = base64.indexOf(',');
		const s = base64.slice(0, idx);
		if (s.includes('base64')) {
			mimeType = s.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
			raw = base64.slice(idx + 1);
		}
	}

	try {
		const buffer = Buffer.from(raw, 'base64');
		if (buffer.length === 0) return null;
		return { buffer, mimeType };
	} catch {
		return null;
	}
}

/**
 * Validasi module `recon-progress`:
 * - item ada
 * - item dimiliki mitra (item.createdById === userId) → 403
 * - gambar tervalidasi & ≤ 1MB → 413
 *
 * Mengembalikan { ok: true, item } atau { ok: false, status, message }.
 */
export async function validateReconSubmission({ userId, itemId, image }) {
	if (!itemId) return { ok: false, status: 400, message: 'itemId wajib diisi' };

	const item = await prisma.item.findUnique({ where: { id: itemId } });
	if (!item) return { ok: false, status: 404, message: 'Item tidak ditemukan' };
	if (item.createdById !== userId) {
		return { ok: false, status: 403, message: 'Item bukan milik mitra ini' };
	}

	const decoded = decodeImage(image);
	if (!decoded) return { ok: false, status: 400, message: 'Gambar base64 tidak valid' };
	if (decoded.buffer.length > MAX_IMAGE_BYTES) {
		return { ok: false, status: 413, message: 'Ukuran foto melebihi batas 1MB' };
	}

	return { ok: true, item, decoded };
}

/**
 * Simpan satu record rekon (upsert per itemId + date).
 */
export async function upsertReconRecord({ userId, itemId, date, imageUrl }) {
	return prisma.reconRecord.upsert({
		where: { itemId_date: { itemId, date } },
		update: { imageUrl, userId },
		create: { itemId, userId, date, imageUrl },
	});
}

/**
 * Kelola payload `POST /recon-progress`: validasi → upload MinIO → upsert.
 */
export async function submitReconProgress({ userId, itemId, date, image }) {
	const validation = await validateReconSubmission({ userId, itemId, image });
	if (!validation.ok) return validation;

	const { decoded } = validation;

	const upload = await uploadImageToMinio({
		fileBuffer: decoded.buffer,
		originalName: `recon-${itemId}-${date}.jpg`,
		mimeType: decoded.mimeType,
		folder: 'recon',
	});

	const record = await upsertReconRecord({
		userId,
		itemId,
		date,
		imageUrl: upload.url,
	});

	return { ok: true, record };
}

/**
 * Persiapkan `imageUrl` untuk disimpan:
 * - data URL base64 → decode, batasi ≤1MB (413), upload MinIO
 * - URL http(s) eksisting → simpan apa adanya
 * Mengembalikan { ok: true, imageUrl } atau { ok: false, status, message }.
 */
export async function resolveImageUrlForStorage({ image, itemId, date, userId }) {
	const isDataUrl = typeof image === 'string' && image.startsWith('data:');
	if (!isDataUrl) {
		if (typeof image !== 'string' || !/^https?:\/\//.test(image)) {
			return { ok: false, status: 400, message: 'imageUrl tidak valid' };
		}
		return { ok: true, imageUrl: image };
	}

	const validation = await validateReconSubmission({ userId, itemId, image });
	if (!validation.ok) return validation;

	const { decoded } = validation;
	const upload = await uploadImageToMinio({
		fileBuffer: decoded.buffer,
		originalName: `recon-${itemId}-${date}.jpg`,
		mimeType: decoded.mimeType,
		folder: 'recon',
	});

	return { ok: true, imageUrl: upload.url };
}
