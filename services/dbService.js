const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

// Singleton — reuse the same connection pool across requests.
let prisma;

function getClient() {
  if (!prisma) {
    // Strip sslmode from the URL — we pass ssl config explicitly so pg
    // doesn't override rejectUnauthorized with its own sslmode handling.
    const connectionString = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/g, '');
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

/**
 * Save a consultation form submission to the database.
 * Returns the created record on success, or throws on failure.
 *
 * The caller (server.js) catches errors so a DB failure never
 * fails the HTTP response — the email notification is the
 * critical path; the DB write is supplementary.
 */
async function saveSubmission(data) {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set — skipping DB save.');
    return null;
  }

  const client = getClient();
  return client.submission.create({
    data: {
      name:              data.name,
      email:             data.email,
      phone:             data.phone,
      address:           data.address  || null,
      city:              data.city     || null,
      state:             data.state    || null,
      zip:               data.zip      || null,
      preferredDate:     data.preferredDate    || null,
      preferredTime:     data.preferredTime    || null,
      preferredContact:  data.preferredContact || null,
      message:           data.message          || null,
      referralFirstName: data.referralFirstName || null,
      referralLastName:  data.referralLastName  || null,
      referralPhone:     data.referralPhone     || null,
      tenantId:          data.tenantId          || 'burkhardt',
      isTestLead:        data.isTestLead        === true,
      // Attribution
      utmSource:         data.utmSource         || null,
      utmMedium:         data.utmMedium         || null,
      utmCampaign:       data.utmCampaign        || null,
      utmContent:        data.utmContent         || null,
      utmTerm:           data.utmTerm            || null,
      fbclid:            data.fbclid             || null,
      gclid:             data.gclid              || null,
    },
  });
}

/**
 * Save a $500 referral-program submission (/api/refer) to the database.
 * Same contract as saveSubmission: the tenant inbox email is the critical
 * path; the caller catches errors so a DB failure never fails the response.
 */
async function saveReferral(data) {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set — skipping referral DB save.');
    return null;
  }

  const client = getClient();
  return client.referral.create({
    data: {
      referrerName:   data.referrerName,
      referrerEmail:  data.referrerEmail  || null,
      referrerPhone:  data.referrerPhone  || null,
      refereeName:    data.refereeName,
      refereeEmail:   data.refereeEmail   || null,
      refereePhone:   data.refereePhone   || null,
      note:           data.note           || null,
      referrerCode:   data.referrerCode   || null,
      referrerLeadId: data.referrerLeadId ?? null,
      pageUrl:        data.pageUrl        || null,
      ip:             data.ip             || null,
      tenantId:       data.tenantId       || 'burkhardt',
    },
  });
}

/**
 * Return all active tenants. Used by server.js to build the in-memory
 * hostname → tenant map at startup.
 */
async function getActiveTenants() {
  if (!process.env.DATABASE_URL) return [];
  const client = getClient();
  return client.tenant.findMany({ where: { active: true } });
}

module.exports = { saveSubmission, saveReferral, getActiveTenants };
