/*
  Warnings:

  - The values [DIPROSES,DIKIRIM] on the enum `Request_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Request` MODIFY `status` ENUM('DRAFT', 'MENUNGGU', 'DISETUJUI', 'SIAP', 'DITERIMA', 'SELESAI', 'DITOLAK', 'DIBATALKAN') NOT NULL DEFAULT 'MENUNGGU';
