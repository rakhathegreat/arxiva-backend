/**
 * Query baca untuk Request (GET /requests, GET /requests/:id).
 * Read-only + pemetaan respons; tanpa aturan bisnis.
 */
import prisma from '../../shared/prisma.js';

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
						allocations: true,
					},
				},
				deliveryDocument: {
					select: {
						kpSignedById: true,
						picSignedById: true,
					},
				},
			},
			orderBy: { createdAt: 'desc' },
		});

		// Format for frontend
		const formatted = requests.map((r) => ({
			id: r.id,
			requestNumber: r.requestNumber,
			requesterId: r.requesterId || null,
			requesterName: r.requester?.profile?.nama || r.requester?.username || 'Unknown',
			partnerCategory: r.requester?.profile?.partnerType || 'Mitra',
			destinationUserId: r.destinationUserId || null,
			destinationName: r.destinationUser
				? r.destinationUser.profile?.nama || r.destinationUser.username
				: null,
			destination: r.destinationUser || null,
			providerPartnerId: r.providerPartnerId || null,
			providerName: r.providerPartner
				? r.providerPartner.profile?.nama || r.providerPartner.username
				: null,
			providerPartner: r.providerPartner || null,
			status: r.status,
			type: r.type,
			notes: r.notes || '-',
			rejectionNotes: r.rejectionNotes || null,
			adminRemarks: r.rejectionNotes || null,
			requestedAt: r.requestedAt,
			itemsCount: r.requestItems.reduce((acc, item) => acc + item.quantity, 0),
			allocatedCount: r.requestItems.reduce(
				(acc, item) => acc + (item.allocations?.length || item.fulfilledQuantity || 0),
				0,
			),
			itemsDetail: r.requestItems
				.map((item) => `${item.materialCategory.nama} (${item.quantity})`)
				.join(', '),
			requestItems: r.requestItems.map((item) => ({
				id: item.id,
				category: item.materialCategory.nama,
				brand: item.brand?.nama || '-',
				model: item.model?.nama || '-',
				quantity: item.quantity,
				serialNumber: item.serialNumber || null,
				donorSerialNumbers: item.donorSerialNumbers || null,
				receiverSerialNumbers: item.receiverSerialNumbers || null,
			})),
			deliveryDocument: r.deliveryDocument
				? {
						kpSignedById: r.deliveryDocument.kpSignedById,
						picSignedById: r.deliveryDocument.picSignedById,
						driveViewUrl: r.deliveryDocument.driveViewUrl || null,
					}
				: null,
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
												materialCategory: true,
											},
										},
									},
								},
							},
						},
					},
				},
				deliveryDocument: true,
			},
		});
		if (!request) return res.status(404).json({ message: 'Request not found' });
		res.json(request);
	} catch (error) {
		console.error('Error in getRequestById:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
};
