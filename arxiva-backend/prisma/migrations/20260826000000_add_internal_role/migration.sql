-- Tambahkan role INTERNAL (staf kantor KP) ke enum Role.
ALTER TABLE `User` MODIFY COLUMN `role` ENUM('ADMIN', 'INTERNAL', 'MITRA') NOT NULL DEFAULT 'MITRA';
