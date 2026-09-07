import express from 'express';
import { uploadImageController } from '../controllers/upload.controller.js';
import { uploadSingleImage } from '../shared/middlewares/upload.middleware.js';
import { authMiddleware } from '../shared/middlewares/auth.middleware.js';

const router = express.Router();

// Apply auth middleware to protect upload route
router.use(authMiddleware);

/**
 * @swagger
 * /upload/image:
 *   post:
 *     tags: [Upload]
 *     summary: Upload an image to MinIO
 *     description: Upload an image file (JPEG, PNG, WebP, GIF, SVG) to MinIO object storage and return its public URL.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload (max 5MB)
 *               folder:
 *                 type: string
 *                 example: avatars
 *                 description: Subfolder name inside the bucket (default "images")
 *     responses:
 *       201:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     objectName:
 *                       type: string
 *                       example: images/171234567890-a1b2c3d4.png
 *                     bucket:
 *                       type: string
 *                       example: arxiva-images
 *                     url:
 *                       type: string
 *                       example: http://localhost:9000/arxiva-images/images/171234567890-a1b2c3d4.png
 *                     size:
 *                       type: integer
 *                       example: 102450
 *                     mimeType:
 *                       type: string
 *                       example: image/png
 *       400:
 *         description: Invalid file format or missing image file
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Upload process failed
 */
router.post('/image', (req, res, next) => {
	uploadSingleImage(req, res, (err) => {
		if (err) {
			return res.status(400).json({ message: err.message });
		}
		next();
	});
}, uploadImageController);

export default router;
