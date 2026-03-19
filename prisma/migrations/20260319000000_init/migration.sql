-- CreateTable
CREATE TABLE "Submission" (
    "id"               SERIAL       NOT NULL,
    "submittedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name"             TEXT         NOT NULL,
    "email"            TEXT         NOT NULL,
    "phone"            TEXT         NOT NULL,
    "address"          TEXT,
    "city"             TEXT,
    "state"            TEXT,
    "zip"              TEXT,
    "preferredDate"    TEXT,
    "preferredTime"    TEXT,
    "preferredContact" TEXT,
    "message"          TEXT,
    "referralFirstName" TEXT,
    "referralLastName"  TEXT,
    "referralPhone"     TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);
