import { Client } from 'minio';
import { config } from '../shared/config.js';
import crypto from 'crypto';

const minioClient = new Client({
	endPoint: config.minio.endPoint,
	port: config.minio.port,
	useSSL: config.minio.useSSL,
	accessKey: config.minio.accessKey,
	secretKey: config.minio.secretKey,
});

let bucketChecked = false;

/**
 * Ensures the configured bucket exists and has a public read policy enabled for serving images.
 * @param {string} bucketName
 */
export const ensureBucketExists = async (bucketName = config.minio.bucket) => {
	if (bucketChecked) return;
	try {
		const exists = await minioClient.bucketExists(bucketName);
		if (!exists) {
			await minioClient.makeBucket(bucketName, 'us-east-1');
			console.log(`[minio] Bucket '${bucketName}' created successfully.`);
		}

		// Configure public read policy for images
		const policy = {
			Version: '2012-10-17',
			Statement: [
				{
					Effect: 'Allow',
					Principal: { AWS: ['*'] },
					Action: ['s3:GetObject'],
					Resource: [`arn:aws:s3:::${bucketName}/*`],
				},
			],
		};
		await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
		bucketChecked = true;
	} catch (err) {
		console.error('[minio] Warning during bucket initialization:', err.message);
	}
};

/**
 * Upload an image buffer to MinIO.
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - Image file buffer from multer
 * @param {string} params.originalName - Original filename
 * @param {string} params.mimeType - MIME type (e.g. image/png)
 * @param {string} [params.folder='images'] - Subfolder path inside bucket
 * @returns {Promise<{objectName: string, bucket: string, url: string, size: number, mimeType: string}>}
 */
export const uploadImageToMinio = async ({ fileBuffer, originalName, mimeType, folder = 'images' }) => {
	await ensureBucketExists(config.minio.bucket);

	const bucket = config.minio.bucket;
	const extension = originalName && originalName.includes('.') ? originalName.split('.').pop() : 'png';
	const randomHash = crypto.randomBytes(8).toString('hex');
	const timestamp = Date.now();
	const sanitizedFolder = folder.replace(/^\/+|\/+$/g, '');
	const objectName = `${sanitizedFolder}/${timestamp}-${randomHash}.${extension}`;

	const metaData = {
		'Content-Type': mimeType,
	};

	await minioClient.putObject(bucket, objectName, fileBuffer, fileBuffer.length, metaData);

	const protocol = config.minio.useSSL ? 'https' : 'http';
	const baseUrl = config.minio.publicUrl || `${protocol}://${config.minio.endPoint}:${config.minio.port}`;
	const url = `${baseUrl}/${bucket}/${objectName}`;

	return {
		objectName,
		bucket,
		url,
		size: fileBuffer.length,
		mimeType,
	};
};

export { minioClient };
