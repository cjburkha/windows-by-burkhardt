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

  gtag('js', new Date());
  gtag('config', 'G-2CC9WZ2Q8V', isAutomated ? { debug_mode: true } : {});

  // ── Funnel tracking helper ───────────────────────────────────────────────────
  // All funnel events share event_category:'consultation_funnel' so they can be
  // grouped in a GA4 Funnel Exploration report:
  //   Step 1 — schedule_cta_click   (any Schedule button/link)
  //   Step 2 — form_engagement      (first field interaction)
  //   Step 3 — form_step1_complete  (contact info submitted, advances to referral)
  //   Step 4 — generate_lead        (form fully submitted and accepted)
  window.wbbTrack = function(eventName, extraParams) {
    if (typeof gtag !== 'function') return;
    gtag('event', eventName, Object.assign({ event_category: 'consultation_funnel' }, extraParams || {}));
  };

  document.addEventListener('DOMContentLoaded', function() {

    // Step 1 — track every CTA that scrolls to the form
    document.querySelectorAll('a[href="#schedule"]').forEach(function(el) {
      el.addEventListener('click', function() {
        window.wbbTrack('schedule_cta_click', {
          event_label: el.textContent.trim().slice(0, 50)
        });
      });
    });

    // Step 2 — fire once when the user first interacts with any form field
    var form = document.getElementById('consultationForm');
    if (form) {
      var formEngaged = false;
      form.addEventListener('focusin', function(e) {
        if (!formEngaged && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
          formEngaged = true;
          window.wbbTrack('form_engagement');
        }
      });
    }
  });
})();
