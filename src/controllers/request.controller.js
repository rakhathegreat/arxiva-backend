import prisma from '../utils/prisma.js';
import { logMutation } from '../utils/mutation.util.js';
import { generateBastPdfStream, generateAndSaveBastPdf } from '../services/pdf.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const releaseRequestAllocations = async (tx, request) => {
    const requestItemIds = request.requestItems.map(ri => ri.id);
    if (requestItemIds.length === 0) return;

    await tx.requestAllocation.deleteMany({
        where: { requestItemId: { in: requestItemIds } }
    });

    await tx.requestItem.updateMany({
        where: { id: { in: requestItemIds } },
        data: { fulfilledQuantity: 0 }
    });
};

const processRequestCompletionMutation = async (tx, request, user, destinationLocationId) => {
    for (const reqItem of request.requestItems) {
        for (const allocation of reqItem.allocations) {
            const item = await tx.item.findUnique({ where: { id: allocation.itemId } });
            const originLocationId = item.locationId;

            // Perbarui barang: ubah status jadi digunakan, pindah ke lokasi partner, ganti pemilik
            await tx.item.update({
                where: { id: allocation.itemId },
                data: {
                    status: 'digunakan',
                    locationId: destinationLocationId,
                    createdById: request.requesterId
                }
            });

            // Catat buku besar ledger mutasi
            await logMutation(tx, {
                type: 'KELUAR',
                itemId: allocation.itemId,
                userId: user.id,
                originLocationId: originLocationId,
                destinationLocationId: destinationLocationId,
                requestId: request.id
            });
        }
    }
};

// GET /requests
export const getRequests = async (req, res) => {
    try {
        const requests = await prisma.request.findMany({
            include: {
                requester: { include: { profile: true } },
                requestItems: {
                    include: {
                        materialCategory: true,
                        brand: true,
                        model: true
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
            status: r.status,
            notes: r.notes || "-",
            requestedAt: r.requestedAt,
            itemsCount: r.requestItems.reduce((acc, item) => acc + item.quantity, 0),
            itemsDetail: r.requestItems.map(item => `${item.materialCategory.nama} (${item.quantity})`).join(", "),
            requestItems: r.requestItems.map(item => ({
                id: item.id,
                category: item.materialCategory.nama,
                brand: item.brand?.nama || "-",
                model: item.model?.nama || "-",
                quantity: item.quantity
            })),
            deliveryDocument: r.deliveryDocument ? {
                kpSignedById: r.deliveryDocument.kpSignedById,
                picSignedById: r.deliveryDocument.picSignedById
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
        const { requesterId, notes, items } = req.body;

        const requestCount = await prisma.request.count();
        const requestNumber = `REQ-${new Date().getFullYear()}-${String(requestCount + 1).padStart(4, '0')}`;

        const newRequest = await prisma.request.create({
            data: {
                requestNumber,
                requesterId,
                notes,
                requestItems: {
                    create: items.map(item => ({
                        materialCategoryId: item.materialCategoryId,
                        brandId: item.brandId || null,
                        modelId: item.modelId || null,
                        quantity: item.quantity
                    }))
                }
            },
            include: {
                requester: { include: { profile: true } },
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
            await releaseRequestAllocations(tx, request);
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

        res.json({ message: 'Alokasi berhasil' });
    } catch (error) {
        console.error('Error in allocateItems:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Double booking: Salah satu barang sudah dialokasikan ke request lain.' });
        }
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
};

// PUT /requests/:id/status
export const updateRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user = req.user;

        const validStatuses = ['DRAFT', 'MENUNGGU', 'SIAP', 'SELESAI', 'DITOLAK', 'DIBATALKAN'];
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

        // RBAC Checks
        if (['SIAP', 'SELESAI', 'DITOLAK'].includes(status) && user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Hanya admin yang dapat menyiapkan, menyelesaikan, atau menolak request' });
        }
        if (status === 'DIBATALKAN' && user.role !== 'ADMIN' && user.id !== request.requesterId) {
            return res.status(403).json({ message: 'Anda hanya dapat membatalkan request milik sendiri' });
        }

        const dataToUpdate = { status };
        const now = new Date();
        if (status === 'SIAP') {
            dataToUpdate.approvedAt = now;
            dataToUpdate.processedAt = now;
        }
        if (status === 'SELESAI') dataToUpdate.completedAt = now;

        // Auto-generate BAST Draft PDF when status becomes SIAP
        if (status === 'SIAP') {
            let adminName = user.profile?.picName || user.profile?.nama || user.username || 'Admin';
            let adminSigUrl = user.profile?.picSignatureUrl || null;

            if (!adminSigUrl) {
                const fallbackAdmin = await prisma.userProfile.findFirst({ where: { picSignatureUrl: { not: null } } });
                if (fallbackAdmin) {
                    adminSigUrl = fallbackAdmin.picSignatureUrl;
                    if (!adminName) adminName = fallbackAdmin.picName || fallbackAdmin.nama;
                }
            }

            const reqFull = await prisma.request.findUnique({
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
                                            model: { include: { brand: true, materialCategory: true } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            const itemsSnapshotData = reqFull.requestItems.flatMap(item =>
                item.allocations.map(alloc => ({
                    materialNumber: alloc.item?.model?.code || '-',
                    materialName: alloc.item?.model?.nama || '-',
                    serialNumber: alloc.item?.serialNumber || '-',
                    quantity: 1,
                    unit: 'Unit'
                }))
            );

            const ptName = reqFull.requester?.profile?.nama || reqFull.requester?.username || 'PT / Mitra';

            const draftBastData = {
                id: reqFull.id,
                requestNumber: reqFull.requestNumber,
                status: 'SIAP',
                notes: reqFull.notes,
                requestedAt: reqFull.requestedAt,
                processedAt: now,
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
                where: { requestId: id },
                create: {
                    requestId: id,
                    documentNumber: `BAST/REQ/${reqFull.requestNumber}`,
                    filePath: relativeFilePath,
                    kpName: adminName,
                    kpSignatureUrl: adminSigUrl,
                    kpSignedAt: now,
                    itemsSnapshot: JSON.stringify(itemsSnapshotData),
                    generatedById: user.id
                },
                update: {
                    filePath: relativeFilePath,
                    kpName: adminName,
                    kpSignatureUrl: adminSigUrl,
                    kpSignedAt: now,
                    itemsSnapshot: JSON.stringify(itemsSnapshotData)
                }
            });
        }

        if (status === 'SELESAI') {
            const updated = await prisma.$transaction(async (tx) => {
                const partnerUserLocation = await tx.userLocation.findFirst({
                    where: { userId: request.requesterId },
                    include: { location: true }
                });
                if (!partnerUserLocation) throw new Error("Lokasi partner tidak ditemukan");

                const destinationLocationId = partnerUserLocation.locationId;

                // 1. Lock baris lokasi untuk pengecekan kapasitas yang aman dari race condition (Pessimistic Locking)
                const locations = await tx.$queryRaw`SELECT capacity FROM Location WHERE id = ${destinationLocationId} FOR UPDATE`;
                if (!locations || locations.length === 0) throw new Error("Lokasi tujuan tidak valid");
                const capacity = locations[0].capacity;

                const currentItemsCount = await tx.item.count({ where: { locationId: destinationLocationId } });

                let incomingItemsCount = 0;
                for (const reqItem of request.requestItems) {
                    incomingItemsCount += reqItem.allocations.length;
                }

                if (capacity > 0 && currentItemsCount + incomingItemsCount > capacity) {
                    throw new Error("Kapasitas lokasi tidak mencukupi untuk menampung alokasi barang ini");
                }

                const updatedReq = await tx.request.update({
                    where: { id },
                    data: dataToUpdate,
                    include: { requester: { include: { profile: true } } }
                });

                // 2. Terapkan pemindahan barang dan log mutasi
                await processRequestCompletionMutation(tx, request, user, destinationLocationId);
                return updatedReq;
            });
            return res.json({ message: 'Request status updated and items mutated', request: updated });
        } else if (['DITOLAK', 'DIBATALKAN'].includes(status)) {
            const updated = await prisma.$transaction(async (tx) => {
                await releaseRequestAllocations(tx, request);
                return tx.request.update({
                    where: { id },
                    data: dataToUpdate,
                    include: { requester: { include: { profile: true } } }
                });
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
        res.status(500).json({ message: error.message || 'Internal server error' });
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
        if (!['SIAP', 'SELESAI'].includes(request.status)) {
            return res.status(400).json({ message: 'BAST hanya tersedia untuk request berstatus SIAP atau SELESAI' });
        }

        // Auto-create DeliveryDocument jika belum ada
        let deliveryDocument = request.deliveryDocument;
        if (!deliveryDocument) {
            deliveryDocument = await prisma.deliveryDocument.create({
                data: {
                    requestId: request.id,
                    documentNumber: `BAST/REQ/${request.requestNumber}`,
                    filePath: '',
                    generatedById: user.id
                },
                include: { generatedBy: { include: { profile: true } } }
            });
        }

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
                allocations: request.requestItems.flatMap(item =>
                    item.allocations.map(alloc => ({
                        materialNumber: alloc.item?.model?.code || '-',
                        materialName: alloc.item?.model?.nama || '-',
                        serialNumber: alloc.item?.serialNumber || '-',
                        quantity: 1,
                        unit: 'Unit'
                    }))
                )
            }
        });
    } catch (error) {
        console.error('Error in downloadBast:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
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
        if (!['SIAP', 'SELESAI'].includes(request.status)) {
            return res.status(400).json({ message: 'BAST hanya tersedia untuk request berstatus SIAP atau SELESAI' });
        }

        // Auto-create DeliveryDocument jika belum ada
        let deliveryDocument = request.deliveryDocument;
        if (!deliveryDocument) {
            deliveryDocument = await prisma.deliveryDocument.create({
                data: {
                    requestId: request.id,
                    documentNumber: `BAST/REQ/${request.requestNumber}`,
                    filePath: '',
                    generatedById: user.id
                },
                include: { generatedBy: { include: { profile: true } } }
            });
        }

        // If static file exists, stream directly for legal immutability
        if (deliveryDocument.finalFilePath && request.status === 'SELESAI') {
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

        // Determine Admin User (Pihak Pertama) Name and Signature from frozen snapshot first
        let adminName = deliveryDocument.kpName;
        let adminSigUrl = deliveryDocument.kpSignatureUrl;

        // Fallback ONLY if snapshot was never stored
        if (!adminName || !adminSigUrl) {
            const genAdmin = deliveryDocument.generatedBy?.profile;
            if (!adminName) adminName = genAdmin?.picName || genAdmin?.nama || deliveryDocument.generatedBy?.username || 'Admin';
            if (!adminSigUrl) adminSigUrl = genAdmin?.picSignatureUrl || null;
        }

        if (!adminSigUrl || !adminName) {
            const fallbackAdminProfile = await prisma.userProfile.findFirst({
                where: { picSignatureUrl: { not: null } }
            });
            if (fallbackAdminProfile) {
                if (!adminSigUrl) adminSigUrl = fallbackAdminProfile.picSignatureUrl;
                if (!adminName) adminName = fallbackAdminProfile.picName || fallbackAdminProfile.nama;
            }
        }

        const ptName = request.requester?.profile?.nama || request.requester?.username || 'PT / Mitra';

        const allocationsData = deliveryDocument.itemsSnapshot
            ? JSON.parse(deliveryDocument.itemsSnapshot)
            : request.requestItems.flatMap(item =>
                item.allocations.map(alloc => ({
                    materialNumber: alloc.item?.model?.code || '-',
                    materialName: alloc.item?.model?.nama || '-',
                    serialNumber: alloc.item?.serialNumber || '-',
                    quantity: 1,
                    unit: 'Unit'
                }))
            );

        // Format data to fit BAST template structure
        const partnerType = request.requester?.profile?.partnerType || 'gangguan';
        
        // Pihak Kedua: Uses signerName if signed; otherwise defaults to PT Name (Nama PT / Mitra)
        const recipientName = deliveryDocument.signerName || '( ........................................ )';
        const recipientSigUrl = deliveryDocument.signerSignatureUrl || null;

        const bastData = {
            id: request.id,
            requestNumber: request.requestNumber,
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
        res.status(500).json({ message: error.message || 'Internal server error' });
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

        let deliveryDocument = request.deliveryDocument;
        if (!deliveryDocument) {
            deliveryDocument = await prisma.deliveryDocument.create({
                data: {
                    requestId: request.id,
                    documentNumber: `BAST/REQ/${request.requestNumber}`,
                    filePath: '',
                    generatedById: user.id
                }
            });
        }

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

        // Cek apakah kedua TTD sudah lengkap — jika ya, ubah status request ke SELESAI
        const isFullySigned = !!(updatedDocument.kpSignedById && updatedDocument.picSignedById);
        let requestStatus = request.status;

        if (isFullySigned) {
            const updatedRequest = await prisma.$transaction(async (tx) => {
                const partnerUserLocation = await tx.userLocation.findFirst({
                    where: { userId: request.requesterId },
                    include: { location: true }
                });
                if (!partnerUserLocation) throw new Error("Lokasi partner tidak ditemukan");

                const destinationLocationId = partnerUserLocation.locationId;

                const locations = await tx.$queryRaw`SELECT capacity FROM Location WHERE id = ${destinationLocationId} FOR UPDATE`;
                if (!locations || locations.length === 0) throw new Error("Lokasi tujuan tidak valid");
                const capacity = locations[0].capacity;

                const currentItemsCount = await tx.item.count({ where: { locationId: destinationLocationId } });

                let incomingItemsCount = 0;
                for (const reqItem of request.requestItems) {
                    incomingItemsCount += reqItem.allocations.length;
                }

                if (capacity > 0 && currentItemsCount + incomingItemsCount > capacity) {
                    throw new Error("Kapasitas lokasi tidak mencukupi untuk menampung alokasi barang ini");
                }

                const updatedReq = await tx.request.update({
                    where: { id: request.id },
                    data: { status: 'SELESAI' }
                });

                await processRequestCompletionMutation(tx, request, user, destinationLocationId);

                return updatedReq;
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
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
};

