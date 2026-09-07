import { uploadImageToMinio } from '../services/minio.service.js';

/**
 * Controller to handle image upload requests.
 * Expects file in req.file (from multer uploadSingleImage middleware).
 */
export const uploadImageController = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({
				message: 'File gambar wajib diunggah (field: "image")',
			});
		}

		const folder = req.body.folder || 'images';

		const uploadResult = await uploadImageToMinio({
			fileBuffer: req.file.buffer,
			originalName: req.file.originalname,
			mimeType: req.file.mimetype,
			folder,
		});

		return res.status(201).json({
			message: 'Gambar berhasil diunggah ke MinIO',
			data: uploadResult,
		});
	} catch (error) {
		console.error('Error in uploadImageController:', error);
		return res.status(500).json({
			message: 'Gagal mengunggah gambar ke MinIO',
			error: error.message,
		});
	}
};
