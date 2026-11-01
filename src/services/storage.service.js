import {
	S3Client,
	HeadBucketCommand,
	CreateBucketCommand,
	PutBucketPolicyCommand,
	PutObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from '../shared/config.js';
import crypto from 'crypto';

/**
 * Klien S3 generik. Server storage-nya RustFS, tetapi protokolnya S3 standar —
 * jadi SDK AWS dipakai dan tidak ada ketergantungan pada implementasi tertentu.
 */
export const s3Client = new S3Client({
	endpoint: `${config.storage.useSSL ? 'https' : 'http'}://${config.storage.endPoint}:${config.storage.port}`,
	// RustFS butuh path-style (/bucket/object), bukan virtual-host style.
	forcePathStyle: true,
	region: config.storage.region,
	credentials: {
		accessKeyId: config.storage.accessKey,
		secretAccessKey: config.storage.secretKey,
	},
});

let bucketChecked = false;

const isNotFound = (err) =>
	err?.name === 'NotFound' ||
	err?.name === 'NoSuchBucket' ||
	err?.$metadata?.httpStatusCode === 404;

/**
 * Pastikan bucket ada dan punya policy public-read untuk menyajikan gambar.
 * @param {string} bucketName
 */
export const ensureBucketExists = async (bucketName = config.storage.bucket) => {
	if (bucketChecked) return;

	try {
		await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
	} catch (err) {
		if (!isNotFound(err)) throw err;
		await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
		console.log(`[storage] Bucket '${bucketName}' created successfully.`);
	}

	// Public read hanya untuk objek, bukan listing bucket.
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
	await s3Client.send(
		new PutBucketPolicyCommand({ Bucket: bucketName, Policy: JSON.stringify(policy) }),
	);

	bucketChecked = true;
};

/**
 * Unggah buffer gambar ke object storage.
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - Buffer file dari multer
 * @param {string} params.originalName - Nama file asli
 * @param {string} params.mimeType - MIME type (mis. image/png)
 * @param {string} [params.folder='images'] - Subfolder di dalam bucket
 * @returns {Promise<{objectName: string, bucket: string, url: string, size: number, mimeType: string}>}
 */
export const uploadImage = async ({ fileBuffer, originalName, mimeType, folder = 'images' }) => {
	const bucket = config.storage.bucket;
	await ensureBucketExists(bucket);

	const extension =
		originalName && originalName.includes('.') ? originalName.split('.').pop() : 'png';
	const randomHash = crypto.randomBytes(8).toString('hex');
	const timestamp = Date.now();
	const sanitizedFolder = folder.replace(/^\/+|\/+$/g, '');
	const objectName = `${sanitizedFolder}/${timestamp}-${randomHash}.${extension}`;

	await s3Client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: objectName,
			Body: fileBuffer,
			ContentLength: fileBuffer.length,
			ContentType: mimeType,
		}),
	);

	const protocol = config.storage.useSSL ? 'https' : 'http';
	const baseUrl =
		config.storage.publicUrl ||
		`${protocol}://${config.storage.endPoint}:${config.storage.port}`;
	const url = `${baseUrl}/${bucket}/${objectName}`;

	return {
		objectName,
		bucket,
		url,
		size: fileBuffer.length,
		mimeType,
	};
};
