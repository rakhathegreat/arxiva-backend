import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { 
    getNotifications, 
    addNotification, 
    markAsRead, 
    markAllAsRead 
} from '../controllers/notification.controller.js';

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

// Get all notifications for current user
router.get("/", getNotifications);

// Add a new notification
router.post("/", addNotification);

// Mark all notifications as read for current user
router.patch("/read-all", markAllAsRead);

// Mark a specific notification as read
router.patch("/:id/read", markAsRead);

export default router;
