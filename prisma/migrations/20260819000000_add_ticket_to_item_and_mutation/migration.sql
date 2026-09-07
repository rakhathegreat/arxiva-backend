-- AlterTable: add ticket reference to Item and ItemMutation
ALTER TABLE `Item` ADD COLUMN IF NOT EXISTS `ticket` VARCHAR(191) NULL;
ALTER TABLE `ItemMutation` ADD COLUMN IF NOT EXISTS `ticket` VARCHAR(191) NULL;