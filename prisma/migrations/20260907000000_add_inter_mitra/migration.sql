-- Tambah tipe request INTER_MITRA (permintaan material antar mitra, disetujui admin)
-- dan field providerPartnerId + hasil scan SN per RequestItem.

-- AlterTable: Request
ALTER TABLE `Request` ADD COLUMN IF NOT EXISTS `providerPartnerId` VARCHAR(191) NULL;
CREATE INDEX IF NOT EXISTS `Request_providerPartnerId_idx` ON `Request`(`providerPartnerId`);
ALTER TABLE `Request` ADD CONSTRAINT `Request_providerPartner_fkey` FOREIGN KEY (`providerPartnerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Request` MODIFY `type` ENUM('OUTGOING', 'RETURN_RUSAK', 'INTER_MITRA') NOT NULL DEFAULT 'OUTGOING';

-- AlterTable: RequestItem (hasil scan antar mitra)
ALTER TABLE `RequestItem` ADD COLUMN IF NOT EXISTS `donorSerialNumbers` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `receiverSerialNumbers` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `donorScannedAt` DATETIME(3) NULL,
    ADD COLUMN IF NOT EXISTS `receiverScannedAt` DATETIME(3) NULL;