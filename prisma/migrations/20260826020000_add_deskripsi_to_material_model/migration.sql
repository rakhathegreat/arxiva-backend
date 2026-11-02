-- Tambahkan kolom deskripsi pada model material.
ALTER TABLE `MaterialModel` ADD COLUMN IF NOT EXISTS `deskripsi` VARCHAR(191) NULL;
