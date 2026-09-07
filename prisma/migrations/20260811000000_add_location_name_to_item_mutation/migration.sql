-- AlterTable: add originLocationName and destinationLocationName to ItemMutation
ALTER TABLE `ItemMutation` ADD COLUMN IF NOT EXISTS `originLocationName` VARCHAR(191) NULL;
ALTER TABLE `ItemMutation` ADD COLUMN IF NOT EXISTS `destinationLocationName` VARCHAR(191) NULL;
