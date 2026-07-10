/*
  Warnings:

  - You are about to drop the column `categoryId` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `RequestItem` table. All the data in the column will be lost.
  - You are about to drop the `Category` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `materialCategoryId` to the `Brand` table without a default value. This is not possible if the table is not empty.
  - Added the required column `materialCategoryId` to the `Item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `materialCategoryId` to the `RequestItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `Brand` DROP FOREIGN KEY `Brand_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `Item` DROP FOREIGN KEY `Item_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `RequestItem` DROP FOREIGN KEY `RequestItem_categoryId_fkey`;

-- DropIndex
DROP INDEX `Brand_categoryId_fkey` ON `Brand`;

-- DropIndex
DROP INDEX `Item_categoryId_idx` ON `Item`;

-- DropIndex
DROP INDEX `RequestItem_categoryId_fkey` ON `RequestItem`;

-- AlterTable
ALTER TABLE `Brand` DROP COLUMN `categoryId`,
    ADD COLUMN `materialCategoryId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `Item` DROP COLUMN `categoryId`,
    ADD COLUMN `materialCategoryId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `RequestItem` DROP COLUMN `categoryId`,
    ADD COLUMN `materialCategoryId` INTEGER NOT NULL;

-- DropTable
DROP TABLE `Category`;

-- CreateTable
CREATE TABLE `MaterialCategory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(191) NOT NULL,
    `materialType` VARCHAR(191) NOT NULL,
    `safetyStock` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Item_materialCategoryId_idx` ON `Item`(`materialCategoryId`);

-- AddForeignKey
ALTER TABLE `Brand` ADD CONSTRAINT `Brand_materialCategoryId_fkey` FOREIGN KEY (`materialCategoryId`) REFERENCES `MaterialCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_materialCategoryId_fkey` FOREIGN KEY (`materialCategoryId`) REFERENCES `MaterialCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequestItem` ADD CONSTRAINT `RequestItem_materialCategoryId_fkey` FOREIGN KEY (`materialCategoryId`) REFERENCES `MaterialCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
