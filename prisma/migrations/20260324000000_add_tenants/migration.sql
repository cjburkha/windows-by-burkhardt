-- CreateTable: Tenant registry
CREATE TABLE "Tenant" (
    "id"             TEXT    NOT NULL,
    "domain"         TEXT    NOT NULL,
    "brandName"      TEXT    NOT NULL,
    "tagline"        TEXT    NOT NULL,
    "fromEmail"      TEXT    NOT NULL,
    "recipientEmail" TEXT    NOT NULL,
    "ga4Id"          TEXT    NOT NULL,
    "active"         BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- Unique index on domain for fast hostname lookups
CREATE UNIQUE INDEX "Tenant_domain_key" ON "Tenant"("domain");

-- Seed initial tenants
-- recipientEmail for jose starts as chris.burkhardt@live.com for testing;
-- UPDATE "Tenant" SET "recipientEmail" = 'jose.martinez@apexenergygroup.com'
-- WHERE id = 'jose' once his domain/SES are verified.
INSERT INTO "Tenant" ("id", "domain", "brandName", "tagline", "fromEmail", "recipientEmail", "ga4Id")
VALUES
  (
    'burkhardt',
    'windowsbyburkhardt.com',
    'Windows by Burkhardt',
    'We come to you — schedule your free, no-pressure consultation today.',
    'noreply@windowsbyburkhardt.com',
    'chris.burkhardt@live.com',
    'G-2CC9WZ2Q8V'
  ),
  (
    'jose',
    'windowsbyjose.com',
    'Windows by Jose',
    'Work with the best, work with Jose.',
    'noreply@windowsbyjose.com',
    'chris.burkhardt@live.com',
    'G-LCG2HZB0GD'
  );

-- Add tenantId to Submission (existing rows get default 'burkhardt')
ALTER TABLE "Submission" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'burkhardt';

-- Foreign key: Submission → Tenant
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
