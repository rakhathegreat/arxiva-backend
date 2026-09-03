import { getGoogleServices } from "./google.js";
import { getRootFolderId } from "../controllers/auth.controller.js";

/** Buat Google Spreadsheet untuk sebuah lokasi; gagal → { null, null } tanpa crash. */
export const createSheetForLevel = async (name) => {
	try {
		const { sheets, drive } = await getGoogleServices();
		const rootFolderId = await getRootFolderId();
		const file = await drive.files.create({
			requestBody: {
				name,
				mimeType: "application/vnd.google-apps.spreadsheet",
				parents: rootFolderId ? [rootFolderId] : [],
			},
			fields: "id, webViewLink",
		});

		const sheetId = file.data.id;
		const sheetUrl =
			file.data.webViewLink ||
			`https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

		const headers = [
			[
				"Serial Number",
				"Kategori",
				"Merek",
				"Status",
				"Tanggal Masuk",
				"Tanggal Keluar",
			],
		];

		try {
			await sheets.spreadsheets.values.update({
				spreadsheetId: sheetId,
				range: "Sheet1!A1:G1",
				valueInputOption: "USER_ENTERED",
				requestBody: { values: headers },
			});
		} catch (err) {
			await sheets.spreadsheets.values.update({
				spreadsheetId: sheetId,
				range: "A1:G1",
				valueInputOption: "USER_ENTERED",
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
			requestBody: { name: newName },
		});
	} catch (error) {
		console.error(
			`Error updating Google Sheet name for ID ${sheetId}:`,
			error.message,
		);
	}
};

/** Hapus spreadsheet lokasi (best-effort). */
export const deleteSheet = async (sheetId) => {
	if (!sheetId) return;
	try {
		const { drive } = await getGoogleServices();
		await drive.files.delete({ fileId: sheetId });
		console.log(`Successfully deleted Google Sheet with ID: ${sheetId}`);
	} catch (error) {
		console.error(
			`Error deleting Google Sheet for ID ${sheetId}:`,
			error.message,
		);
	}
};
