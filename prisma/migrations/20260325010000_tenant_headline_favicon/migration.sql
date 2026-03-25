-- Rename tagline → headline, add favicon column with per-tenant defaults.

ALTER TABLE "Tenant" RENAME COLUMN "tagline" TO "headline";

ALTER TABLE "Tenant" ADD COLUMN "favicon" TEXT NOT NULL DEFAULT '/favicon.svg';

-- Set correct headline and favicon values for both tenants
UPDATE "Tenant" SET
  "headline" = 'There&#8217;s gotta be<br><em>a better window.</em>',
  "favicon"  = '/favicon.svg'
WHERE id = 'burkhardt';

UPDATE "Tenant" SET
  "headline" = 'Work with the best,<br>work with Jose.',
  "favicon"  = '/favicon-jose.svg'
WHERE id = 'jose';
