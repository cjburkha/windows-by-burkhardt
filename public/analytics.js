window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}

(function() {
  // Skip analytics entirely in local dev and CI test environments.
  var hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
    return;
  }

  // Playwright (and all WebDriver-based automation) sets navigator.webdriver = true.
  // Use debug_mode so GA4 routes these sessions to DebugView only,
  // excluding them from standard reports.
  var isAutomated = !!navigator.webdriver;

  // GA4 measurement ID is injected per-tenant via <meta name="wbb-ga4-id">.
  // Falls back to empty string when no ID is configured (e.g. new tenants).
  var ga4Id = ((document.querySelector('meta[name="wbb-ga4-id"]') || {}).content || '').trim();

  if (ga4Id) {
    gtag('js', new Date());
    gtag('config', ga4Id, isAutomated ? { debug_mode: true } : {});
  }

  // ── Funnel tracking helper ───────────────────────────────────────────────────
  // All funnel events share event_category:'consultation_funnel' so they can be
  // grouped in a GA4 Funnel Exploration report:
  //   Step 1 — schedule_cta_click   (any Schedule button/link)       → script.js
  //   Step 2 — form_engagement      (first field interaction)        → script.js
  //   Step 3 — form_step1_complete  (contact info submitted, advances to referral) → script.js
  //   Step 4 — generate_lead        (form fully submitted and accepted)            → script.js
  //
  // DOM listeners live in script.js (runs after DOM is built) to avoid any
  // DOMContentLoaded timing ambiguity when analytics.js is in <head>.
  window.wbbTrack = function(eventName, extraParams) {
    if (!ga4Id) return; // GA4 not configured for this tenant
    gtag('event', eventName, Object.assign({ event_category: 'consultation_funnel' }, extraParams || {}));
  };
})();
