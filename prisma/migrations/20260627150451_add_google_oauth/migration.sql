-- AlterTable
ALTER TABLE `Notification` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `googleAccessToken` TEXT NULL,
    ADD COLUMN `googleConnected` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `googleEmail` VARCHAR(191) NULL,
    ADD COLUMN `googleRefreshToken` TEXT NULL,
    ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserProfile` ALTER COLUMN `updatedAt` DROP DEFAULT;
