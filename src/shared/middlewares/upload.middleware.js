import multer from 'multer';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
	const allowedMimeTypes = [
		'image/jpeg',
		'image/png',
		'image/webp',
		'image/gif',
		'image/svg+xml',
	];

	if (allowedMimeTypes.includes(file.mimetype)) {
		cb(null, true);
	} else {
		cb(new Error(`Tipe file ${file.mimetype} tidak didukung. Hanya file gambar (JPEG, PNG, WebP, GIF, SVG) yang diperbolehkan.`), false);
	}
};

export const uploadSingleImage = multer({
	storage,
	fileFilter,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB file limit
	},
}).single('image');
