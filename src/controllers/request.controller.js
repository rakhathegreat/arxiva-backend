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
        const requests = await prisma.request.findMany({
            include: {
                requester: { include: { profile: true } },
                destinationUser: { include: { profile: true } },
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
            requesterName: r.requester?.profile?.nama || r.requester?.username || "Unknown",
            partnerCategory: r.requester?.profile?.partnerType || "Mitra",
            destinationUserId: r.destinationUserId || null,
            destinationName: r.destinationUser
                ? (r.destinationUser.profile?.nama || r.destinationUser.username)
                : null,
            destination: r.destinationUser || null,
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
                serialNumber: item.serialNumber || null
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
        const { requesterId, notes, items, destinationUserId, type } = req.body;
        const requestType = type === 'RETURN_RUSAK' ? 'RETURN_RUSAK' : 'OUTGOING';

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

        const requestCount = await prisma.request.count();
        const requestNumber = `REQ-${new Date().getFullYear()}-${String(requestCount + 1).padStart(4, '0')}`;

        const newRequest = await prisma.request.create({
            data: {
                requestNumber,
                type: requestType,
                requesterId,
                destinationUserId: destinationUserId || null,
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
                requestItems: { include: { materialCategory: true, brand: true, model: true } }
            }
        });
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
 * Hasilkan BAST untuk pengajuan material rusak (RETURN_RUSAK) saat admin
 * menyetujui (DISETUJUI). Item diambil dari requestItems (bukan alokasi),
 * karena pengembalian rusak tidak melalui alokasi keluar.
 */
async function regenerateReturnRusakBast(requestId, user) {
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
            kondisi: 'Rusak',
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
        allocations: itemsSnapshotData
    };

    const draftFilename = `bast-rusak-${reqFull.requestNumber}.pdf`;
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
        const transition = validateTransition(request.status, status, user.role, request.requesterId, user.id, request.type);
        if (!transition.ok) {
            return res.status(transition.httpStatus).json({ message: transition.message });
        }

        const isReturnRusak = request.type === 'RETURN_RUSAK';

        const dataToUpdate = { status };
        const now = new Date();
        if (['DITOLAK', 'DIBATALKAN'].includes(status)) {
            dataToUpdate.rejectionNotes = rejectionNotes || null;
        }
        if (status === 'SIAP') {
            dataToUpdate.approvedAt = now;
            dataToUpdate.processedAt = now;
        }
        if (isReturnRusak && status === 'DISETUJUI') {
            dataToUpdate.approvedAt = now;
            dataToUpdate.processedAt = now;
        }
        if (isReturnRusak && status === 'SERAH') {
            dataToUpdate.shippedAt = now;
        }
        if (status === 'SELESAI') dataToUpdate.completedAt = now;

        // Auto-generate / perbarui BAST Draft saat status menjadi SIAP (keluar)
        // atau DISETUJUI (pengajuan material rusak)
        if (status === 'SIAP') {
            await regenerateDraftBast(id, user);
        } else if (isReturnRusak && status === 'DISETUJUI') {
            await regenerateReturnRusakBast(id, user);
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
        // (material rusak: DISETUJUI / SERAH / SELESAI)
        if (request.type === 'RETURN_RUSAK') {
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
        // (material rusak: DISETUJUI / SERAH / SELESAI)
        if (request.type === 'RETURN_RUSAK') {
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

