import bcrypt from "bcrypt";
import crypto from "crypto";
import { google } from "googleapis";
import prisma from "../shared/prisma.js";
import { generateToken } from "../shared/jwt.js";

// -----------------------------------------------------------------------------
// Helpers: Root Folder ID (prioritas: DB > env)
// -----------------------------------------------------------------------------

export const getRootFolderId = async () => {
	const cfg = await prisma.systemConfig.findUnique({
		where: { key: "GOOGLE_ROOT_FOLDER_ID" },
	});
	return cfg?.value || process.env.ROOT_FOLDER_ID || null;
};

const setRootFolderId = async (folderId) => {
	await prisma.systemConfig.upsert({
		where: { key: "GOOGLE_ROOT_FOLDER_ID" },
		create: { key: "GOOGLE_ROOT_FOLDER_ID", value: folderId },
		update: { value: folderId },
	});
};

export const login = async (req, res) => {
	try {
		const { username, password } = req.body;

		if (!username || !password) {
			return res
				.status(400)
				.json({ message: "Username and password are required" });
		}

		const user = await prisma.user.findUnique({
			where: { username },
			include: { profile: true },
		});

		if (!user) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		const isPasswordValid = await bcrypt.compare(password, user.password);

		if (!isPasswordValid) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		const token = generateToken(user);

		res.json({
			message: "Login successful",
			user: {
				id: user.id,
				username: user.username,
				role: user.role,
				profile: user.profile || null,
			},
			token,
		});
	} catch (error) {
		console.error("Error in login:", error);
		res.status(500).json({ message: "Internal server error" });
	}
};

export const me = async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			include: { profile: true },
		});

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		res.json({
			user: {
				id: user.id,
				username: user.username,
				role: user.role,
				profile: user.profile || null,
			},
		});
	} catch (error) {
		console.error("Error fetching me:", error);
		res.status(500).json({ message: "Internal server error" });
	}
};

// -----------------------------------------------------------------------------
// Integrasi Google Drive (admin) — dipakai untuk membuat spreadsheet/QR lokasi
// -----------------------------------------------------------------------------

const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	process.env.GOOGLE_REDIRECT_URI,
);

// State OAuth sekali-pakai: {state -> {userId, expiresAt}}. Mengikat alur
// callback browser ke admin yang memulai, tanpa JWT di URL.
const PENDING_STATE_TTL_MS = 10 * 60 * 1000;
const pendingOAuthStates = new Map();

function createPendingState(userId) {
	const now = Date.now();
	for (const [key, entry] of pendingOAuthStates) {
		if (entry.expiresAt < now) pendingOAuthStates.delete(key);
	}
	const state = crypto.randomBytes(24).toString("hex");
	pendingOAuthStates.set(state, {
		userId,
		expiresAt: now + PENDING_STATE_TTL_MS,
	});
	return state;
}

function consumePendingState(state) {
	const entry = pendingOAuthStates.get(state);
	pendingOAuthStates.delete(state);
	if (!entry || entry.expiresAt < Date.now()) return null;
	return entry.userId;
}

/** Tukar code menjadi token & pasang sebagai akun Google sistem. */
async function exchangeAndConnect(code, adminUserId) {
	const { tokens } = await oauth2Client.getToken(code);
	oauth2Client.setCredentials(tokens);

	const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
	const userInfo = await oauth2.userinfo.get();
	const googleEmail = userInfo.data.email;

	// Pertahankan refresh token lama bila Google tidak mengirim yang baru.
	const currentUser = await prisma.user.findUnique({
		where: { id: adminUserId },
	});
	const newRefreshToken =
		tokens.refresh_token || currentUser?.googleRefreshToken || null;

	// Hanya SATU akun Google aktif di seluruh sistem pada satu waktu.
	await prisma.user.updateMany({
		where: { googleConnected: true },
		data: {
			googleConnected: false,
			googleEmail: null,
			googleAccessToken: null,
			googleRefreshToken: null,
		},
	});

	await prisma.user.update({
		where: { id: adminUserId },
		data: {
			googleConnected: true,
			googleEmail,
			googleAccessToken: tokens.access_token,
			googleRefreshToken: newRefreshToken,
		},
	});

	return googleEmail;
}

export const getGoogleAuthUrl = async (req, res) => {
	try {
		if (req.user.role !== "ADMIN") {
			return res
				.status(403)
				.json({
					message: "Hanya admin yang diizinkan untuk menghubungkan akun Google",
				});
		}

		const scopes = [
			"https://www.googleapis.com/auth/userinfo.email",
			"https://www.googleapis.com/auth/userinfo.profile",
			"https://www.googleapis.com/auth/drive",
			"https://www.googleapis.com/auth/spreadsheets",
		];

		const url = oauth2Client.generateAuthUrl({
			access_type: "offline",
			prompt: "consent",
			scope: scopes,
			state: createPendingState(req.user.id),
		});

		res.json({ url });
	} catch (error) {
		console.error("Error generating Google Auth URL:", error);
		res.status(500).json({ message: "Internal server error" });
	}
};

/**
 * Callback redirect Google (tanpa JWT — dipercaya lewat `state` sekali-pakai).
 * Merender halaman HTML mini; aplikasi desktop memantau status via polling.
 */
export const handleGoogleCallback = async (req, res) => {
	const { code, state, error } = req.query;

	const page = (title, detail, ok) =>
		res.status(ok ? 200 : 400).send(
			`<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f4f5f7; color: #1f2937; }
  .card { background: #fff; border-radius: 12px; padding: 32px 40px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,.08); }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { font-size: 13px; color: #6b7280; margin: 0; }
</style></head><body><div class="card"><h1>${title}</h1><p>${detail}</p></div>
<script>setTimeout(function(){ window.close(); }, 1500);</script>
</body></html>`,
		);

	if (error) {
		console.error("Google callback error:", error);
		return page(
			"Koneksi dibatalkan",
			"Otorisasi Google tidak diselesaikan.",
			false,
		);
	}

	const userId = typeof state === "string" ? consumePendingState(state) : null;
	if (!code || !userId) {
		return page(
			"Tautan tidak valid",
			"Permintaan ini sudah kedaluwarsa atau tidak dikenal. Mulai ulang dari Pengaturan.",
			false,
		);
	}

	try {
		const googleEmail = await exchangeAndConnect(String(code), userId);
		return page(
			"Akun Google terhubung",
			`${googleEmail} — silakan kembali ke aplikasi Taslim.`,
			true,
		);
	} catch (err) {
		console.error("Error in Google callback:", err);
		return page(
			"Gagal menghubungkan",
			err.message || "Terjadi kesalahan saat menghubungkan akun Google.",
			false,
		);
	}
};

export const exchangeGoogleCode = async (req, res) => {
	try {
		if (req.user.role !== "ADMIN") {
			return res
				.status(403)
				.json({
					message: "Hanya admin yang diizinkan untuk menghubungkan akun Google",
				});
		}

		const { code } = req.body;
		if (!code) {
			return res.status(400).json({ message: "Code is required" });
		}

		const googleEmail = await exchangeAndConnect(code, req.user.id);
		res.json({ googleConnected: true, googleEmail });
	} catch (error) {
		console.error("Error exchanging Google code:", error);
		res
			.status(500)
			.json({ message: `Gagal menukar kode Google: ${error.message}` });
	}
};

export const getGoogleStatus = async (req, res) => {
	try {
		const [activeUser, rootFolderId] = await Promise.all([
			prisma.user.findFirst({
				where: { googleConnected: true },
				select: { googleConnected: true, googleEmail: true },
			}),
			getRootFolderId(),
		]);

		res.json({
			googleConnected: activeUser?.googleConnected || false,
			googleEmail: activeUser?.googleEmail || "",
			rootFolderId: rootFolderId || "",
		});
	} catch (error) {
		console.error("Error getting Google status:", error);
		res.status(500).json({ message: "Internal server error" });
	}
};

export const disconnectGoogle = async (req, res) => {
	try {
		if (req.user.role !== "ADMIN") {
			return res
				.status(403)
				.json({
					message:
						"Hanya admin yang diizinkan untuk memutuskan koneksi akun Google",
				});
		}

		await prisma.user.updateMany({
			where: { googleConnected: true },
			data: {
				googleConnected: false,
				googleEmail: null,
				googleAccessToken: null,
				googleRefreshToken: null,
			},
		});

		res.json({ message: "Google account disconnected successfully" });
	} catch (error) {
		console.error("Error disconnecting Google account:", error);
		res.status(500).json({ message: "Internal server error" });
	}
};

/** PUT /auth/google/folder-id — simpan Root Folder ID Google Drive (admin only). */
export const updateFolderId = async (req, res) => {
	try {
		if (req.user.role !== "ADMIN") {
			return res
				.status(403)
				.json({
					message:
						"Hanya admin yang diizinkan mengubah konfigurasi Google Drive",
				});
		}

		const { folderId } = req.body;
		if (!folderId || typeof folderId !== "string" || !folderId.trim()) {
			return res.status(400).json({ message: "folderId wajib diisi" });
		}

		await setRootFolderId(folderId.trim());

		// Saat input drive (folder ID) baru, sinkronkan seluruh lokasi:
		// buat spreadsheet untuk yang belum punya & isi data item dari DB (best-effort).
		let sync = null;
		try {
			const { syncAllLocationSheets } = await import(
				"../services/sheet.service.js"
			);
			sync = await syncAllLocationSheets();
		} catch (syncErr) {
			console.error("[auth] Gagal sinkron lokasi setelah set folder:", syncErr.message);
		}

		res.json({
			message: "Root Folder ID berhasil disimpan",
			rootFolderId: folderId.trim(),
			sync: sync || { created: 0, updated: 0, failed: [] },
		});
	} catch (error) {
		console.error("Error updating folder ID:", error);
		res.status(500).json({ message: "Internal server error" });
	}
};
