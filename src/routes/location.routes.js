import express from 'express';
import {
    getLocations,
    createLocation,
    updateLocation,
    createLevel,
    updateLevel,
    toggleLocation,
    toggleLevel,
    deleteLocation,
    deleteLevel
} from '../controllers/location.controller.js';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Get all locations (public or accessible to authenticated users)
router.get('/', getLocations);

// Create location
router.post('/', authMiddleware, createLocation);

// Update location
router.put('/:id', authMiddleware, updateLocation);

// Toggle location active status
router.patch('/:id/toggle', authMiddleware, toggleLocation);

// Delete location
router.delete('/:id', authMiddleware, deleteLocation);

// Level management within a location
router.post('/:id/levels', authMiddleware, createLevel);
router.put('/:id/levels/:levelId', authMiddleware, updateLevel);
router.patch('/:id/levels/:levelId/toggle', authMiddleware, toggleLevel);
router.delete('/:id/levels/:levelId', authMiddleware, deleteLevel);

export default router;
