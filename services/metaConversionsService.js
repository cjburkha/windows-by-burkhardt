/**
 * Meta Conversions API (CAPI) Service
 *
 * Sends server-side conversion events to Meta alongside the browser pixel.
 * Meta deduplicates them using the shared event_id, so each conversion is
 * counted once even though it arrives from two sources (better signal quality).
 *
 * Required env vars:
 *   META_PIXEL_ID        — your pixel ID (same one in the HTML snippet)
 *   META_CAPI_TOKEN      — access token from Events Manager → Settings → Conversions API
 *
 * Optional env vars:
 *   META_CAPI_TEST_CODE  — test_event_code from Events Manager → Test Events tab.
 *                          Set this locally so events appear under Test Events
 *                          without polluting real conversion data.
 *
 * All PII fields (email, phone, name, address) must be SHA-256 hashed before
 * sending. Meta documents the exact normalisation rules below each field.
 */

const crypto = require('crypto');

const CAPI_TOKEN = process.env.META_CAPI_TOKEN;
const TEST_CODE  = process.env.META_CAPI_TEST_CODE; // optional — for local/staging testing
const GRAPH_API_VERSION = 'v20.0';

/**
 * Normalise then SHA-256 hash a string, returning the hex digest.
 * Returns null if the input is falsy so we can omit fields cleanly.
 */
function hash(value) {
  if (!value) return null;
  const normalised = String(value).trim().toLowerCase();
  return crypto.createHash('sha256').update(normalised).digest('hex');
}

/**
 * Normalise a phone number to digits only (E.164 without the leading +),
 * then hash. Meta's normalisation rule: digits only, no country code prefix
 * unless it's a 10-digit US number (no prefix needed).
 */
function hashPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  // Strip leading 1 if it looks like a US number with country code
  const normalised = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  return crypto.createHash('sha256').update(normalised).digest('hex');
}

/**
 * Send a `Schedule` conversion event to the Meta Conversions API.
 *
 * @param {object} params
 * @param {string}  params.pixelId            - Tenant's Meta Pixel ID
 * @param {string}  params.name              - Full name from form
 * @param {string}  params.email             - Email from form
 * @param {string}  params.phone             - Phone from form
 * @param {string}  [params.city]
 * @param {string}  [params.zip]
 * @param {string}  [params.userAgent]       - Browser User-Agent header
 * @param {string}  [params.eventId]         - Unique ID shared with browser pixel for dedup
 * @param {string}  [params.eventSourceUrl]  - Full page URL where the form lives
 */
async function sendScheduleEvent(params) {
  const { pixelId } = params;
  if (!pixelId || !CAPI_TOKEN) {
    // Silently skip — pixel not configured for this tenant, or CAPI token missing
    console.log(`[MetaCAPI] Skipped: ${!pixelId ? 'no pixelId for tenant' : 'META_CAPI_TOKEN not set'}`);
    return;
  }

  const capiUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;

  const {
    name, email, phone, city, zip,
    userAgent, eventId,
    eventSourceUrl = 'https://windowsbyburkhardt.com/'
  } = params;

  // Split full name into first / last for better match rates
  const nameParts = (name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';

  const userData = {
    // Hashed PII
    em: hash(email),
    ph: hashPhone(phone),
    fn: hash(firstName),
    ln: hash(lastName),
    ct: hash(city),
    zp: hash(zip),
    // Unhashed — browser-sourced
    ...(userAgent && { client_user_agent: userAgent }),
  };

  // Remove null values — Meta rejects null hashes
  for (const key of Object.keys(userData)) {
    if (userData[key] === null || userData[key] === undefined) {
      delete userData[key];
    }
  }

  const eventPayload = {
    event_name: 'Schedule',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: eventSourceUrl,
    user_data: userData,
    ...(eventId && { event_id: eventId }),
    custom_data: {
      content_name: 'Free Window Consultation',
      content_category: 'Home Services',
    },
  };

  const body = {
    data: [eventPayload],
    ...(TEST_CODE && { test_event_code: TEST_CODE }),
  };

  try {
    const response = await fetch(`${capiUrl}?access_token=${CAPI_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await response.json();

    if (!response.ok) {
      console.error('[MetaCAPI] Error response:', JSON.stringify(json));
    } else {
      const mode = TEST_CODE ? `TEST (code: ${TEST_CODE})` : 'LIVE';
      console.log(`[MetaCAPI] Schedule event sent [${mode}] — events_received: ${json.events_received ?? '?'}`);
    }
  } catch (err) {
    // Never throw — a CAPI failure must not break the form submission
    console.error('[MetaCAPI] Network/fetch error:', err.message);
  }
}

module.exports = { sendScheduleEvent };
