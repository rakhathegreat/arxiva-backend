import prisma from '../utils/prisma.js';

// POST /api/signature-session
export const createSession = async (req, res) => {
    try {
        const session = await prisma.signatureSession.create({
            data: {
                status: 'PENDING',
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

// GET /api/signature-session/:id
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

        res.json(session);
    } catch (error) {
        console.error('Error getting signature session:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/signature-session/:id
export const submitSignature = async (req, res) => {
    try {
        const { id } = req.params;
        const { signatureUrl } = req.body;

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

        const updatedSession = await prisma.signatureSession.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                signatureUrl
            }
        });

        res.json(updatedSession);
    } catch (error) {
        console.error('Error submitting signature:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
