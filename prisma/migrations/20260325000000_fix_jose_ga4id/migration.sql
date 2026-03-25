-- Fix: seed migration set Jose's ga4Id to '' — update to the correct value.
-- The WHERE guard makes this safe to re-run.
UPDATE "Tenant"
SET "ga4Id" = 'G-LCG2HZB0GD'
WHERE id = 'jose' AND "ga4Id" = '';
