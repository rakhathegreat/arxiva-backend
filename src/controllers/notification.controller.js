import prisma from "../config/prisma.js";

/**
 * Get all notifications for the authenticated user
 */
export const getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 50 // Limit to 50 latest for performance
        });
        
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
};

/**
 * Add a new notification
 */
export const addNotification = async (req, res) => {
    try {
        const { userId, title, message, type, referenceId, referenceType } = req.body;
        
        if (!userId || !title || !message) {
            return res.status(400).json({ success: false, message: "userId, title, and message are required" });
        }

        const notification = await prisma.notification.create({
            data: {
                userId,
                title,
                message,
                type: type || "SYSTEM",
                isRead: false,
                referenceId,
                referenceType
            }
        });
        
        res.status(201).json({ success: true, data: notification });
    } catch (error) {
        console.error("Error adding notification:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
};

/**
 * Mark a specific notification as read
 */
export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const notification = await prisma.notification.updateMany({
            where: { 
                id,
                userId 
            },
            data: {
                isRead: true
            }
        });
        
        if (notification.count === 0) {
            return res.status(404).json({ success: false, message: "Notification not found or not owned by user" });
        }
        
        res.status(200).json({ success: true, message: "Notification marked as read" });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
};

/**
 * Mark all notifications as read for the authenticated user
 */
export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await prisma.notification.updateMany({
            where: { 
                userId,
                isRead: false 
            },
            data: {
                isRead: true
            }
        });
        
        res.status(200).json({ success: true, message: `${result.count} notifications marked as read` });
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
};
