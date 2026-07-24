import { google } from "googleapis";
import prisma from "../utils/prisma.js";

// Global OAuth2 client instance replacing GoogleAuth
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const sheets = google.sheets({ version: "v4", auth: oauth2Client });
const drive = google.drive({ version: "v3", auth: oauth2Client });

// Helper to get system-wide active OAuth2 client (terhubung oleh Admin)
export const getUserOAuthClient = async () => {
    // Seluruh aplikasi menggunakan satu akun Google yang aktif di sistem
    const activeUser = await prisma.user.findFirst({ 
        where: { googleConnected: true, googleRefreshToken: { not: null } } 
    });

    if (!activeUser || !activeUser.googleConnected || !activeUser.googleRefreshToken) {
        throw new Error("Akun Google sistem belum terhubung atau refresh token tidak ditemukan");
    }

    oauth2Client.setCredentials({
        refresh_token: activeUser.googleRefreshToken,
        access_token: activeUser.googleAccessToken || undefined
    });

    return oauth2Client;
};

// Helper to ensure credentials are set before calling Sheets/Drive APIs
export const getGoogleServices = async () => {
    await getUserOAuthClient();
    return { sheets, drive };
};

/**
 * Uploads a local PDF file to Google Drive under folder "BAST ARXIVA".
 * Returns { driveFileId, driveViewUrl }.
 */
export const uploadBastToDrive = async ({ absoluteFilePath, fileName }) => {
    try {
        const { drive } = await getGoogleServices();

        // 1. Find or Create "BAST ARXIVA" Folder
        let folderId = null;
        const searchFolder = await drive.files.list({
            q: "name = 'BAST ARXIVA' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (searchFolder.data.files && searchFolder.data.files.length > 0) {
            folderId = searchFolder.data.files[0].id;
        } else {
            const createFolder = await drive.files.create({
                resource: {
                    name: 'BAST ARXIVA',
                    mimeType: 'application/vnd.google-apps.folder'
                },
                fields: 'id'
            });
            folderId = createFolder.data.id;
        }

        // 2. Upload PDF file
        const fileMetadata = {
            name: fileName,
            parents: folderId ? [folderId] : []
        };
        const media = {
            mimeType: 'application/pdf',
            body: fs.createReadStream(absoluteFilePath)
        };

        const uploadedFile = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        const driveFileId = uploadedFile.data.id;
        let driveViewUrl = uploadedFile.data.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;

        // 3. Set file permissions (best-effort)
        try {
            await drive.permissions.create({
                fileId: driveFileId,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                }
            });
        } catch (permErr) {
            console.warn("Could not set Google Drive public permission:", permErr.message);
        }

        return { driveFileId, driveViewUrl };
    } catch (err) {
        console.error("Error uploading BAST to Google Drive:", err.message);
        return { driveFileId: null, driveViewUrl: null, error: err.message };
    }
};

export { sheets, drive, oauth2Client };