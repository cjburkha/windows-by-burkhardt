require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const xss = require('xss');
const emailService = require('./services/emailService');
const dbService    = require('./services/dbService');

// ── Tenant registry ──────────────────────────────────────────────────────────────────
// Tenants are loaded from the DB at startup and held in memory.
//
// FALLBACK_TENANTS serves two purposes:
//   1. Dev/test — no DB available, use hardcoded values.
//   2. Production safety net — if DB is unreachable at boot, site still works.
//
// Tenant resolution order (first match wins):
//   a. TEST_HOSTNAME env var — only in NODE_ENV=test, lets CI run two server
//      instances (ports 3000/3001) each simulating a different tenant.
//   b. req.hostname — App Runner native custom domains preserve the Host header
//      so this correctly returns the viewer's domain in production.
const FALLBACK_TENANTS = {
  'windowsbyburkhardt.com': {
    id:             'burkhardt',
    domain:         'windowsbyburkhardt.com',
    brandName:      'Windows by Burkhardt',
    headline:       'There&#8217;s gotta be<br><em>a better window.</em>',
    favicon:        '/favicon.svg',
    fromEmail:      'noreply@windowsbyburkhardt.com',
    recipientEmail: 'chris.burkhardt@live.com',
    ga4Id:          'G-2CC9WZ2Q8V',
  },
  'windowsbyjose.com': {
    id:             'jose',
    domain:         'windowsbyjose.com',
    brandName:      'Windows by Jose',
    headline:       'Work with the best,<br>work with Jose.',
    favicon:        '/favicon-jose.svg',
    fromEmail:      'noreply@windowsbyjose.com',
    recipientEmail: 'jose.martinez@apexenergygroup.com',
    ccEmail:        'chris.burkhardt@live.com',
    ga4Id:          'G-LCG2HZB0GD',
  },
};

let tenantMap = { ...FALLBACK_TENANTS };

function resolveTenant(req) {
  const raw =
    (process.env.NODE_ENV === 'test' && process.env.TEST_HOSTNAME)
      ? process.env.TEST_HOSTNAME
      : (req.hostname || '');
  const domain = raw.replace(/^www\./, '');
  return tenantMap[domain] || FALLBACK_TENANTS['windowsbyburkhardt.com'];
}

async function loadTenants() {
  try {
    const tenants = await dbService.getActiveTenants();
    if (tenants.length === 0) return; // no DB — keep fallback map
    const map = { ...FALLBACK_TENANTS }; // start from fallback so both tenants always exist
    for (const t of tenants) {
      const fallback = FALLBACK_TENANTS[t.domain] || {};
      // Merge field-by-field: DB value wins unless it is null/empty string,
      // in which case the hardcoded fallback is kept as a safety net.
      map[t.domain] = Object.fromEntries(
        Object.entries({ ...fallback, ...t }).map(([k, v]) =>
          [k, (v !== null && v !== '') ? v : fallback[k]]
        )
      );
    }
    tenantMap = map;
    console.log(`Loaded ${tenants.length} tenant(s): ${Object.keys(map).join(', ')}`);
  } catch (err) {
    console.warn('Could not load tenants from DB, using fallback config:', err.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  // Allow GA4 to receive the referrer so traffic sources are tracked correctly
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://wbb-static-prod.s3.us-east-1.amazonaws.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "https://www.googletagmanager.com", "https://wbb-static-prod.s3.us-east-1.amazonaws.com"],
      imgSrc: ["'self'", "data:", "https://www.google-analytics.com"],
      connectSrc: ["'self'", "https://www.google-analytics.com", "https://analytics.google.com", "https://region1.google-analytics.com", "https://stats.g.doubleclick.net"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  }
}));
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // same-origin requests
    try {
      const domain = new URL(origin).hostname.replace(/^www\./, '');
      if (domain === 'localhost' || domain === '127.0.0.1' || tenantMap[domain]) {
        return callback(null, true);
      }
    } catch (e) {}
    callback(new Error('Not allowed by CORS'));
  }
}));

// Limit request body size to 10kb to prevent payload flooding
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));

// Rate limit the contact endpoint: max 5 submissions per 15 min per IP (production).
// Relaxed to 100 in development/test so repeated test runs don't exhaust the limit.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  message: { success: false, message: 'Too many requests. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Serve static files
// HTML: always revalidate so browsers pick up new deploys immediately.
// CSS/JS/images: 1-day cache — CloudFront invalidation clears CDN on deploy;
//   the ASSET_VERSION query string in index.html busts browser caches.
app.use(express.static('public', {
  index: false, // Disable automatic index.html serving — app.get('/') handles it
                // so tenant tokens are injected per-request by renderHtml().
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Inject ASSET_VERSION (git SHA or timestamp) into index.html so CSS/JS
// cache-buster query strings update automatically on every deploy.
// ASSET_BASE_URL is the S3 bucket URL in production — static assets are served
// from S3 so CSS/JS changes can deploy in ~15s without a Docker rebuild.
// In local dev (ASSET_BASE_URL unset) Express serves them directly.
// {{TENANT_*}} tokens are replaced per-request by renderHtml().
const ASSET_VERSION = process.env.ASSET_VERSION || Date.now().toString();
const ASSET_BASE    = (process.env.ASSET_BASE_URL || '').replace(/\/$/, '');
const pfx = (name) => ASSET_BASE ? `${ASSET_BASE}/${name}` : name;
const fs = require('fs');
let indexHtmlTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
indexHtmlTemplate = indexHtmlTemplate
  .replace(/href="styles\.css(\?[^"]*)?"/g,   `href="${pfx('styles.css')}?v=${ASSET_VERSION}"`)
  .replace(/src="script\.js(\?[^"]*)?"/g,     `src="${pfx('script.js')}?v=${ASSET_VERSION}"`)
  .replace(/src="analytics\.js(\?[^"]*)?"/g,  `src="${pfx('analytics.js')}?v=${ASSET_VERSION}"`);

function renderHtml(tenant) {
  let html = indexHtmlTemplate
    .replace(/\{\{TENANT_BRAND_NAME\}\}/g, tenant.brandName)
    .replace(/\{\{TENANT_HEADLINE\}\}/g,    tenant.headline)
    .replace(/\{\{TENANT_FAVICON\}\}/g,     tenant.favicon || '/favicon.svg')
    .replace(/\{\{TENANT_GA4_ID\}\}/g,      tenant.ga4Id || '');
  // Strip the gtag loader script entirely when no GA4 ID is configured
  if (!tenant.ga4Id) {
    html = html.replace(/<script[^>]*googletagmanager\.com[^>]*><\/script>\n?/g, '');
  }
  return html;
}

loadTenants();

// Routes
app.get('/', (req, res) => {
  const tenant = resolveTenant(req);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html');
  res.send(renderHtml(tenant));
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const tenant = resolveTenant(req);
    let { name, email, phone, address, city, state, zip, preferredDate, preferredTime, preferredContact, message,
          referralFirstName, referralLastName, referralPhone } = req.body;

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({ success: false, message: 'Name, email, and phone are required fields.' });
    }

    // Validate email format
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    // Validate field lengths to prevent abuse
    if (name.length > 100 || email.length > 254 || phone.length > 20 ||
        (address && address.length > 200) || (message && message.length > 2000)) {
      return res.status(400).json({ success: false, message: 'One or more fields exceed the maximum allowed length.' });
    }

    // Sanitize all string inputs to strip XSS payloads
    name        = xss(validator.trim(name));
    email       = validator.normalizeEmail(email) || email;
    phone       = validator.trim(phone).replace(/[^\d\s\-()+.]/g, '');
    address     = address     ? xss(validator.trim(address))     : '';
    city        = city        ? xss(validator.trim(city))        : '';
    state       = state       ? validator.trim(state).replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase() : '';
    zip         = zip         ? validator.trim(zip).replace(/\D/g, '').substring(0, 5) : '';
    message     = message     ? xss(validator.trim(message))     : '';
    preferredTime = preferredTime ? validator.trim(preferredTime) : '';
    preferredContact = preferredContact && ['Email','Phone','Text'].includes(preferredContact) ? preferredContact : '';
    referralFirstName = referralFirstName ? xss(validator.trim(referralFirstName)).substring(0, 100) : '';
    referralLastName  = referralLastName  ? xss(validator.trim(referralLastName)).substring(0, 100)  : '';
    referralPhone     = referralPhone     ? validator.trim(referralPhone).replace(/[^\d\s\-()+.]/g, '').substring(0, 20) : '';

    // Validate date is a real future date if provided
    if (preferredDate) {
      if (!validator.isDate(preferredDate) || new Date(preferredDate) < new Date()) {
        preferredDate = '';
      }
    }

    const emailResult = await emailService.sendConsultationRequest({
      name, email, phone, address, city, state, zip, preferredDate, preferredTime, preferredContact, message,
      referralFirstName, referralLastName, referralPhone
    }, tenant);

    if (emailResult.success) {
      // Save to database — non-blocking. A DB failure logs but never fails the response.
      dbService.saveSubmission({
        name, email, phone, address, city, state, zip,
        preferredDate, preferredTime, preferredContact, message,
        referralFirstName, referralLastName, referralPhone,
        tenantId: tenant.id
      }).catch(err => console.error('DB save failed:', err.message));

      res.json({ 
        success: true, 
        message: 'Your consultation request has been submitted successfully!',
        ...((process.env.NODE_ENV === 'test' || process.env.SKIP_EMAIL === 'true') && { emailPreview: emailResult.emailBody })
      });
    } else {
      throw new Error(emailResult.error);
    }
  } catch (error) {
    console.error('Error processing contact form:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit your request. Please try again later.' 
    });
  }
});

// Health check endpoint for AWS
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
