import prisma from '../shared/prisma.js';
import { generateBastPdfStream, generateAndSaveBastPdf } from '../services/pdf.service.js';
import {
	releaseAllocations,
	buildAllocationSnapshot,
	resolveAdminIdentity,
	completeRequest,
} from '../modules/requestflow/requestflow.service.js';
import { validateTransition } from '../modules/requestflow/rules.js';
import { ensureDeliveryDocument, finalizeDeliveryDocument } from '../modules/bastdoc/service.js';
import { createNotification } from '../modules/notification/service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GET /requests
export const getRequests = async (req, res) => {
    try {
        const { type } = req.query || {};
        const where = {};
        if (type === 'inter-partner' || type === 'inter_mitra' || type === 'INTER_MITRA') {
            where.type = 'INTER_MITRA';
        } else if (type && type.toUpperCase() !== 'ALL') {
            where.type = type.toUpperCase();
        } else {
            // Default (tanpa type / type=all) = permintaan ke admin/KP;
            // permintaan antar mitra dipisah dan hanya muncul lewat type=inter-partner.
            where.type = { not: 'INTER_MITRA' };
        }

        const requests = await prisma.request.findMany({
            where,
            include: {
                requester: { include: { profile: true } },
                destinationUser: { include: { profile: true } },
                providerPartner: { include: { profile: true } },
                requestItems: {
                    include: {
                        materialCategory: true,
                        brand: true,
                        model: true,
                        allocations: true
                    }
                },
                deliveryDocument: {
                    select: {
                        kpSignedById: true,
                        picSignedById: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Format for frontend
        const formatted = requests.map(r => ({
            id: r.id,
            requestNumber: r.requestNumber,
            requesterId: r.requesterId || null,
            requesterName: r.requester?.profile?.nama || r.requester?.username || "Unknown",
            partnerCategory: r.requester?.profile?.partnerType || "Mitra",
            destinationUserId: r.destinationUserId || null,
            destinationName: r.destinationUser
                ? (r.destinationUser.profile?.nama || r.destinationUser.username)
                : null,
            destination: r.destinationUser || null,
            providerPartnerId: r.providerPartnerId || null,
            providerName: r.providerPartner
                ? (r.providerPartner.profile?.nama || r.providerPartner.username)
                : null,
            providerPartner: r.providerPartner || null,
            status: r.status,
            type: r.type,
            notes: r.notes || "-",
            rejectionNotes: r.rejectionNotes || null,
            adminRemarks: r.rejectionNotes || null,
            requestedAt: r.requestedAt,
            itemsCount: r.requestItems.reduce((acc, item) => acc + item.quantity, 0),
            allocatedCount: r.requestItems.reduce(
                (acc, item) => acc + (item.allocations?.length || item.fulfilledQuantity || 0),
                0
            ),
            itemsDetail: r.requestItems.map(item => `${item.materialCategory.nama} (${item.quantity})`).join(", "),
            requestItems: r.requestItems.map(item => ({
                id: item.id,
                category: item.materialCategory.nama,
                brand: item.brand?.nama || "-",
                model: item.model?.nama || "-",
                quantity: item.quantity,
                serialNumber: item.serialNumber || null,
                donorSerialNumbers: item.donorSerialNumbers || null,
                receiverSerialNumbers: item.receiverSerialNumbers || null
            })),
            deliveryDocument: r.deliveryDocument ? {
                kpSignedById: r.deliveryDocument.kpSignedById,
                picSignedById: r.deliveryDocument.picSignedById,
                driveViewUrl: r.deliveryDocument.driveViewUrl || null
            } : null
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Error in getRequests:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /requests/:id
export const getRequestById = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await prisma.request.findUnique({
            where: { id },
            include: {
                requester: { include: { profile: true } },
                destinationUser: { include: { profile: true } },
                requestItems: {
                    include: {
                        materialCategory: true,
                        brand: true,
                        model: true,
                        allocations: {
                            include: {
                                item: {
                                    include: {
                                        model: {
                                            include: {
                                                brand: true,
                                                materialCategory: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                deliveryDocument: true
            }
        });
        if (!request) return res.status(404).json({ message: 'Request not found' });
        res.json(request);
    } catch (error) {
        console.error('Error in getRequestById:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /requests
export const createRequest = async (req, res) => {
    try {
        const { requesterId, notes, items, destinationUserId, type, providerPartnerId, isInterPartner } = req.body;
        const isInterMitra = isInterPartner === true || Boolean(providerPartnerId);
        const requestType = isInterMitra
            ? 'INTER_MITRA'
            : type === 'RETURN_RUSAK' ? 'RETURN_RUSAK' : 'OUTGOING';

        // Tujuan request (opsional) = mitra lain yang akan menerima barang pinjaman.
        // Hanya boleh menunjuk mitra aktif yang ada, dan bukan dirinya sendiri.
        if (destinationUserId) {
            if (destinationUserId === requesterId) {
                return res.status(400).json({ message: 'Tujuan tidak boleh sama dengan pemohon' });
            }
            const destination = await prisma.user.findUnique({
                where: { id: destinationUserId },
                select: { id: true, role: true, isAktif: true }
            });
            if (!destination || destination.role !== 'MITRA' || !destination.isAktif) {
                return res.status(400).json({ message: 'Tujuan request harus merupakan mitra yang aktif' });
            }
        }

        // INTER_MITRA: mitra pemberi wajib, aktif, dan bukan pemohon sendiri.
        if (requestType === 'INTER_MITRA') {
            if (!providerPartnerId || providerPartnerId === requesterId) {
                return res.status(400).json({ message: 'Mitra pemberi (provider) wajib diisi dan tidak boleh sama dengan pemohon' });
            }
            const provider = await prisma.user.findUnique({
                where: { id: providerPartnerId },
                select: { id: true, role: true, isAktif: true }
            });
            if (!provider || provider.role !== 'MITRA' || !provider.isAktif) {
                return res.status(400).json({ message: 'Mitra pemberi harus merupakan mitra yang aktif' });
            }
        }

        const requestCount = await prisma.request.count();
        const requestNumber = `REQ-${new Date().getFullYear()}-${String(requestCount + 1).padStart(4, '0')}`;

        const newRequest = await prisma.request.create({
            data: {
                requestNumber,
                type: requestType,
                requesterId,
                destinationUserId: destinationUserId || null,
                providerPartnerId: requestType === 'INTER_MITRA' ? providerPartnerId : null,
                notes,
                requestItems: {
                    create: items.map(item => ({
                        materialCategoryId: item.materialCategoryId,
                        brandId: item.brandId || null,
                        modelId: item.modelId || null,
                        quantity: item.quantity,
                        serialNumber: requestType === 'RETURN_RUSAK' ? (item.serialNumber || null) : undefined
                    }))
                }
            },
            include: {
                requester: { include: { profile: true } },
                destinationUser: { include: { profile: true } },
                providerPartner: { include: { profile: true } },
                requestItems: { include: { materialCategory: true, brand: true, model: true } }
            }
        });

        if (requestType === 'INTER_MITRA') {
            await createNotification(
                {
                    userId: providerPartnerId,
                    title: 'Permintaan material antar mitra',
                    message: `${requestNumber}: ${newRequest.requester?.profile?.nama || 'Mitra'} meminta material dari mitra Anda dan menunggu persetujuan admin.`,
                    type: 'REQUEST',
                    referenceId: newRequest.id,
                }
            );
        }

        res.status(201).json({ message: 'Request created successfully', request: newRequest });
    } catch (error) {
        console.error('Error in createRequest:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /requests/:id/allocate
export const allocateItems = async (req, res) => {
    try {
        const { id } = req.params;
        const { itemIds } = req.body;
        const user = req.user;

        if (user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Hanya admin yang dapat mengalokasikan barang' });
        }

        const request = await prisma.request.findUnique({
            where: { id },
            include: { requestItems: true }
        });

        if (!request || (request.status !== 'MENUNGGU' && request.status !== 'SIAP')) {
            return res.status(400).json({ message: 'Request tidak valid atau belum bisa dialokasi' });
        }

        await prisma.$transaction(async (tx) => {
            // Reset existing allocations for this request to make this operation idempotent
            await releaseAllocations(tx, request);
            request.requestItems.forEach(ri => ri.fulfilledQuantity = 0);

            for (const itemId of itemIds) {
                const item = await tx.item.findUnique({
                    where: { id: itemId },
                    include: { model: true }
                });

                if (!item || item.status !== 'tersedia') {
                    throw new Error(`Item ${itemId} tidak tersedia atau tidak ada.`);
                }

                // Temukan requestItem yang cocok berdasarkan kategori
                let reqItem = request.requestItems.find(ri => ri.materialCategoryId === item.model.materialCategoryId);

                // Jika tidak ada, buat RequestItem baru (Auto-inject)
                if (!reqItem) {
                    reqItem = await tx.requestItem.create({
                        data: {
                            requestId: id,
                            materialCategoryId: item.model.materialCategoryId,
                            brandId: item.model.brandId,
                            modelId: item.model.id,
                            quantity: 0, // 0 karena ini tambahan di luar wishlist awal
                            fulfilledQuantity: 0
                        }
                    });
                    // Tambahkan ke array agar tidak dibuat berulang kali untuk barang sejenis
                    request.requestItems.push(reqItem);
                }

                await tx.requestAllocation.create({
                    data: {
                        requestItemId: reqItem.id,
                        itemId,
                        allocatedById: user.id
                    }
                });

                await tx.requestItem.update({
                    where: { id: reqItem.id },
                    data: { fulfilledQuantity: { increment: 1 } }
                });
            }
        });

        // Komposisi berubah → sinkronkan BAST draft bila sudah terbit (status SIAP).
        if (request.status === 'SIAP') {
            try {
                await regenerateDraftBast(id, user);
            } catch (draftErr) {
                console.error('Gagal meregenerasi BAST draft:', draftErr);
            }
        }

        res.json({ message: 'Alokasi berhasil' });
    } catch (error) {
        console.error('Error in allocateItems:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Double booking: Salah satu barang sudah dialokasikan ke request lain.' });
        }
        res.status(error.code === "CAPACITY_FULL" ? 409 : 500).json({ message: error.message || "Internal server error" });
    }
};


/** Regenerasi PDF BAST draft + snapshot alokasi terkini (dipanggil saat SIAP
 *  maupun setelah komposisi alokasi berubah selama status masih SIAP). */
async function regenerateDraftBast(requestId, user) {
    const { name: adminName, signatureUrl: adminSigUrl } = await resolveAdminIdentity({
        actingAdmin: user,
    });

    const reqFull = await prisma.request.findUnique({
        where: { id: requestId },
        include: {
            requester: { include: { profile: true } },
            requestItems: {
                include: {
                    materialCategory: true,
                    brand: true,
                    model: true,
                    allocations: {
                        include: {
                            item: {
                                include: {
                                    model: { include: { brand: true, materialCategory: true } }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    const itemsSnapshotData = buildAllocationSnapshot(reqFull);

    const ptName = reqFull.requester?.profile?.nama || reqFull.requester?.username || 'PT / Mitra';

    const draftBastData = {
        id: reqFull.id,
        requestNumber: reqFull.requestNumber,
        title: reqFull.title,
        status: 'SIAP',
        notes: reqFull.notes,
        requestedAt: reqFull.requestedAt,
        processedAt: new Date(),
        completedAt: null,
        partnerType: reqFull.requester?.profile?.partnerType || 'gangguan',
        requesterName: ptName,
        picName: ptName,
        picSignatureUrl: null, // Unsigned Draft
        generatedByName: adminName,
        kpSignatureUrl: adminSigUrl,
        allocations: itemsSnapshotData
    };

    const draftFilename = `bast-draft-${reqFull.requestNumber}.pdf`;
    const { relativeFilePath } = await generateAndSaveBastPdf(draftBastData, draftFilename);

    await prisma.deliveryDocument.upsert({
        where: { requestId: requestId },
        create: {
            requestId: requestId,
            documentNumber: `BAST/REQ/${reqFull.requestNumber}`,
            filePath: relativeFilePath,
            kpName: adminName,
            kpSignatureUrl: adminSigUrl,
            kpSignedAt: new Date(),
            itemsSnapshot: JSON.stringify(itemsSnapshotData),
            generatedById: user.id
        },
        update: {
            filePath: relativeFilePath,
            kpName: adminName,
            kpSignatureUrl: adminSigUrl,
            itemsSnapshot: JSON.stringify(itemsSnapshotData)
        }
    });
}

/**
 * Hasilkan BAST draft saat admin menyetujui (DISETUJUI) pengajuan material rusak
 * (RETURN_RUSAK) atau permintaan antar mitra (INTER_MITRA). Item diambil dari
 * requestItems (bukan alokasi), karena pengembalian rusak / antar mitra tidak
 * melalui alokasi keluar admin.
 * @param {string} requestId
 * @param {object} user
 * @param {'RETURN_RUSAK'|'INTER_MITRA'} flow
 */
async function regenerateApprovalDraftBast(requestId, user, flow) {
    const isReturnRusak = flow === 'RETURN_RUSAK';
    const isInterMitra = flow === 'INTER_MITRA';
    const { name: adminName, signatureUrl: adminSigUrl } = await resolveAdminIdentity({
        actingAdmin: user,
    });

    const reqFull = await prisma.request.findUnique({
        where: { id: requestId },
        include: {
            requester: { include: { profile: true } },
            providerPartner: { include: { profile: true } },
            requestItems: {
                include: {
                    materialCategory: true,
                    brand: true,
                    model: { include: { brand: true } },
                },
            },
        },
    });

    const itemsSnapshotData = reqFull.requestItems.map((ri) => {
        const brandName = ri.model?.brand?.name || ri.brand?.nama || null;
        return {
            materialNumber: ri.model?.code || '-',
            materialName: ri.model?.deskripsi || ri.model?.nama || ri.materialCategory.nama || '-',
            brandName,
            serialNumber: ri.serialNumber || '-',
            quantity: ri.quantity,
            unit: 'Unit',
            kondisi: isReturnRusak ? 'Rusak' : 'Baik',
        };
    });

    const ptName = reqFull.requester?.profile?.nama || reqFull.requester?.username || 'PT / Mitra';

    const returnBastData = {
        id: reqFull.id,
        requestNumber: reqFull.requestNumber,
        title: reqFull.title,
        status: 'DISETUJUI',
        notes: reqFull.notes,
        requestedAt: reqFull.requestedAt,
        processedAt: new Date(),
        completedAt: null,
        partnerType: reqFull.requester?.profile?.partnerType || 'gangguan',
        requesterName: ptName,
        picName: ptName,
        picSignatureUrl: null, // Unsigned sampai penyerahan (SERAH)
        generatedByName: adminName,
        kpSignatureUrl: adminSigUrl,
        allocations: itemsSnapshotData,
        // INTER_MITRA: mitra pemberi ikut dicantumkan sebagai konteks transaksi
        providerName: isInterMitra
            ? (reqFull.providerPartner?.profile?.nama || reqFull.providerPartner?.username || null)
            : null,
    };

    const draftFilename = isReturnRusak
        ? `bast-rusak-${reqFull.requestNumber}.pdf`
        : `bast-mitra-${reqFull.requestNumber}.pdf`;
    const { relativeFilePath } = await generateAndSaveBastPdf(returnBastData, draftFilename);

    await prisma.deliveryDocument.upsert({
        where: { requestId: requestId },
        create: {
            requestId: requestId,
            documentNumber: `BAST/REQ/${reqFull.requestNumber}`,
            filePath: relativeFilePath,
            kpName: adminName,
            kpSignatureUrl: adminSigUrl,
            kpSignedAt: new Date(),
            itemsSnapshot: JSON.stringify(itemsSnapshotData),
            generatedById: user.id
        },
        update: {
            filePath: relativeFilePath,
            kpName: adminName,
            kpSignatureUrl: adminSigUrl,
            itemsSnapshot: JSON.stringify(itemsSnapshotData)
        }
    });
}
export const updateRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejectionNotes } = req.body;
        const user = req.user;

        const validStatuses = ['DRAFT', 'MENUNGGU', 'SIAP', 'DISETUJUI', 'SERAH', 'SELESAI', 'DITOLAK', 'DIBATALKAN'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const request = await prisma.request.findUnique({
            where: { id },
            include: { requestItems: { include: { allocations: true } } }
        });

        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (request.status === 'SELESAI') {
            if (status === 'SELESAI') {
                return res.json({ message: 'Request sudah SELESAI (Idempotent)', request });
            }
            return res.status(400).json({ message: 'Request sudah SELESAI dan dikunci. Data maupun status tidak dapat diubah lagi.' });
        }

        // RBAC + urutan transisi — satu aturan di modul requestflow
        const transition = validateTransition(
            request.status,
            status,
            user.role,
            request.requesterId,
            user.id,
            request.type,
            request.providerPartnerId
        );
        if (!transition.ok) {
            return res.status(transition.httpStatus).json({ message: transition.message });
        }

        const isReturnRusak = request.type === 'RETURN_RUSAK';
        const isInterMitra = request.type === 'INTER_MITRA';

        const dataToUpdate = { status };
        const now = new Date();
        if (['DITOLAK', 'DIBATALKAN'].includes(status)) {
            dataToUpdate.rejectionNotes = rejectionNotes || null;
        }
        if (status === 'SIAP') {
            dataToUpdate.approvedAt = now;
            dataToUpdate.processedAt = now;
        }
        if ((isReturnRusak || isInterMitra) && status === 'DISETUJUI') {
            dataToUpdate.approvedAt = now;
            dataToUpdate.processedAt = now;
        }
        if ((isReturnRusak || isInterMitra) && status === 'SERAH') {
            dataToUpdate.shippedAt = now;
        }
        if (status === 'SELESAI') dataToUpdate.completedAt = now;

        // Auto-generate / perbarui BAST Draft saat status menjadi SIAP (keluar)
        // atau DISETUJUI (pengajuan material rusak / permintaan antar mitra)
        if (status === 'SIAP') {
            await regenerateDraftBast(id, user);
        } else if (status === 'DISETUJUI' && (isReturnRusak || isInterMitra)) {
            await regenerateApprovalDraftBast(id, user, isInterMitra ? 'INTER_MITRA' : 'RETURN_RUSAK');
        }

        if (status === 'SELESAI') {
            const updated = await prisma.$transaction(async (tx) => {
                // SATU jalur completion (per-tipe): keluar = transfer item + ledger
                // KELUAR; material rusak = verifikasi pengiriman lalu finalisasi status.
                return completeRequest(tx, request, user);
            });
            return res.json({ message: 'Request status updated and items mutated', request: updated });
        } else if (['DITOLAK', 'DIBATALKAN'].includes(status)) {
            const updated = await prisma.$transaction(async (tx) => {
                await releaseAllocations(tx, request);
                const updatedReq = await tx.request.update({
                    where: { id },
                    data: dataToUpdate,
                    include: { requester: { include: { profile: true } } }
                });

                // Event: penolakan/pembatalan → notify requester
                await createNotification(
                    {
                        userId: request.requesterId,
                        title: status === 'DITOLAK' ? 'Permintaan ditolak' : 'Permintaan dibatalkan',
                        message: `Permintaan ${request.requestNumber} ${status === 'DITOLAK' ? 'ditolak' : 'dibatalkan'}.${
                            rejectionNotes ? ` Catatan: ${rejectionNotes}` : ''
                        }`,
                        type: 'REQUEST',
                        referenceId: request.id,
                    },
                    tx
                );

                return updatedReq;
            });
            return res.json({ message: 'Request status updated and allocations released', request: updated });
        } else {
            const updated = await prisma.request.update({
                where: { id },
                data: dataToUpdate,
                include: { requester: { include: { profile: true } } }
            });
            return res.json({ message: 'Request status updated', request: updated });
        }
    } catch (error) {
        console.error('Error in updateRequestStatus:', error);
        if (error.code === "RETURN_RUSAK_INCOMPLETE") {
            return res.status(409).json({ message: error.message, reason: error.code });
        }
        res.status(error.code === "CAPACITY_FULL" ? 409 : 500).json({ message: error.message || "Internal server error" });
    }
};

// PUT /peminjaman-mitra/:id/scan
// Alur antar mitra dua tahap:
//   scanParty="provider" → simpan donorSerialNumbers, buat RequestAllocation,
//                          status DISETUJUI → SERAH
//   scanParty="receiver" → verifikasi SN yang diterima cocok dengan donor,
//                          status SERAH → SELESAI (transfer via completeRequest)
export const scanInterPartnerItems = async (req, res) => {
    try {
        const { id } = req.params;
        const { scanParty, items } = req.body;
        const user = req.user;

        if (!['provider', 'receiver'].includes(scanParty)) {
            return res.status(400).json({ message: 'scanParty harus "provider" atau "receiver"' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'Daftar item hasil scan wajib diisi' });
        }

        const request = await prisma.request.findUnique({
            where: { id },
            include: {
                requester: { include: { profile: true } },
                providerPartner: { include: { profile: true } },
                requestItems: { include: { allocations: true } },
            },
        });

        if (!request) return res.status(404).json({ message: 'Request tidak ditemukan' });
        if (request.type !== 'INTER_MITRA') {
            return res.status(400).json({ message: 'Endpoint scan hanya untuk permintaan antar mitra' });
        }

        const normalize = (s) => String(s || '').trim().toUpperCase();
        const now = new Date();
        const isProviderScan = scanParty === 'provider';

        // RBAC + transisi: provider scan = DISETUJUI→SERAH; receiver scan = SERAH→SELESAI
        const targetStatus = isProviderScan ? 'SERAH' : 'SELESAI';
        const transition = validateTransition(
            request.status,
            targetStatus,
            user.role,
            request.requesterId,
            user.id,
            request.type,
            request.providerPartnerId
        );
        if (!transition.ok) {
            return res.status(transition.httpStatus).json({ message: transition.message });
        }

        if (isProviderScan) {
            // Lokasi mitra pemberi — sumber barang yang diserahkan
            const providerLoc = await prisma.userLocation.findFirst({
                where: { userId: request.providerPartnerId },
                include: { location: true },
            });
            if (!providerLoc) {
                return res.status(400).json({ message: 'Mitra pemberi belum memiliki lokasi penyimpanan' });
            }
            const providerLocationId = providerLoc.locationId;

            await prisma.$transaction(async (tx) => {
                const riById = new Map(request.requestItems.map((ri) => [ri.id, ri]));

                for (const scan of items) {
                    const requestItemId = scan.requestItemId || scan.id;
                    const ri = riById.get(requestItemId);
                    if (!ri) {
                        throw Object.assign(new Error(`Detail barang ${requestItemId} bukan bagian dari request ini`), { code: 'SCAN_MISMATCH' });
                    }

                    const rawSns = Array.isArray(scan.serialNumbers)
                        ? scan.serialNumbers
                        : String(scan.donorSerialNumber || scan.receiverSerialNumber || '').split(',').filter(Boolean);
                    const sns = rawSns.map(normalize).filter(Boolean);

                    if (sns.length !== ri.quantity) {
                        throw Object.assign(
                            new Error(`Jumlah SN hasil scan (${sns.length}) tidak sama dengan kuantitas permintaan (${ri.quantity}) untuk ${ri.materialCategory?.nama || ri.id}`),
                            { code: 'SCAN_MISMATCH' }
                        );
                    }

                    const foundItems = await tx.item.findMany({
                        where: { serialNumber: { in: sns } },
                        include: { model: true },
                    });
                    if (foundItems.length !== sns.length) {
                        const missing = sns.filter((sn) => !foundItems.some((it) => normalize(it.serialNumber) === sn));
                        throw Object.assign(new Error(`Barang dengan SN ${missing.join(', ')} tidak ditemukan`), { code: 'SCAN_MISMATCH' });
                    }

                    for (const item of foundItems) {
                        if (item.model?.materialCategoryId !== ri.materialCategoryId) {
                            throw Object.assign(new Error(`SN ${item.serialNumber} bukan kategori barang yang diminta`), { code: 'SCAN_MISMATCH' });
                        }
                        if (item.locationId !== providerLocationId) {
                            throw Object.assign(new Error(`SN ${item.serialNumber} tidak berada di lokasi mitra pemberi`), { code: 'SCAN_MISMATCH' });
                        }
                    }

                    const foundIds = new Set(foundItems.map((it) => it.id));
                    const doubleBooked = await tx.requestAllocation.findFirst({
                        where: { itemId: { in: [...foundIds] }, requestItem: { requestId: { not: request.id } } },
                        include: { requestItem: true },
                    });
                    if (doubleBooked) {
                        throw Object.assign(new Error('Salah satu barang sudah dialokasikan ke request lain'), { code: 'SCAN_MISMATCH' });
                    }

                    await tx.requestAllocation.deleteMany({ where: { requestItemId: ri.id } });
                    await tx.requestAllocation.createMany({
                        data: foundItems.map((item) => ({
                            requestItemId: ri.id,
                            itemId: item.id,
                            allocatedById: user.id,
                        })),
                    });

                    await tx.requestItem.update({
                        where: { id: ri.id },
                        data: {
                            donorSerialNumbers: sns.join(','),
                            donorScannedAt: now,
                            fulfilledQuantity: sns.length,
                        },
                    });
                }

                await tx.request.update({
                    where: { id: request.id },
                    data: { status: 'SERAH', shippedAt: now },
                });
            });

            await createNotification({
                userId: request.requesterId,
                title: 'Barang diserahkan mitra pemberi',
                message: `Permintaan ${request.requestNumber} telah diserahkan oleh ${
                    request.providerPartner?.profile?.nama || 'mitra pemberi'
                }. Silakan verifikasi dan scan barang yang diterima.`,
                type: 'REQUEST',
                referenceId: request.id,
            });

            return res.json({ message: 'Scan mitra pemberi berhasil, barang siap diserahkan', request });
        }

        // — Receiver scan (SELESAI) —
        const updated = await prisma.$transaction(async (tx) => {
            const riById = new Map(request.requestItems.map((ri) => [ri.id, ri]));

            for (const scan of items) {
                const requestItemId = scan.requestItemId || scan.id;
                const ri = riById.get(requestItemId);
                if (!ri) {
                    throw Object.assign(new Error(`Detail barang ${requestItemId} bukan bagian dari request ini`), { code: 'SCAN_MISMATCH' });
                }
                if (!ri.donorSerialNumbers) {
                    throw Object.assign(new Error(`Barang ${ri.materialCategory?.nama || ri.id} belum di-scan oleh mitra pemberi`), { code: 'SCAN_MISMATCH' });
                }

                const rawSns = Array.isArray(scan.serialNumbers)
                    ? scan.serialNumbers
                    : String(scan.receiverSerialNumber || scan.donorSerialNumber || '').split(',').filter(Boolean);
                const receivedSns = rawSns.map(normalize).filter(Boolean);
                const donorSns = ri.donorSerialNumbers.split(',').map(normalize).filter(Boolean);

                const donorSet = new Set(donorSns);
                const mismatch = receivedSns.filter((sn) => !donorSet.has(sn));
                const missing = donorSns.filter((sn) => !receivedSns.includes(sn));
                if (mismatch.length > 0 || missing.length > 0) {
                    throw Object.assign(
                        new Error(`Barang yang diterima tidak cocok dengan serah dari pemberi (Lain: ${mismatch.join(', ') || '-'}, Kurang: ${missing.join(', ') || '-'})`),
                        { code: 'SCAN_MISMATCH' }
                    );
                }

                await tx.requestItem.update({
                    where: { id: ri.id },
                    data: {
                        receiverSerialNumbers: receivedSns.join(','),
                        receiverScannedAt: now,
                    },
                });
            }

            // Transfer + finalisasi SELESAI — satu jalur completion requestflow
            return completeRequest(tx, request, user);
        });

        await createNotification({
            userId: request.providerPartnerId,
            title: 'Serah terima antar mitra selesai',
            message: `Serah terima ${request.requestNumber} telah dikonfirmasi selesai oleh ${
                request.requester?.profile?.nama || 'mitra penerima'
            }. Barang kini menjadi milik mitra peminta.`,
            type: 'REQUEST',
            referenceId: request.id,
        });

        return res.json({ message: 'Scan mitra penerima berhasil, serah terima selesai', request: updated });
    } catch (error) {
        console.error('Error in scanInterPartnerItems:', error);
        if (error.code === 'SCAN_MISMATCH' || error.code === 'P2002') {
            return res.status(400).json({ message: error.message });
        }
        res.status(error.code === "CAPACITY_FULL" ? 409 : 500).json({ message: error.message || 'Internal server error' });
    }
};

// GET /requests/:id/bast
export const downloadBast = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const request = await prisma.request.findUnique({
            where: { id },
            include: {
                requester: { include: { profile: true } },
                requestItems: {
                    include: {
                        materialCategory: true,
                        brand: true,
                        model: true,
                        allocations: {
                            include: {
                                item: {
                                    include: {
                                        model: {
                                            include: {
                                                brand: true,
                                                materialCategory: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                deliveryDocument: {
                    include: { generatedBy: { include: { profile: true } } }
                }
            }
        });

        if (!request) {
            return res.status(404).json({ message: 'Request tidak ditemukan' });
        }

        // Proteksi: Hanya Admin atau Mitra Pemohon yang boleh mengakses BAST
        if (user.role !== 'ADMIN' && user.id !== request.requesterId) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke dokumen BAST ini' });
        }

        // Hanya bisa generate BAST untuk status SIAP atau SELESAI
        // (material rusak / antar mitra: DISETUJUI / SERAH / SELESAI)
        if (request.type === 'RETURN_RUSAK' || request.type === 'INTER_MITRA') {
            if (!['DISETUJUI', 'SERAH', 'SELESAI'].includes(request.status)) {
                return res.status(400).json({ message: 'BAST hanya tersedia untuk request berstatus DISETUJUI, SERAH, atau SELESAI' });
            }
        } else if (!['SIAP', 'SELESAI'].includes(request.status)) {
            return res.status(400).json({ message: 'BAST hanya tersedia untuk request berstatus SIAP atau SELESAI' });
        }

        // Auto-create DeliveryDocument jika belum ada — satu pintu modul bastdoc
        let deliveryDocument = await ensureDeliveryDocument({
            requestId: request.id,
            requestNumber: request.requestNumber,
            generatedById: user.id,
        });
        deliveryDocument = await prisma.deliveryDocument.findUnique({
            where: { requestId: request.id },
            include: { generatedBy: { include: { profile: true } } },
        });

        res.json({
            message: 'Data BAST berhasil dimuat',
            document: deliveryDocument,
            request: {
                id: request.id,
                requestNumber: request.requestNumber,
                status: request.status,
                notes: request.notes,
                requestedAt: request.requestedAt,
                processedAt: request.processedAt,
                completedAt: request.completedAt,
                requesterName: request.requester?.profile?.nama || request.requester?.username || 'Unknown',
                generatedByName: deliveryDocument.generatedBy?.profile?.picName || deliveryDocument.generatedBy?.profile?.nama || deliveryDocument.generatedBy?.username || 'Admin',
                allocations: buildAllocationSnapshot(request)
            }
        });
    } catch (error) {
        console.error('Error in downloadBast:', error);
        res.status(error.code === "CAPACITY_FULL" ? 409 : 500).json({ message: error.message || "Internal server error" });
    }
};

// GET /requests/:id/bast-pdf
export const downloadBastPdf = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const request = await prisma.request.findUnique({
            where: { id },
            include: {
                requester: { include: { profile: true } },
                requestItems: {
                    include: {
                        materialCategory: true,
                        brand: true,
                        model: true,
                        allocations: {
                            include: {
                                item: {
                                    include: {
                                        model: {
                                            include: {
                                                brand: true,
                                                materialCategory: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                deliveryDocument: {
                    include: { generatedBy: { include: { profile: true } } }
                }
            }
        });

        if (!request) {
            return res.status(404).json({ message: 'Request tidak ditemukan' });
        }

        // Proteksi: Hanya Admin atau Mitra Pemohon yang boleh mengakses BAST
        if (user.role !== 'ADMIN' && user.id !== request.requesterId) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke dokumen BAST ini' });
        }

        // Hanya bisa generate BAST untuk status SIAP atau SELESAI
        // (material rusak / antar mitra: DISETUJUI / SERAH / SELESAI)
        if (request.type === 'RETURN_RUSAK' || request.type === 'INTER_MITRA') {
            if (!['DISETUJUI', 'SERAH', 'SELESAI'].includes(request.status)) {
                return res.status(400).json({ message: 'BAST hanya tersedia untuk request berstatus DISETUJUI, SERAH, atau SELESAI' });
            }
        } else if (!['SIAP', 'SELESAI'].includes(request.status)) {
            return res.status(400).json({ message: 'BAST hanya tersedia untuk request berstatus SIAP atau SELESAI' });
        }

        // Auto-create DeliveryDocument jika belum ada — satu pintu modul bastdoc
        let deliveryDocument = await ensureDeliveryDocument({
            requestId: request.id,
            requestNumber: request.requestNumber,
            generatedById: user.id,
        });
        deliveryDocument = await prisma.deliveryDocument.findUnique({
            where: { requestId: request.id },
            include: { generatedBy: { include: { profile: true } } },
        });

        // If static file exists, stream directly for legal immutability
        const isFinalStatus = request.status === 'SELESAI' || (request.type === 'RETURN_RUSAK' && request.status === 'SERAH');
        if (deliveryDocument.finalFilePath && isFinalStatus) {
            const absFinal = path.resolve(__dirname, '../../public', deliveryDocument.finalFilePath.replace(/^\//, ''));
            if (fs.existsSync(absFinal)) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename=BAST-FINAL-${request.requestNumber}.pdf`);
                return fs.createReadStream(absFinal).pipe(res);
            }
        } else if (deliveryDocument.filePath) {
            const absDraft = path.resolve(__dirname, '../../public', deliveryDocument.filePath.replace(/^\//, ''));
            if (fs.existsSync(absDraft)) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename=BAST-DRAFT-${request.requestNumber}.pdf`);
                return fs.createReadStream(absDraft).pipe(res);
            }
        }

        // Identitas Pihak Pertama — rantai tunggal dari modul requestflow
        const { name: adminName, signatureUrl: adminSigUrl } = await resolveAdminIdentity({
            deliveryDocument,
            request,
        });

        const ptName = request.requester?.profile?.nama || request.requester?.username || 'PT / Mitra';

        const allocationsData = deliveryDocument.itemsSnapshot
            ? JSON.parse(deliveryDocument.itemsSnapshot)
            : buildAllocationSnapshot(request);

        // Format data to fit BAST template structure
        const partnerType = request.requester?.profile?.partnerType || 'gangguan';
        
        // Pihak Kedua: Uses signerName if signed; otherwise defaults to PT Name (Nama PT / Mitra)
        const recipientName = deliveryDocument.signerName || '( ........................................ )';
        const recipientSigUrl = deliveryDocument.signerSignatureUrl || null;

        const bastData = {
            id: request.id,
            requestNumber: request.requestNumber,
            title: request.title,
            status: request.status,
            notes: request.notes,
            requestedAt: request.requestedAt,
            processedAt: request.processedAt,
            completedAt: request.completedAt,
            partnerType,
            requesterName: ptName,
            kpName: adminName || 'Admin',
            kpSignatureUrl: adminSigUrl,
            signerName: recipientName,
            signerSignatureUrl: recipientSigUrl,
            allocations: allocationsData
        };

        const pdfStream = await generateBastPdfStream(bastData);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=BAST-${request.requestNumber}.pdf`);

        pdfStream.pipe(res);
        pdfStream.end();
    } catch (error) {
        console.error('Error in downloadBastPdf:', error);
        res.status(error.code === "CAPACITY_FULL" ? 409 : 500).json({ message: error.message || "Internal server error" });
    }
};

// GET /requests/:id/pdf-draft
export const downloadBastDraftPdf = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const request = await prisma.request.findUnique({
            where: { id },
            include: { deliveryDocument: true }
        });

        if (!request) return res.status(404).json({ message: 'Request tidak ditemukan' });
        if (user.role !== 'ADMIN' && user.id !== request.requesterId) {
            return res.status(403).json({ message: 'Akses ditolak' });
        }

        const doc = request.deliveryDocument;
        if (doc?.filePath) {
            const absPath = path.resolve(__dirname, '../../public', doc.filePath.replace(/^\//, ''));
            if (fs.existsSync(absPath)) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename=BAST-DRAFT-${request.requestNumber}.pdf`);
                return fs.createReadStream(absPath).pipe(res);
            }
        }

        return downloadBastPdf(req, res);
    } catch (error) {
        console.error('Error in downloadBastDraftPdf:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /requests/:id/pdf-signed
export const downloadBastSignedPdf = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const request = await prisma.request.findUnique({
            where: { id },
            include: { deliveryDocument: true }
        });

        if (!request) return res.status(404).json({ message: 'Request tidak ditemukan' });
        if (user.role !== 'ADMIN' && user.id !== request.requesterId) {
            return res.status(403).json({ message: 'Akses ditolak' });
        }

        const doc = request.deliveryDocument;
        if (doc?.finalFilePath) {
            const absPath = path.resolve(__dirname, '../../public', doc.finalFilePath.replace(/^\//, ''));
            if (fs.existsSync(absPath)) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename=BAST-FINAL-${request.requestNumber}.pdf`);
                return fs.createReadStream(absPath).pipe(res);
            }
        }

        return downloadBastPdf(req, res);
    } catch (error) {
        console.error('Error in downloadBastSignedPdf:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /requests/:id/sign-bast
export const signBast = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const request = await prisma.request.findUnique({
            where: { id },
            include: { 
                deliveryDocument: true,
                requestItems: { include: { allocations: true } }
            }
        });

        if (!request) {
            return res.status(404).json({ message: 'Request tidak ditemukan' });
        }

        const deliveryDocument = await ensureDeliveryDocument({
            requestId: request.id,
            requestNumber: request.requestNumber,
            generatedById: user.id,
        });

        const now = new Date();
        const updateData = {};

        if (user.role === 'ADMIN') {
            updateData.kpSignedAt = now;
            updateData.kpSignedById = user.id;
        } else if (user.role === 'MITRA') {
            updateData.picSignedAt = now;
            updateData.picSignedById = user.id;
        }

        const updatedDocument = await prisma.deliveryDocument.update({
            where: { id: deliveryDocument.id },
            data: updateData
        });

        // Alur pengajuan material rusak (RETURN_RUSAK): tanda tangan tidak
        // otomatis menyelesaikan request. Admin TTD saat DISETUJUI; mitra TTD
        // saat SERAH → BAST difinalisasi (siap diserahkan), SELESAI ditetapkan
        // admin setelah intake terikat selesai.
        if (request.type === 'RETURN_RUSAK') {
            if (user.role === 'ADMIN') {
                return res.json({
                    message: 'BAST signed successfully',
                    document: updatedDocument,
                    isFullySigned: false,
                    requestStatus: request.status,
                });
            }

            if (user.role === 'MITRA') {
                const reqFull = await prisma.request.findUnique({
                    where: { id: request.id },
                    include: {
                        requester: { include: { profile: true } },
                        deliveryDocument: true,
                        requestItems: {
                            include: { materialCategory: true, brand: true, model: { include: { brand: true } } },
                        },
                    },
                });
                const { name: adminName2, signatureUrl: adminSig2 } = await resolveAdminIdentity({
                    deliveryDocument: reqFull.deliveryDocument,
                    actingAdmin: user,
                });
                const now = new Date();
                const ptName = reqFull.requester?.profile?.nama || reqFull.requester?.username || 'PT / Mitra';
                const itemsSnapshotData = reqFull.requestItems.map((ri) => ({
                    materialNumber: ri.model?.code || '-',
                    materialName: ri.model?.deskripsi || ri.model?.nama || ri.materialCategory.nama || '-',
                    serialNumber: ri.serialNumber || '-',
                    quantity: ri.quantity,
                    unit: 'Unit',
                    kondisi: 'Rusak',
                }));
                const finalBastData = {
                    id: reqFull.id,
                    requestNumber: reqFull.requestNumber,
                    title: reqFull.title,
                    status: 'SERAH',
                    notes: reqFull.notes,
                    requestedAt: reqFull.requestedAt,
                    processedAt: reqFull.processedAt || now,
                    completedAt: null,
                    partnerType: reqFull.requester?.profile?.partnerType || 'gangguan',
                    requesterName: ptName,
                    signerName: ptName,
                    signerSignatureUrl: user.profile?.picSignatureUrl || null,
                    kpName: adminName2,
                    kpSignatureUrl: adminSig2,
                    allocations: itemsSnapshotData,
                };
                const finalFilename = `bast-rusak-final-${reqFull.requestNumber}.pdf`;
                const { relativeFilePath } = await generateAndSaveBastPdf(finalBastData, finalFilename);
                await finalizeDeliveryDocument({
                    requestId: reqFull.id,
                    requestNumber: reqFull.requestNumber,
                    generatedById: user.id,
                    now,
                    signerName: ptName,
                    signatureUrl: user.profile?.picSignatureUrl || null,
                    adminName: adminName2,
                    adminSignatureUrl: adminSig2,
                    filePath: relativeFilePath,
                    itemsSnapshot: itemsSnapshotData,
                });
                return res.json({
                    message: 'BAST returned material final',
                    document: await prisma.deliveryDocument.findUnique({ where: { requestId: reqFull.id } }),
                    isFullySigned: true,
                    requestStatus: request.status,
                });
            }
        }

        // Cek apakah kedua TTD sudah lengkap — jika ya, ubah status request ke SELESAI
        const isFullySigned = !!(updatedDocument.kpSignedById && updatedDocument.picSignedById);
        let requestStatus = request.status;

        if (isFullySigned) {
            const updatedRequest = await prisma.$transaction(async (tx) => {
                // SATU jalur completion (D9/D10) — sama dengan endpoint status.
                return completeRequest(tx, request, user);
            });
            requestStatus = updatedRequest.status;
        }

        res.json({
            message: 'BAST signed successfully',
            document: updatedDocument,
            isFullySigned,
            requestStatus
        });
    } catch (error) {
        console.error('Error in signBast:', error);
        if (error.code === 'CAPACITY_FULL') {
            return res.status(409).json({ message: error.message, reason: error.code });
        }
        res.status(error.code === "CAPACITY_FULL" ? 409 : 500).json({ message: error.message || "Internal server error" });
    }
};

