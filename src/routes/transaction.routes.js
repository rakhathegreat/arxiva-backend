import express from 'express';
import { getTransactions, getTransactionById, createTransaction, deleteTransaction } from '../controllers/transaction.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/', getTransactions);
router.get('/:id', getTransactionById);

router.post('/', createTransaction);
router.delete('/:id', deleteTransaction);

export default router;
