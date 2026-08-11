-- AlterTable: convert signature URL columns to LONGTEXT to accommodate base64 signatures
ALTER TABLE `UserProfile` MODIFY `picSignatureUrl` LONGTEXT NULL;
ALTER TABLE `DeliveryDocument` MODIFY `kpSignatureUrl` LONGTEXT NULL;
ALTER TABLE `DeliveryDocument` MODIFY `signerSignatureUrl` LONGTEXT NULL;
ALTER TABLE `SignatureSession` MODIFY `signatureUrl` LONGTEXT NULL;
