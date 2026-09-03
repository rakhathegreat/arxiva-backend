import { getGoogleServices } from "./google.js";
import { getRootFolderId } from "../controllers/auth.controller.js";
import prisma from "../shared/prisma.js";

const SHEET_HEADERS = [
	[
		"Serial Number",
		"Kategori",
		"Merek",
		"Status",
		"Tanggal Masuk",
		"Tanggal Keluar",
	],
];

const formatDate = (date) => {
	if (!date) return "";
	try {
		return new Date(date).toISOString().slice(0, 10);
	} catch {
		return "";
	}
};

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

		try {
			await sheets.spreadsheets.values.update({
				spreadsheetId: sheetId,
				range: "Sheet1!A1:F1",
				valueInputOption: "USER_ENTERED",
				requestBody: { values: SHEET_HEADERS },
			});
		} catch (err) {
			await sheets.spreadsheets.values.update({
				spreadsheetId: sheetId,
				range: "A1:F1",
				valueInputOption: "USER_ENTERED",
				requestBody: { values: SHEET_HEADERS },
			});
		}

		return { sheetId, sheetUrl };
	} catch (error) {
		console.error(`Error creating Google Sheet for ${name}:`, error.message);
		return { sheetId: null, sheetUrl: null };
	}
};

/**
 * Tulis (overwrite) baris item ke dalam spreadsheet lokasi.
 * Header + semua baris ditulis sekaligus. Best-effort — gagal → false tanpa crash.
 * @param {string} sheetId
 * @param {Array} items - item hasil query Prisma (sudah include model.materialCategory/brand)
 * @returns {Promise<boolean>}
 */
export const writeItemsToSheet = async (sheetId, items) => {
	if (!sheetId) return false;
	try {
		const { sheets } = await getGoogleServices();
		const rows = (items || []).map((item) => [
			item.serialNumber || "",
			item.model?.materialCategory?.nama || "",
			item.model?.brand?.nama || "",
			item.status || "",
			formatDate(item.entryDate),
			formatDate(item.exitDate),
		]);
		const values = [...SHEET_HEADERS, ...rows];
		try {
			await sheets.spreadsheets.values.update({
				spreadsheetId: sheetId,
				range: "Sheet1!A1:F" + Math.max(values.length, 1),
				valueInputOption: "USER_ENTERED",
				requestBody: { values },
			});
		} catch (err) {
			await sheets.spreadsheets.values.update({
				spreadsheetId: sheetId,
				range: "A1:F" + Math.max(values.length, 1),
				valueInputOption: "USER_ENTERED",
				requestBody: { values },
			});
		}
		return true;
	} catch (error) {
		console.error(
			`Error writing items to Google Sheet ${sheetId}:`,
			error.message,
		);
		return false;
	}
};

/** Query Prisma untuk item dalam satu lokasi beserta kategori/merek. */
const loadItemsForLocation = (locationId) =>
	prisma.item.findMany({
		where: { locationId },
		include: {
			model: {
				include: { materialCategory: true, brand: true },
			},
		},
	});

/**
 * Sinkronkan seluruh lokasi: buat sheet untuk yang belum punya,
 * lalu tulis item milik masing-masing lokasi ke sheet-nya.
 * Mengikuti pola existing: sheet per PALLET, per child BOX (level) dari RACK,
 * dan per BOX berdiri sendiri.
 * Best-effort — selalu return ringkasan, tidak throw.
 * @returns {Promise<{created:number, updated:number, failed:string[]}>}
 */
export const syncAllLocationSheets = async () => {
	const result = { created: 0, updated: 0, failed: [] };
	try {
		const rootFolderId = await getRootFolderId();
		if (!rootFolderId) {
			console.warn("[sheet] Root folder belum diset — batal sinkron lokasi.");
			return result;
		}

		// Kumpulkan lokasi yang relevan (sama dengan pola getLocations/createLocation).
		const topLocations = await prisma.location.findMany({
			where: {
				parentId: null,
				type: { in: ["PALLET", "RACK", "BOX"] },
			},
			include: {
				children: true,
			},
		});

		const targets = [];
		for (const loc of topLocations) {
			if (loc.type === "RACK") {
				for (const child of loc.children) {
					if (child.type === "BOX") {
						targets.push({ location: child, name: `${loc.name} - ${child.name}` });
					}
				}
			} else {
				targets.push({ location: loc, name: loc.name });
			}
		}

		for (const { location, name } of targets) {
			try {
				// Buat sheet bila belum ada, lalu simpan sheetId/sheetUrl + sinkron nama.
				let sheetId = location.sheetId;
				if (!sheetId) {
					const created = await createSheetForLevel(name);
					if (!created.sheetId) {
						result.failed.push(name);
						continue;
					}
					sheetId = created.sheetId;
					await prisma.location.update({
						where: { id: location.id },
						data: { sheetId: created.sheetId, sheetUrl: created.sheetUrl },
					});
					result.created += 1;
				}

				const items = await loadItemsForLocation(location.id);
				const ok = await writeItemsToSheet(sheetId, items);
				if (ok) result.updated += 1;
			} catch (err) {
				console.error(`[sheet] Gagal sinkron lokasi "${name}":`, err.message);
				result.failed.push(name);
			}
		}

		return result;
	} catch (error) {
		console.error("[sheet] Error saat sinkron lokasi:", error.message);
		return result;
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
