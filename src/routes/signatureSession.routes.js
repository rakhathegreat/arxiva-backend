import express from 'express';
import { createSession, getSession, submitSignature, renderMobileSignPage } from '../controllers/signatureSession.controller.js';

const router = express.Router();

// No auth required for these endpoints as they are for the mobile QR flow
// The security is based on the unguessable UUID and short expiration time.
router.get('/:id/mobile', renderMobileSignPage);
router.post('/', createSession);
router.get('/:id', getSession);
router.post('/:id', submitSignature);

export default router;

