-- Add Request.destinationUserId: user/mitra tujuan (peminjaman antar-mitra,
-- disetujui admin) yang ditunjuk oleh requester saat membuat request.
ALTER TABLE `Request` ADD COLUMN IF NOT EXISTS `destinationUserId` VARCHAR(191) NULL;
CREATE INDEX IF NOT EXISTS `Request_destinationUserId_idx` ON `Request`(`destinationUserId`);
ALTER TABLE `Request` ADD CONSTRAINT `Request_destinationUser_fkey` FOREIGN KEY (`destinationUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
