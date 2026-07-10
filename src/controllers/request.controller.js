import prisma from '../utils/prisma.js';
import { logMutation } from '../utils/mutation.util.js';

// GET /requests
export const getRequests = async (req, res) => {
    try {
        const requests = await prisma.request.findMany({
            include: {
                requester: { include: { profile: true } },
                requestItems: {
                    include: {
                        category: true,
                        brand: true
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
            itemsDetail: r.requestItems.map(item => `${item.category.nama} (${item.quantity})`).join(", "),
            requestItems: r.requestItems.map(item => ({
                id: item.id,
                category: item.category.nama,
                brand: item.brand?.nama || "-",
                quantity: item.quantity
            }))
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
                        category: true,
                        brand: true,
                        allocations: { include: { item: true } }
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
                        categoryId: item.categoryId,
                        brandId: item.brandId || null,
                        quantity: item.quantity
                    }))
                }
            },
            include: {
                requester: { include: { profile: true } },
                requestItems: { include: { category: true, brand: true } }
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
        const { requestItemId, itemIds } = req.body;
        const user = req.user;

        if (user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Hanya admin yang dapat mengalokasikan barang' });
        }

        const request = await prisma.request.findUnique({ where: { id } });
        if (!request || (request.status !== 'DISETUJUI' && request.status !== 'SIAP')) {
            return res.status(400).json({ message: 'Request tidak valid atau belum disetujui' });
        }

        await prisma.$transaction(async (tx) => {
            for (const itemId of itemIds) {
                const item = await tx.item.findUnique({ where: { id: itemId } });
                if (!item || item.status !== 'tersedia') {
                    throw new Error(`Item ${itemId} tidak tersedia atau tidak ada.`);
                }

                await tx.requestAllocation.create({
                    data: {
                        requestItemId,
                        itemId,
                        allocatedById: user.id
                    }
                });

                await tx.requestItem.update({
                    where: { id: requestItemId },
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

        const validStatuses = ['DRAFT', 'MENUNGGU', 'DISETUJUI', 'SIAP', 'SELESAI', 'DITOLAK', 'DIBATALKAN'];
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

        // RBAC Checks
        if (['DISETUJUI', 'SIAP', 'SELESAI', 'DITOLAK'].includes(status) && user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Hanya admin yang dapat menyetujui, menyiapkan, menyelesaikan, atau menolak request' });
        }
        if (status === 'DIBATALKAN' && user.role !== 'ADMIN' && user.id !== request.requesterId) {
            return res.status(403).json({ message: 'Anda hanya dapat membatalkan request milik sendiri' });
        }

        const dataToUpdate = { status };
        const now = new Date();
        if (status === 'DISETUJUI') dataToUpdate.approvedAt = now;
        if (status === 'SIAP') dataToUpdate.processedAt = now;
        if (status === 'SELESAI') dataToUpdate.completedAt = now;

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
                return updatedReq;
            });
            return res.json({ message: 'Request status updated and items mutated', request: updated });
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
                        category: true,
                        brand: true,
                        allocations: { include: { item: true } }
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
                generatedByName: deliveryDocument.generatedBy?.profile?.nama || deliveryDocument.generatedBy?.username || 'Admin',
                allocations: request.requestItems.flatMap(item =>
                    item.allocations.map(alloc => ({
                        materialNumber: alloc.item?.paNumber || '-',
                        materialName: `${item.category?.nama || ''} ${item.brand?.nama || ''}`.trim(),
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
