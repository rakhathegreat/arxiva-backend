import bcrypt from 'bcrypt';
import prisma from '../shared/prisma.js';
import { generateToken } from '../shared/jwt.js';

export const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const user = await prisma.user.findUnique({
            where: { username },
            include: { profile: true }
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = generateToken(user);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                profile: user.profile || null,
            },
            token,
        });
    } catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { profile: true }
        });
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                profile: user.profile || null,
            }
        });
    } catch (error) {
        console.error('Error fetching me:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
