ALTER TABLE "Tenant" ADD COLUMN "ccEmail" TEXT;
UPDATE "Tenant" SET "recipientEmail" = 'jose.martinez@apexenergygroup.com', "ccEmail" = 'chris.burkhardt@live.com' WHERE id = 'jose';
