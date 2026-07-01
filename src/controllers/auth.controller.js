import bcrypt from 'bcrypt';
import { google } from 'googleapis';
import prisma from '../utils/prisma.js';
import { generateToken } from '../utils/jwt.js';
import fs from 'fs';
import path from 'path';

export const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const user = await prisma.user.findUnique({
            where: { username },
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
            },
            token,
        });
    } catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const me = async (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        }
    });
};

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI  // http://localhost:3456
);

export const exchangeGoogleCode = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Hanya admin yang diizinkan untuk menghubungkan akun Google' });
        }

        const { code, userId } = req.body;

        if (!code || !userId) {
            return res.status(400).json({ message: 'Code and userId are required' });
        }

        // Exchange authorization code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Fetch Google user profile
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const googleEmail = userInfo.data.email;

        // Pertahankan refresh token lama jika Google tidak mengirimkan yang baru (untuk user yang sama)
        const currentUser = await prisma.user.findUnique({ where: { id: req.user.id } });
        const newRefreshToken = tokens.refresh_token || currentUser?.googleRefreshToken || null;

        // Putuskan koneksi akun Google lain di sistem agar HANYA ADA SATU akun Google yang aktif pada satu waktu
        await prisma.user.updateMany({
            where: { googleConnected: true },
            data: {
                googleConnected: false,
                googleEmail: null,
                googleAccessToken: null,
                googleRefreshToken: null
            }
        });

        // Simpan token dan status koneksi untuk admin saat ini
        await prisma.user.update({
            where: { id: req.user.id },
            data: {
                googleConnected: true,
                googleEmail,
                googleAccessToken: tokens.access_token,
                googleRefreshToken: newRefreshToken,
            }
        });

        res.json({
            googleConnected: true,
            googleEmail
        });
    } catch (error) {
        console.error('Error exchanging Google code:', error);
        res.status(500).json({ message: `Gagal menukar kode Google: ${error.message}` });
    }
};

export const getGoogleStatus = async (req, res) => {
    try {
        // Cari satu akun Google yang aktif di seluruh sistem
        const activeUser = await prisma.user.findFirst({
            where: { googleConnected: true },
            select: { googleConnected: true, googleEmail: true }
        });

        res.json({
            googleConnected: activeUser?.googleConnected || false,
            googleEmail: activeUser?.googleEmail || ''
        });
    } catch (error) {
        console.error('Error getting Google status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const disconnectGoogle = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Hanya admin yang diizinkan untuk memutuskan koneksi akun Google' });
        }

        await prisma.user.updateMany({
            where: { googleConnected: true },
            data: {
                googleConnected: false,
                googleEmail: null,
                googleAccessToken: null,
                googleRefreshToken: null
            }
        });

        res.json({ message: 'Google account disconnected successfully' });
    } catch (error) {
        console.error('Error disconnecting Google account:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getDriveFolderId = async (req, res) => {
    try {
        res.json({
            rootFolderId: process.env.ROOT_FOLDER_ID || ""
        });
    } catch (error) {
        console.error('Error getting Drive folder ID:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateDriveFolderId = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Hanya admin yang diizinkan untuk mengubah ID Folder Drive' });
        }

        const { rootFolderId } = req.body;
        if (rootFolderId === undefined) {
            return res.status(400).json({ message: 'rootFolderId is required' });
        }

        // Update process.env immediately in memory
        process.env.ROOT_FOLDER_ID = rootFolderId;

        // Send response FIRST so client receives success before node --watch restarts the server
        res.json({
            message: 'Drive folder ID updated successfully',
            rootFolderId
        });

        // Update .env file after sending the response
        setTimeout(() => {
            try {
                const envPath = path.resolve(process.cwd(), '.env');
                if (fs.existsSync(envPath)) {
                    let envContent = fs.readFileSync(envPath, 'utf8');
                    if (envContent.match(/^ROOT_FOLDER_ID=.*$/m)) {
                        envContent = envContent.replace(/^ROOT_FOLDER_ID=.*$/m, `ROOT_FOLDER_ID="${rootFolderId}"`);
                    } else {
                        envContent += `\nROOT_FOLDER_ID="${rootFolderId}"\n`;
                    }
                    fs.writeFileSync(envPath, envContent, 'utf8');
                } else {
                    fs.writeFileSync(envPath, `ROOT_FOLDER_ID="${rootFolderId}"\n`, 'utf8');
                }
            } catch (err) {
                console.error('Error writing .env file:', err);
            }
        }, 500);

    } catch (error) {
        console.error('Error updating Drive folder ID:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};
