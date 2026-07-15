-- CreateTable
CREATE TABLE "Referral" (
    "id" SERIAL NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL DEFAULT 'burkhardt',
    "referrerName" TEXT NOT NULL,
    "referrerEmail" TEXT,
    "referrerPhone" TEXT,
    "refereeName" TEXT NOT NULL,
    "refereeEmail" TEXT,
    "refereePhone" TEXT,
    "note" TEXT,
    "referrerCode" TEXT,
    "referrerLeadId" INTEGER,
    "pageUrl" TEXT,
    "ip" TEXT,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
