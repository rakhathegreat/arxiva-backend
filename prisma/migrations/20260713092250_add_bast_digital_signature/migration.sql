-- AlterTable
ALTER TABLE `DeliveryDocument` ADD COLUMN `finalFilePath` VARCHAR(191) NULL,
    ADD COLUMN `kpSignedAt` DATETIME(3) NULL,
    ADD COLUMN `kpSignedById` VARCHAR(191) NULL,
    ADD COLUMN `picSignedAt` DATETIME(3) NULL,
    ADD COLUMN `picSignedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `UserProfile` ADD COLUMN `picName` VARCHAR(191) NULL,
    ADD COLUMN `picSignatureUrl` TEXT NULL;

-- CreateTable
CREATE TABLE `SignatureSession` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `signatureUrl` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
