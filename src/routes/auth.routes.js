import express from 'express';
import { login, me, exchangeGoogleCode, getGoogleStatus, disconnectGoogle, getDriveFolderId, updateDriveFolderId } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     role:
 *                       type: string
 *                 token:
 *                   type: string
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     role:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/me', authMiddleware, me);

/**
 * @swagger
 * /auth/google/exchange:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange Google OAuth code
 *     description: Exchange Google authorization code for account linkage.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, userId]
 *             properties:
 *               code:
 *                 type: string
 *                 example: google-auth-code
 *               userId:
 *                 type: string
 *                 example: user-123
 *     responses:
 *       200:
 *         description: Google account connected successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/google/exchange', authMiddleware, exchangeGoogleCode);

/**
 * @swagger
 * /auth/google/status:
 *   get:
 *     tags: [Auth]
 *     summary: Get Google connection status
 *     description: Check whether Google is connected for the system.
 *     responses:
 *       200:
 *         description: Status returned successfully
 *       500:
 *         description: Internal server error
 */
router.get('/google/status', authMiddleware, getGoogleStatus);

/**
 * @swagger
 * /auth/google/disconnect:
 *   delete:
 *     tags: [Auth]
 *     summary: Disconnect Google account
 *     description: Disconnect Google account linkage from the system.
 *     responses:
 *       200:
 *         description: Google account disconnected successfully
 *       500:
 *         description: Internal server error
 */
router.delete('/google/disconnect', authMiddleware, disconnectGoogle);

/**
 * @swagger
 * /auth/google/folder-id:
 *   get:
 *     tags: [Auth]
 *     summary: Get Google Drive folder ID
 *     description: Retrieve the configured Google Drive root folder ID.
 *     responses:
 *       200:
 *         description: Folder ID returned successfully
 *       500:
 *         description: Internal server error
 */
router.get('/google/folder-id', authMiddleware, getDriveFolderId);

/**
 * @swagger
 * /auth/google/folder-id:
 *   put:
 *     tags: [Auth]
 *     summary: Update Google Drive folder ID
 *     description: Set a new Google Drive root folder ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rootFolderId]
 *             properties:
 *               rootFolderId:
 *                 type: string
 *                 example: folder-123
 *     responses:
 *       200:
 *         description: Folder ID updated successfully
 *       400:
 *         description: Missing rootFolderId
 *       500:
 *         description: Internal server error
 */
router.put('/google/folder-id', authMiddleware, updateDriveFolderId);

export default router;
