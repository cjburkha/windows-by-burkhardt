const crypto = require('crypto');
const { Pool } = require('pg');

// Email unsubscribe. The link in the email is /unsubscribe?id=<leadId>&t=<token>
// where token = HMAC-SHA256(UNSUBSCRIBE_SECRET, `${leadId}:${email}`) (full hex),
// matching send.py:_make_unsubscribe_token. The email isn't in the URL, so we
// look it up by leadId to recompute the token.
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

function expectedToken(leadId, email) {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'change-me';
  return crypto.createHmac('sha256', secret).update(`${leadId}:${email}`).digest('hex');
}

/**
 * Verify the signed unsubscribe link and set leads.unsubscribed_at.
 * Returns true if the token is valid for that lead (idempotent — repeated
 * clicks keep the first timestamp).
 */
async function unsubscribe(leadId, token) {
  const p = getPool();
  if (!p || !Number.isFinite(leadId)) return false;
  const r = await p.query('SELECT email FROM leads WHERE id = $1', [leadId]);
  if (!r.rows.length) return false;

  const expected = expectedToken(leadId, r.rows[0].email || '');
  if (!token || token.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return false;

  await p.query(
    'UPDATE leads SET unsubscribed_at = COALESCE(unsubscribed_at, NOW()) WHERE id = $1',
    [leadId],
  );
  return true;
}

module.exports = { unsubscribe };
