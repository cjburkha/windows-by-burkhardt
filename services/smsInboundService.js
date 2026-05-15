const crypto = require('crypto');
const { Pool } = require('pg');

let pool;

function getPool() {
  if (pool) return pool;
  const url = process.env.APEX_DATABASE_URL;
  if (!url) return null;
  const connectionString = url.replace(/[?&]sslmode=[^&]*/g, '');
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

// CTIA-mandated opt-out keywords. Match is case-insensitive on a trimmed body.
const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);

function isStopKeyword(text) {
  if (!text) return false;
  const first = text.trim().split(/\s+/)[0] || '';
  return STOP_KEYWORDS.has(first.toUpperCase());
}

// Mandrill signs requests as: Base64(HMAC-SHA1(webhookKey, url + concat(sortedKey + value for each POST field)))
function verifyMandrillSignature(req, webhookKey, webhookUrl) {
  const sig = req.header('X-Mandrill-Signature');
  if (!sig || !webhookKey || !webhookUrl) return false;
  let signedData = webhookUrl;
  const params = req.body || {};
  for (const k of Object.keys(params).sort()) {
    signedData += k + (params[k] == null ? '' : String(params[k]));
  }
  const expected = crypto.createHmac('sha1', webhookKey).update(signedData).digest('base64');
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

// Reduce any phone shape to its trailing 10 digits for matching against stored
// lead phones (which live in mixed formats like '4145501960', '(414) 439-1603').
function lastTenDigits(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

async function findLeadIdByPhone(p, phone) {
  const tail = lastTenDigits(phone);
  if (!tail) return null;
  const { rows } = await p.query(
    `SELECT id FROM leads
      WHERE RIGHT(regexp_replace(COALESCE(phone_primary,   ''), '\\D', '', 'g'), 10) = $1
         OR RIGHT(regexp_replace(COALESCE(phone_secondary, ''), '\\D', '', 'g'), 10) = $1
      ORDER BY id
      LIMIT 1`,
    [tail],
  );
  return rows.length ? rows[0].id : null;
}

/**
 * Persist one Mandrill SMS inbound event. Idempotent on mandrill_id.
 * If text is a STOP keyword, mark the matched lead as unsubscribed.
 */
async function recordInbound(event) {
  const p = getPool();
  if (!p) return { ok: false, reason: 'no-db' };
  const msg = event.msg || {};
  const fromPhone = msg.from_phone || msg.from || '';
  const toPhone   = msg.to_phone   || msg.to   || null;
  const text      = msg.text || '';
  const mandrillId = msg._id || null;
  const stop = isStopKeyword(text);

  const leadId = await findLeadIdByPhone(p, fromPhone);

  await p.query(
    `INSERT INTO sms_inbound_events
       (mandrill_id, from_phone, to_phone, message_text, is_stop, lead_id, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (mandrill_id) DO NOTHING`,
    [mandrillId, fromPhone, toPhone, text, stop, leadId, JSON.stringify(event)],
  );

  if (stop && leadId) {
    await p.query(
      `UPDATE leads SET unsubscribed_at = COALESCE(unsubscribed_at, NOW()) WHERE id = $1`,
      [leadId],
    );
  }

  return { ok: true, leadId, stop };
}

module.exports = { verifyMandrillSignature, recordInbound, isStopKeyword, lastTenDigits };
