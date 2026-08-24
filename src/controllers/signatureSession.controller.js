import prisma from '../shared/prisma.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateAndSaveBastPdf } from '../services/pdf.service.js';
import {
	resolveAdminIdentity,
	buildAllocationSnapshot,
	completeRequest,
} from '../modules/requestflow/requestflow.service.js';
import { finalizeDeliveryDocument } from '../modules/bastdoc/service.js';

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
                // Identitas Pihak Pertama — rantai tunggal modul requestflow
                const deliveryDocument0 = request.deliveryDocument;
                const { name: adminName, signatureUrl: adminSig } = await resolveAdminIdentity({
                    deliveryDocument: deliveryDocument0,
                    request,
                });
                let adminUser = null;
                if (adminSig) {
                    adminUser = await prisma.user.findFirst({
                        where: { role: 'ADMIN' },
                        include: { profile: true },
                    });
                }

                let deliveryDocument = request.deliveryDocument;
                const now = new Date();
                const ptName = request.requester?.profile?.nama || request.requester?.username || 'PT / Mitra';
                const recipientName = signerName || request.requester?.profile?.nama || 'Pengambil';

                const itemsAllocations = deliveryDocument?.itemsSnapshot
                    ? JSON.parse(deliveryDocument.itemsSnapshot)
                    : buildAllocationSnapshot(request);

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
                const { relativeFilePath } = await generateAndSaveBastPdf(finalBastData, finalFilename);

                // Finalisasi dokumen — satu pintu modul bastdoc (PDF lokal = sumber kebenaran, D11)
                await finalizeDeliveryDocument({
                    requestId: request.id,
                    requestNumber: request.requestNumber,
                    generatedById: adminUser?.id || request.requesterId,
                    now,
                    signerName: recipientName,
                    signatureUrl,
                    adminName,
                    adminSignatureUrl: adminSig,
                    filePath: relativeFilePath,
                    itemsSnapshot: itemsAllocations,
                });

                // 3. Penyelesaian request — SATU jalur modul requestflow (D9/D10):
                //    kapasitas ditagih, lokasi mitra di-auto-provision bila absen.
                await prisma.$transaction(async (tx) => {
                    const actor = { id: adminUser?.id || request.requesterId };
                    await completeRequest(tx, request, actor);
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
        if (error.code === 'CAPACITY_FULL') {
            return res.status(409).json({ message: error.message, reason: error.code });
        }
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

