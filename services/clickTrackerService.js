const crypto = require('crypto');
const { Pool } = require('pg');

// Per-lead email click tracking. Mirrors openTrackerService: same HMAC token
// scheme (so drip.py can reuse its pixel token) and the same apex DB pool.
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
  if (!token || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

/**
 * Record a per-lead click. UPSERT on (campaign_id, lead_id, week).
 * First click inserts; subsequent clicks bump hits and last_click_at.
 */
async function recordClick(campaignId, leadId, week) {
  const p = getPool();
  if (!p) return false;
  await p.query(
    `INSERT INTO campaign_click_events (campaign_id, lead_id, week)
       VALUES ($1, $2, $3)
     ON CONFLICT (campaign_id, lead_id, week) DO UPDATE
       SET hits = campaign_click_events.hits + 1,
           last_click_at = NOW()`,
    [campaignId, leadId, week],
  );
  return true;
}

/**
 * Resolve the real destination for this campaign/week's EMAIL link from the
 * shortlinks table, and bump that slug's aggregate hit counter so existing
 * campaign-level reporting keeps working. Returns target_url or null.
 */
async function resolveTarget(campaignId, week) {
  const p = getPool();
  if (!p) return null;
  const result = await p.query(
    `UPDATE shortlinks
        SET hits = hits + 1, last_hit_at = NOW()
      WHERE campaign_id = $1 AND week = $2 AND slug LIKE '%-em-%'
      RETURNING target_url`,
    [campaignId, week],
  );
  return result.rows[0]?.target_url || null;
}

module.exports = { verifyToken, recordClick, resolveTarget };
