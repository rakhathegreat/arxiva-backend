import prisma from '../utils/prisma.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateAndSaveBastPdf } from '../services/pdf.service.js';
import { uploadBastToDrive } from '../services/google.js';
import { logMutation } from '../utils/mutation.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// POST /signature-session
export const createSession = async (req, res) => {
    try {
        const { requestId, userId } = req.body || {};
        const session = await prisma.signatureSession.create({
            data: {
                status: 'PENDING',
                requestId: requestId || null,
                userId: userId || req.user?.id || null,
                // Expires in 15 minutes
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            }
        });
        res.status(201).json(session);
    } catch (error) {
        console.error('Error creating signature session:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /signature-session/:id
export const getSession = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma.signatureSession.findUnique({
            where: { id }
        });

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        if (session.expiresAt < new Date()) {
            return res.status(400).json({ message: 'Session expired' });
        }

        let requestDetails = null;
        if (session.requestId) {
            const reqData = await prisma.request.findUnique({
                where: { id: session.requestId },
                include: { requester: { include: { profile: true } } }
            });
            if (reqData) {
                requestDetails = {
                    requestNumber: reqData.requestNumber,
                    requesterName: reqData.requester?.profile?.nama || reqData.requester?.username || 'Mitra'
                };
            }
        }

        res.json({ ...session, requestDetails });
    } catch (error) {
        console.error('Error getting signature session:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};



// POST /signature-session/:id
export const submitSignature = async (req, res) => {
    try {
        const { id } = req.params;
        const { signatureUrl, signerName } = req.body;

        if (!signatureUrl) {
            return res.status(400).json({ message: 'Signature URL is required' });
        }

        const session = await prisma.signatureSession.findUnique({
            where: { id }
        });

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        if (session.expiresAt < new Date()) {
            return res.status(400).json({ message: 'Session expired' });
        }

        if (session.status === 'COMPLETED') {
            return res.status(400).json({ message: 'Session already completed' });
        }



        // 1. Handling BAST Pengambilan request
        if (session.requestId) {
            const request = await prisma.request.findUnique({
                where: { id: session.requestId },
                include: {
                    requester: { include: { profile: true } },
                    deliveryDocument: true,
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
                                    },
                                    allocatedBy: { include: { profile: true } }
                                }
                            }
                        }
                    }
                }
            });

            if (request) {
                // Find Admin user for Pihak Pertama
                let adminUser = null;
                const allocAdmin = request.requestItems.flatMap(ri => ri.allocations).find(a => a.allocatedBy?.profile?.picSignatureUrl)?.allocatedBy;
                if (allocAdmin) adminUser = allocAdmin;

                if (!adminUser) {
                    adminUser = await prisma.user.findFirst({
                        where: { role: 'ADMIN', profile: { picSignatureUrl: { not: null } } },
                        include: { profile: true }
                    });
                }
                if (!adminUser) {
                    adminUser = await prisma.user.findFirst({
                        where: { role: 'ADMIN' },
                        include: { profile: true }
                    });
                }

                let deliveryDocument = request.deliveryDocument;
                const now = new Date();
                const adminName = deliveryDocument?.kpName || adminUser?.profile?.picName || adminUser?.profile?.nama || adminUser?.username || 'Admin';
                const adminSig = deliveryDocument?.kpSignatureUrl || adminUser?.profile?.picSignatureUrl || null;
                const ptName = request.requester?.profile?.nama || request.requester?.username || 'PT / Mitra';
                const recipientName = signerName || request.requester?.profile?.nama || 'Pengambil';

                const itemsAllocations = deliveryDocument?.itemsSnapshot
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

                const finalBastData = {
                    id: request.id,
                    requestNumber: request.requestNumber,
                    status: 'SELESAI',
                    notes: request.notes,
                    requestedAt: request.requestedAt,
                    processedAt: request.processedAt || now,
                    completedAt: now,
                    partnerType: request.requester?.profile?.partnerType || 'gangguan',
                    requesterName: ptName,
                    signerName: recipientName,
                    signerSignatureUrl: signatureUrl,
                    kpName: adminName,
                    kpSignatureUrl: adminSig,
                    allocations: itemsAllocations
                };

                const finalFilename = `bast-final-${request.requestNumber}.pdf`;
                const { absoluteFilePath, relativeFilePath } = await generateAndSaveBastPdf(finalBastData, finalFilename);

                // Google Drive Cloud Upload
                let driveRes = { driveFileId: null, driveViewUrl: null };
                try {
                    driveRes = await uploadBastToDrive({ absoluteFilePath, fileName: finalFilename });
                } catch (driveErr) {
                    console.error("Google Drive sync failed, fallback to local:", driveErr.message);
                }

                if (!deliveryDocument) {
                    deliveryDocument = await prisma.deliveryDocument.create({
                        data: {
                            requestId: request.id,
                            documentNumber: `BAST/REQ/${request.requestNumber}`,
                            filePath: relativeFilePath,
                            finalFilePath: relativeFilePath,
                            driveFileId: driveRes.driveFileId,
                            driveViewUrl: driveRes.driveViewUrl,
                            kpName: adminName,
                            kpSignatureUrl: adminSig,
                            kpSignedAt: now,
                            signerName: recipientName,
                            signerSignatureUrl: signatureUrl,
                            picSignedAt: now,
                            signedAt: now,
                            itemsSnapshot: JSON.stringify(itemsAllocations),
                            generatedById: adminUser?.id || request.requesterId
                        }
                    });
                } else {
                    await prisma.deliveryDocument.update({
                        where: { id: deliveryDocument.id },
                        data: {
                            finalFilePath: relativeFilePath,
                            driveFileId: driveRes.driveFileId || deliveryDocument.driveFileId,
                            driveViewUrl: driveRes.driveViewUrl || deliveryDocument.driveViewUrl,
                            kpName: adminName,
                            kpSignatureUrl: adminSig,
                            signerName: recipientName,
                            signerSignatureUrl: signatureUrl,
                            picSignedAt: now,
                            signedAt: now,
                            itemsSnapshot: JSON.stringify(itemsAllocations)
                        }
                    });
                }

                // 3. Terapkan pemindahan barang dan log mutasi
                await prisma.$transaction(async (tx) => {
                    const partnerUserLocation = await tx.userLocation.findFirst({
                        where: { userId: request.requesterId }
                    });

                    if (partnerUserLocation) {
                        const destinationLocationId = partnerUserLocation.locationId;
                        for (const reqItem of request.requestItems) {
                            for (const allocation of reqItem.allocations) {
                                const item = await tx.item.findUnique({ where: { id: allocation.itemId } });
                                if (item) {
                                    await tx.item.update({
                                        where: { id: item.id },
                                        data: {
                                            status: 'digunakan',
                                            locationId: destinationLocationId,
                                            createdById: request.requesterId
                                        }
                                    });
                                    await logMutation(tx, {
                                        type: 'KELUAR',
                                        itemId: item.id,
                                        userId: adminUser?.id || request.requesterId,
                                        originLocationId: item.locationId,
                                        destinationLocationId: destinationLocationId,
                                        requestId: request.id
                                    });
                                }
                            }
                        }
                    }

                    // Update Request status to SELESAI
                    await tx.request.update({
                        where: { id: request.id },
                        data: { status: 'SELESAI', completedAt: now }
                    });
                });
            }
        }

        // 2. Handling Profile Signature update via HP
        if (session.userId) {
            await prisma.userProfile.updateMany({
                where: { userId: session.userId },
                data: {
                    picSignatureUrl: signatureUrl,
                    ...(signerName ? { picName: signerName } : {})
                }
            });
        }

        // Mark SignatureSession as completed only after successful processing
        const updatedSession = await prisma.signatureSession.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                signatureUrl,
                signerName: signerName || null
            }
        });

        res.json(updatedSession);
    } catch (error) {
        console.error('Error submitting signature:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /signature-session/:id/mobile
export const renderMobileSignPage = async (req, res) => {
    try {
        const filePath = path.resolve(__dirname, '../views/mobile-sign.html');
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('View file not found');
        }
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error rendering mobile sign page:', error);
        res.status(500).send('Internal server error');
    }
};

