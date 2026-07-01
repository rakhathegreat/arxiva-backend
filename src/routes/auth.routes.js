import express from 'express';
import { login, me, exchangeGoogleCode, getGoogleStatus, disconnectGoogle, getDriveFolderId, updateDriveFolderId } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/login', login);

// Protected dummy route to test the middleware
router.get('/me', authMiddleware, me);

// Google OAuth routes (desktop-native flow)
router.post('/google/exchange', authMiddleware, exchangeGoogleCode);
router.get('/google/status', authMiddleware, getGoogleStatus);
router.delete('/google/disconnect', authMiddleware, disconnectGoogle);

// Google Drive Root Folder ID routes
router.get('/google/folder-id', authMiddleware, getDriveFolderId);
router.put('/google/folder-id', authMiddleware, updateDriveFolderId);

export default router;
