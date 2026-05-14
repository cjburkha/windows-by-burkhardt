const { Pool } = require('pg');

// Separate pool for the apex-email-campaigns database where shortlinks live.
// APEX_DATABASE_URL is read at first-use time so dev / test instances without
// it set just have shortlinks return null (and the route falls through).
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

/**
 * Look up a shortlink slug, increment its hit counter, and return target_url.
 * Returns null if APEX_DATABASE_URL isn't set or the slug doesn't exist.
 */
async function resolveAndCount(slug) {
  const p = getPool();
  if (!p) return null;
  const result = await p.query(
    `UPDATE shortlinks
        SET hits = hits + 1, last_hit_at = NOW()
      WHERE slug = $1
      RETURNING target_url`,
    [slug],
  );
  return result.rows[0]?.target_url || null;
}

module.exports = { resolveAndCount };
