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
})();
