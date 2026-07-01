-- AlterTable
ALTER TABLE `Level` ADD COLUMN `sheetId` VARCHAR(191) NULL,
    ADD COLUMN `sheetUrl` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Notification` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `User` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserProfile` ALTER COLUMN `updatedAt` DROP DEFAULT;
