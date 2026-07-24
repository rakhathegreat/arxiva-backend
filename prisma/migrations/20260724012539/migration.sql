-- AlterTable
ALTER TABLE `DeliveryDocument` ADD COLUMN `driveFileId` VARCHAR(191) NULL,
    ADD COLUMN `driveViewUrl` TEXT NULL,
    ADD COLUMN `itemsSnapshot` LONGTEXT NULL,
    ADD COLUMN `kpName` VARCHAR(191) NULL,
    ADD COLUMN `kpSignatureUrl` TEXT NULL,
    ADD COLUMN `signerName` VARCHAR(191) NULL,
    ADD COLUMN `signerSignatureUrl` TEXT NULL,
    MODIFY `filePath` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `SignatureSession` ADD COLUMN `requestId` VARCHAR(191) NULL,
    ADD COLUMN `signerName` VARCHAR(191) NULL,
    ADD COLUMN `userId` VARCHAR(191) NULL;
