import { verifyToken } from '../utils/jwt.js';
import prisma from '../utils/prisma.js';

export const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized. No token provided.' });
    }

    try {
        const decoded = verifyToken(token);

        const user = await prisma.user.findUnique({ where: { id: decoded.id } });

        if (!user || !user.isAktif) {
            return res.status(401).json({ message: 'Unauthorized. Invalid user.' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: error.message });
    }
};

export const roleMiddleware = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden. Insufficient permissions.' });
        }
        next();
    };
};
