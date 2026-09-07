-- DropForeignKey
ALTER TABLE `Request` DROP FOREIGN KEY `Request_destinationUser_fkey`;

-- AlterTable
ALTER TABLE `Request` ADD COLUMN `type` ENUM('OUTGOING', 'RETURN_RUSAK') NOT NULL DEFAULT 'OUTGOING',
    MODIFY `status` ENUM('DRAFT', 'MENUNGGU', 'SIAP', 'DISETUJUI', 'SERAH', 'DITERIMA', 'SELESAI', 'DITOLAK', 'DIBATALKAN') NOT NULL DEFAULT 'MENUNGGU';

-- AlterTable
ALTER TABLE `RequestItem` ADD COLUMN `serialNumber` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `SystemConfig` MODIFY `value` TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE `Request` ADD CONSTRAINT `Request_destinationUserId_fkey` FOREIGN KEY (`destinationUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;