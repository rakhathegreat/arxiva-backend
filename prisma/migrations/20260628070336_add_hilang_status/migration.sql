-- AlterTable
ALTER TABLE `Item` MODIFY `status` ENUM('tersedia', 'digunakan', 'rusak', 'hilang') NOT NULL DEFAULT 'tersedia';

-- AlterTable
ALTER TABLE `Notification` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `User` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserProfile` ALTER COLUMN `updatedAt` DROP DEFAULT;
