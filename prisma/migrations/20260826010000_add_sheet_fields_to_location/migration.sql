-- Kembalikan integrasi Google Drive: kolom spreadsheet per lokasi untuk QR code.
ALTER TABLE `Location` ADD COLUMN IF NOT EXISTS `sheetId` VARCHAR(191) NULL;
ALTER TABLE `Location` ADD COLUMN IF NOT EXISTS `sheetUrl` VARCHAR(191) NULL;
