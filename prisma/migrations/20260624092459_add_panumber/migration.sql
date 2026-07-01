/*
  Warnings:

  - Added the required column `PaNumber` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Notification` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `PaNumber` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `User` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserProfile` ALTER COLUMN `updatedAt` DROP DEFAULT;
