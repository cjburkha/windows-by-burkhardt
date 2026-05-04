-- AlterTable: add lead attribution columns to Submission
ALTER TABLE "Submission"
  ADD COLUMN "utmSource"   TEXT,
  ADD COLUMN "utmMedium"   TEXT,
  ADD COLUMN "utmCampaign" TEXT,
  ADD COLUMN "utmContent"  TEXT,
  ADD COLUMN "utmTerm"     TEXT,
  ADD COLUMN "fbclid"      TEXT,
  ADD COLUMN "gclid"       TEXT;
