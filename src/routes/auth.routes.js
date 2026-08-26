import express from 'express';
import { login, me, getGoogleAuthUrl, handleGoogleCallback, exchangeGoogleCode, getGoogleStatus, disconnectGoogle } from '../controllers/auth.controller.js';
import { authMiddleware } from '../shared/middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user
 *     description: Authenticate a user with username and password and return a JWT token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Missing credentials
 *       500:
 *         description: Internal server error
 */
router.post('/login', login);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user
 *     description: Return the authenticated user's profile information.
 *     responses:
 *       200:
 *         description: Authenticated user retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/me', authMiddleware, me);

export default router;

// -----------------------------------------------------------------------------
// Integrasi Google Drive (admin) — koneksi akun untuk spreadsheet/QR lokasi
// -----------------------------------------------------------------------------

/**
 * @swagger
 * /auth/google:
 *   get:
 *     tags: [Auth]
 *     summary: Get Google OAuth URL (admin only)
 *     responses:
 *       200: { description: Auth URL generated }
 *       403: { description: Forbidden }
 */
router.get('/google', authMiddleware, getGoogleAuthUrl);

/**
 * @swagger
 * /auth/google/exchange:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange Google OAuth code (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string }
 *     responses:
 *       200: { description: Connected }
 */
router.post('/google/exchange', authMiddleware, exchangeGoogleCode);

/**
 * @swagger
 * /auth/google/status:
 *   get:
 *     tags: [Auth]
 *     summary: Get system-wide Google connection status
 *     responses:
 *       200: { description: Status returned }
 */
router.get('/google/status', authMiddleware, getGoogleStatus);

/**
 * @swagger
 * /auth/google/disconnect:
 *   delete:
 *     tags: [Auth]
 *     summary: Disconnect the system Google account (admin only)
 *     responses:
 *       200: { description: Disconnected }
 */
router.delete('/google/disconnect', authMiddleware, disconnectGoogle);

// Callback redirect Google — publik; kepercayaan lewat `state` sekali-pakai.
router.get('/google/callback', handleGoogleCallback);
