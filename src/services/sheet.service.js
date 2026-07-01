import { getGoogleServices } from './google.js';
import prisma from '../utils/prisma.js';

export const createSheetForLevel = async (name) => {
    try {
        const { sheets, drive } = await getGoogleServices();
        const rootFolderId = process.env.ROOT_FOLDER_ID;
        const file = await drive.files.create({
            requestBody: {
                name,
                mimeType: 'application/vnd.google-apps.spreadsheet',
                parents: rootFolderId ? [rootFolderId] : [],
            },
            fields: 'id, webViewLink',
        });

        const sheetId = file.data.id;
        const sheetUrl = file.data.webViewLink || `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

        const headers = [['Serial Number', 'Kategori', 'Merek', 'Status', 'Tanggal Masuk', 'Tanggal Keluar']];

        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: 'Sheet1!A1:G1',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: headers },
            });
        } catch (err) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: 'A1:G1',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: headers },
            });
        }

        return { sheetId, sheetUrl };
    } catch (error) {
        console.error(`Error creating Google Sheet for ${name}:`, error.message);
        return { sheetId: null, sheetUrl: null };
    }
};

export const updateSheetName = async (sheetId, newName) => {
    if (!sheetId) return;
    try {
        const { drive } = await getGoogleServices();
        await drive.files.update({
            fileId: sheetId,
            requestBody: {
                name: newName,
            },
        });
    } catch (error) {
        console.error(`Error updating Google Sheet name for ID ${sheetId}:`, error.message);
    }
};

export const syncLevelSheet = async (levelId) => {
    if (!levelId) return;
    try {
        const { sheets } = await getGoogleServices();
        const level = await prisma.level.findUnique({
            where: { id: levelId },
            include: {
                items: {
                    include: {
                        category: true,
                        brand: true,
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!level || !level.sheetId) return;

        const rows = level.items.map(item => {
            let statusUnit = "Masuk";
            if (item.status === "digunakan") statusUnit = "Keluar";
            if (item.status === "rusak") statusUnit = "Rusak";

            return [
                item.serialNumber,
                item.category ? item.category.nama : "-",
                item.brand ? item.brand.nama : "-",
                statusUnit,
                item.entryDate ? item.entryDate.toISOString().slice(0, 10) : item.createdAt.toISOString().slice(0, 10),
                item.exitDate ? item.exitDate.toISOString().slice(0, 10) : "-"
            ];
        });

        try {
            await sheets.spreadsheets.values.clear({
                spreadsheetId: level.sheetId,
                range: 'Sheet1!A2:G',
            });
        } catch (err) {
            await sheets.spreadsheets.values.clear({
                spreadsheetId: level.sheetId,
                range: 'A2:G',
            });
        }

        if (rows.length > 0) {
            try {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: level.sheetId,
                    range: 'Sheet1!A2',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: rows },
                });
            } catch (err) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: level.sheetId,
                    range: 'A2',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: rows },
                });
            }
        }
    } catch (error) {
        console.error(`Error syncing Google Sheet for levelId ${levelId}:`, error.message);
    }
};

export const deleteSheet = async (sheetId) => {
    if (!sheetId) return;
    try {
        const { drive } = await getGoogleServices();
        await drive.files.delete({
            fileId: sheetId,
        });
        console.log(`Successfully deleted Google Sheet with ID: ${sheetId}`);
    } catch (error) {
        console.error(`Error deleting Google Sheet for ID ${sheetId}:`, error.message);
    }
};

