-- AddItem.kondisi: kolom ini ada di schema.prisma sejak fitur barang masuk,
-- tapi tidak pernah dibuatkan migrasi sehingga DB produksi tidak punya kolomnya (P2022).
ALTER TABLE `Item` ADD COLUMN IF NOT EXISTS `kondisi` VARCHAR(191) NOT NULL DEFAULT 'Baru';
