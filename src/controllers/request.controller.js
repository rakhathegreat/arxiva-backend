import prisma from '../utils/prisma.js';

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
            status: r.status,
            notes: r.notes || "-",
            requestedAt: r.requestedAt,
            itemsCount: r.requestItems.reduce((acc, item) => acc + item.quantity, 0),
            itemsDetail: r.requestItems.map(item => `${item.category.nama} (${item.quantity})`).join(", ")
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
                }
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

// PUT /requests/:id/status
export const updateRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const validStatuses = ['DRAFT', 'MENUNGGU', 'DISETUJUI', 'DIPROSES', 'DIKIRIM', 'DITERIMA', 'SELESAI', 'DITOLAK', 'DIBATALKAN'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const dataToUpdate = { status };
        const now = new Date();
        if (status === 'DISETUJUI') dataToUpdate.approvedAt = now;
        if (status === 'DIPROSES') dataToUpdate.processedAt = now;
        if (status === 'DIKIRIM') dataToUpdate.shippedAt = now;
        if (status === 'DITERIMA') dataToUpdate.receivedAt = now;
        if (status === 'SELESAI') dataToUpdate.completedAt = now;

        const updated = await prisma.request.update({
            where: { id },
            data: dataToUpdate,
            include: { requester: { include: { profile: true } } }
        });
        res.json({ message: 'Request status updated', request: updated });
    } catch (error) {
        console.error('Error in updateRequestStatus:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
