-- AlterTable
ALTER TABLE `Location` ADD COLUMN `owner` VARCHAR(191) NOT NULL DEFAULT 'KP';

-- AlterTable
ALTER TABLE `Notification` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `User` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserProfile` ALTER COLUMN `updatedAt` DROP DEFAULT;
