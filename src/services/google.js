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

export { sheets, drive, oauth2Client };