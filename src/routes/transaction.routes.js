import express from 'express';
import { getTransactions, getTransactionById, createTransaction, deleteTransaction } from '../controllers/transaction.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /transactions:
 *   get:
 *     tags: [Transactions]
 *     summary: Get all transactions
 *     description: Retrieve a list of transaction history records.
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/', getTransactions);

/**
 * @swagger
 * /transactions/{id}:
 *   get:
 *     tags: [Transactions]
 *     summary: Get transaction by ID
 *     description: Retrieve a single transaction by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction retrieved successfully
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', getTransactionById);

/**
 * @swagger
 * /transactions:
 *   post:
 *     tags: [Transactions]
 *     summary: Create transaction
 *     description: Record a new inventory transaction such as masuk, keluar, rusak, or hilang.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sn, nomor, kategori]
 *             properties:
 *               sn:
 *                 type: string
 *                 example: SN-001
 *               nomor:
 *                 type: string
 *                 example: PA-001
 *               kategori:
 *                 type: string
 *                 example: Keluar
 *               status:
 *                 type: string
 *                 example: Selesai
 *               merek:
 *                 type: string
 *                 example: Samsung
 *               asal:
 *                 type: string
 *                 example: Gudang A
 *               tujuan:
 *                 type: string
 *                 example: Mitra B
 *               mitra:
 *                 type: string
 *                 example: Mitra A
 *               keterangan:
 *                 type: string
 *                 example: Barang dipindahkan
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Item not found
 *       500:
 *         description: Internal server error
 */
router.post('/', createTransaction);

/**
 * @swagger
 * /transactions/{id}:
 *   delete:
 *     tags: [Transactions]
 *     summary: Delete transaction
 *     description: Delete an existing transaction record.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction deleted successfully
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', deleteTransaction);

export default router;
