-- Buat tabel ReconRecord untuk penyimpanan data rekon harian material terdistribusi.
CREATE TABLE IF NOT EXISTS `ReconRecord` (
  `id` VARCHAR(191) NOT NULL,
  `itemId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `date` VARCHAR(191) NOT NULL,
  `imageUrl` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `ReconRecord_itemId_date_key`(`itemId`, `date`),
  INDEX `ReconRecord_userId_idx`(`userId`),
  INDEX `ReconRecord_date_idx`(`date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
