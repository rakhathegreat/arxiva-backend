import jwt from 'jsonwebtoken';
import { config } from './config.js';

export const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.jwtSecret,
        { expiresIn: '1d' }
    );
};

export const verifyToken = (token) => {
    return jwt.verify(token, config.jwtSecret);
};
