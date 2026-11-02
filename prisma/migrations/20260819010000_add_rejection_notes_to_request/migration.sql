-- AlterTable: add rejectionNotes to Request
ALTER TABLE `Request` ADD COLUMN IF NOT EXISTS `rejectionNotes` VARCHAR(191) NULL;