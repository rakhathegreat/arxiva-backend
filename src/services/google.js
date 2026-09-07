import { google } from "googleapis";
import prisma from "../shared/prisma.js";

const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	process.env.GOOGLE_REDIRECT_URI,
);

// Auto-persist refresh token saat Google merotasinya — mencegah koneksi terputus diam-diam.
oauth2Client.on("tokens", async (tokens) => {
	if (tokens.refresh_token) {
		try {
			await prisma.user.updateMany({
				where: { googleConnected: true },
				data: { googleRefreshToken: tokens.refresh_token },
			});
		} catch (err) {
			console.error(
				"[Google] Gagal menyimpan refresh token baru:",
				err.message,
			);
		}
	}
	if (tokens.access_token) {
		try {
			await prisma.user.updateMany({
				where: { googleConnected: true },
				data: { googleAccessToken: tokens.access_token },
			});
		} catch (err) {
			console.error("[Google] Gagal menyimpan access token baru:", err.message);
		}
	}
});

// Helper: OAuth2 client dengan kredensial akun Google sistem (terhubung oleh Admin).
export const getUserOAuthClient = async () => {
	const activeUser = await prisma.user.findFirst({
		where: { googleConnected: true, googleRefreshToken: { not: null } },
	});

	if (!activeUser || !activeUser.googleRefreshToken) {
		throw new Error(
			"Akun Google sistem belum terhubung atau refresh token tidak ditemukan",
		);
	}

	oauth2Client.setCredentials({
		refresh_token: activeUser.googleRefreshToken,
		access_token: activeUser.googleAccessToken || undefined,
	});

	return oauth2Client;
};

// Helper: pastikan kredensial terpasang sebelum memakai Sheets/Drive API.
export const getGoogleServices = async () => {
	await getUserOAuthClient();
	const sheets = google.sheets({ version: "v4", auth: oauth2Client });
	const drive = google.drive({ version: "v3", auth: oauth2Client });
	return { sheets, drive };
};

/**
 * Upload PDF BAST ke folder "BAST ARXIVA" di Google Drive.
 * Mengembalikan { driveFileId, driveViewUrl } — best-effort, gagal → null.
 */
export const uploadBastToDrive = async ({ absoluteFilePath, fileName }) => {
	try {
		const fs = await import("fs");
		const { drive } = await getGoogleServices();

		// 1. Cari atau buat folder "BAST ARXIVA"
		let folderId = null;
		const searchFolder = await drive.files.list({
			q: "name = 'BAST ARXIVA' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
			fields: "files(id, name)",
			spaces: "drive",
		});

		if (searchFolder.data.files && searchFolder.data.files.length > 0) {
			folderId = searchFolder.data.files[0].id;
		} else {
			const created = await drive.files.create({
				requestBody: {
					name: "BAST ARXIVA",
					mimeType: "application/vnd.google-apps.folder",
				},
				fields: "id",
			});
			folderId = created.data.id;
		}

		// 2. Upload file
		const uploaded = await drive.files.create({
			requestBody: { name: fileName, parents: folderId ? [folderId] : [] },
			media: {
				mimeType: "application/pdf",
				body: fs.createReadStream(absoluteFilePath),
			},
			fields: "id, webViewLink",
		});

		const driveFileId = uploaded.data.id;
		const driveViewUrl =
			uploaded.data.webViewLink ||
			`https://drive.google.com/file/d/${driveFileId}/view`;

		// 3. Izin baca publik (best-effort)
		try {
			await drive.permissions.create({
				fileId: driveFileId,
				requestBody: { role: "reader", type: "anyone" },
			});
		} catch (permErr) {
			console.warn("Could not set Drive public permission:", permErr.message);
		}

		return { driveFileId, driveViewUrl };
	} catch (err) {
		console.error("Error uploading BAST to Google Drive:", err.message);
		return { driveFileId: null, driveViewUrl: null };
	}
};
