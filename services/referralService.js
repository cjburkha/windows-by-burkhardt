const crypto = require('crypto');
const { Pool } = require('pg');

// Referral codes are short, opaque, and HMAC-signed so they can't be enumerated.
//   code = base36(lead_id) + first 6 hex chars of HMAC-SHA256("ref:" + lead_id, secret)
// e.g. lead 1234 → "ya" + "a3f1c2" = "yaa3f1c2"
//
// The apex Python sender uses the identical algorithm so the same code generated
// at send time decodes back to the same lead_id here at click time.
//
// REFERRAL_SECRET is read at first-use. Falls back to PIXEL_SECRET so the same
// secret already used for the open-tracking pixel works for referrals too.

function _secret() {
  const s = process.env.REFERRAL_SECRET || process.env.PIXEL_SECRET || process.env.UNSUBSCRIBE_SECRET;
  if (!s || s === 'change-me') {
    throw new Error('REFERRAL_SECRET (or PIXEL_SECRET) is not configured');
  }
  return s;
}

function encodeReferralCode(leadId) {
  const id = Number(leadId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('lead id must be a positive integer');
  const idPart = id.toString(36);
  const mac = crypto.createHmac('sha256', _secret()).update(`ref:${id}`).digest('hex').slice(0, 6);
  return `${idPart}${mac}`;
}

function decodeReferralCode(code) {
  if (typeof code !== 'string' || code.length < 7 || code.length > 24) return null;
  if (!/^[a-z0-9]+$/i.test(code)) return null;
  const macPart = code.slice(-6).toLowerCase();
  const idPart = code.slice(0, -6);
  const leadId = parseInt(idPart, 36);
  if (!Number.isFinite(leadId) || leadId <= 0) return null;
  let expectedMac;
  try {
    expectedMac = crypto.createHmac('sha256', _secret()).update(`ref:${leadId}`).digest('hex').slice(0, 6);
  } catch (_) { return null; }
  const a = Buffer.from(macPart);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return leadId;
}

// Separate pool for the apex DB where leads live. Same pattern as shortlinkService.
let pool;
function getPool() {
  if (pool) return pool;
  const url = process.env.APEX_DATABASE_URL;
  if (!url) return null;
  pool = new Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

async function lookupReferrer(leadId) {
  const p = getPool();
  if (!p) return null;
  const result = await p.query(
    `SELECT id, first_name, last_name, email, phone_primary, city, state
       FROM leads
      WHERE id = $1
      LIMIT 1`,
    [leadId],
  );
  return result.rows[0] || null;
}

module.exports = {
  encodeReferralCode,
  decodeReferralCode,
  lookupReferrer,
};
