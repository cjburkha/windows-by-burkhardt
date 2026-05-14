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

function expectedToken(campaignId, leadId, week) {
  const secret = process.env.PIXEL_SECRET || process.env.UNSUBSCRIBE_SECRET || 'change-me';
  const msg = `${campaignId}:${leadId}:${week}`;
  return crypto.createHmac('sha256', secret).update(msg).digest('hex').slice(0, 16);
}

function verifyToken(campaignId, leadId, week, token) {
  const expected = expectedToken(campaignId, leadId, week);
  // timingSafeEqual requires equal-length buffers
  if (!token || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

/**
 * Record an open event. UPSERT on (campaign_id, lead_id, week).
 * First open inserts; subsequent opens bump hits and last_open_at.
 */
async function recordOpen(campaignId, leadId, week) {
  const p = getPool();
  if (!p) return false;
  await p.query(
    `INSERT INTO campaign_open_events (campaign_id, lead_id, week)
       VALUES ($1, $2, $3)
     ON CONFLICT (campaign_id, lead_id, week) DO UPDATE
       SET hits = campaign_open_events.hits + 1,
           last_open_at = NOW()`,
    [campaignId, leadId, week],
  );
  return true;
}

module.exports = { verifyToken, recordOpen };
