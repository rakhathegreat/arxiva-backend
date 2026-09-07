import express from 'express';
import { getRequests, getRequestById, createRequest, updateRequestStatus, allocateItems, downloadBast, downloadBastPdf, downloadBastDraftPdf, downloadBastSignedPdf, signBast, scanInterPartnerItems } from '../controllers/request.controller.js';
import { authMiddleware, roleMiddleware } from '../shared/middlewares/auth.middleware.js';

const router = express.Router();

// Terapkan auth middleware ke seluruh endpoint request
router.use(authMiddleware);

/**
 * @swagger
 * /requests:
 *   get:
 *     tags: [Requests]
 *     summary: Get all requests
 *     description: Retrieve a list of request records.
 *     responses:
 *       200:
 *         description: Requests retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/', getRequests);

/**
 * @swagger
 * /requests/{id}:
 *   get:
 *     tags: [Requests]
 *     summary: Get request by ID
 *     description: Retrieve a single request by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Request retrieved successfully
 *       404:
 *         description: Request not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', getRequestById);

/**
 * @swagger
 * /requests:
 *   post:
 *     tags: [Requests]
 *     summary: Create request
 *     description: Create a new inventory request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [requesterId, items]
 *             properties:
 *               requesterId:
 *                 type: string
 *               notes:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     materialCategoryId:
 *                       type: integer
 *                     brandId:
 *                       type: integer
 *                     quantity:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Request created successfully
 *       500:
 *         description: Internal server error
 */
router.post('/', createRequest);

/**
 * @swagger
 * /requests/{id}/status:
 *   put:
 *     tags: [Requests]
 *     summary: Update request status
 *     description: Update status for an existing request.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 example: DISETUJUI
 *     responses:
 *       200:
 *         description: Request status updated successfully
 *       400:
 *         description: Invalid status
 *       500:
 *         description: Internal server error
 */
router.put('/:id/status', updateRequestStatus);

/**
 * @swagger
 * /requests/{id}/allocate:
 *   post:
 *     tags: [Requests]
 *     summary: Allocate items to a request
 *     description: Allocate specific hardware units to a request (Admin only)
 */
router.post('/:id/allocate', roleMiddleware(['ADMIN']), allocateItems);

/**
 * @swagger
 * /requests/{id}/bast:
 *   get:
 *     tags: [Requests]
 *     summary: Download BAST document
 *     description: Securely download BAST document (Admin or Requester)
 */
router.get('/:id/bast', downloadBast);

/**
 * @swagger
 * /requests/{id}/bast-pdf:
 *   get:
 *     tags: [Requests]
 *     summary: Generate and download BAST PDF document
 *     description: Securely generate and download BAST document as PDF (Admin or Requester)
 */
router.get('/:id/bast-pdf', downloadBastPdf);
router.get('/:id/pdf-draft', downloadBastDraftPdf);
router.get('/:id/pdf-signed', downloadBastSignedPdf);

/**
 * @swagger
 * /requests/{id}/sign-bast:
 *   post:
 *     tags: [Requests]
 *     summary: Sign BAST document
 *     description: Sign the BAST document by adding the current user's profile signature
 */
router.post('/:id/sign-bast', signBast);

/**
 * @swagger
 * /peminjaman-mitra/{id}/scan:
 *   put:
 *     tags: [Requests]
 *     summary: Scan serah terima antar mitra (provider/receiver)
 *     description: |
 *       Provider scan: item yang diserahkan mitra pemberi (DISETUJUI → SERAH,
 *       membuat RequestAllocation). Receiver scan: konfirmasi barang diterima
 *       (SERAH → SELESAI, transfer ke lokasi mitra peminta).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scanParty, items]
 *             properties:
 *               scanParty:
 *                 type: string
 *                 enum: [provider, receiver]
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     requestItemId:
 *                       type: string
 *                     serialNumbers:
 *                       type: array
 *                       items:
 *                         type: string
 *     responses:
 *       200:
 *         description: Scan berhasil
 *       400:
 *         description: Validasi gagal (SN tidak cocok, kuantitas tidak sama)
 *       403:
 *         description: Bukan mitra pemberi/penerima yang ditunjuk
 */
router.put('/peminjaman-mitra/:id/scan', scanInterPartnerItems);

export default router;
