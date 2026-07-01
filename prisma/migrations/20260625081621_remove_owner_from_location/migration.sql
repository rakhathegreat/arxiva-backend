/*
  Warnings:

  - You are about to drop the column `owner` on the `Location` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Location` DROP COLUMN `owner`;

-- AlterTable
ALTER TABLE `Notification` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `User` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserProfile` ALTER COLUMN `updatedAt` DROP DEFAULT;
