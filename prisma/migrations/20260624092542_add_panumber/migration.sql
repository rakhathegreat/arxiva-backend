/*
  Warnings:

  - You are about to drop the column `PaNumber` on the `Transaction` table. All the data in the column will be lost.
  - Added the required column `paNumber` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Notification` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Transaction` DROP COLUMN `PaNumber`,
    ADD COLUMN `paNumber` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `User` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UserProfile` ALTER COLUMN `updatedAt` DROP DEFAULT;
