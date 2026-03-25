/**
 * Multi-tenant branding + email tests.
 *
 * These tests run on two Playwright projects:
 *   - "burkhardt"  →  localhost:3000  (or BASE_URL in smoke tests)
 *   - "jose"       →  localhost:3001  (or JOSE_BASE_URL in smoke tests)
 *
 * In CI, each server is started with TEST_HOSTNAME set to its tenant domain so
 * resolveTenant() returns the correct config regardless of the Host header.
 *
 * In smoke tests (against production) the servers aren't spun up; traffic goes
 * through CloudFront which sets the X-Tenant-Domain custom origin header.
 *
 * The "(no mock)" tag in email tests causes deploy.yml to skip them on
 * frontend-only deploys (to avoid spurious emails for every CSS tweak).
 */
import { test, expect } from '@playwright/test';

// ── Expected values per tenant ────────────────────────────────────────────────

const TENANTS = {
  burkhardt: {
    brandName: 'Windows by Burkhardt',
    tagline:   'We come to you',            // partial — avoids em-dash encoding differences
    ga4Id:     'G-2CC9WZ2Q8V',
  },
  jose: {
    brandName: 'Windows by Jose',
    tagline:   'Work with the best, work with Jose',
    ga4Id:     'G-LCG2HZB0GD',
  },
} as const;

type TenantKey = keyof typeof TENANTS;

/** Returns expected values for the running project, defaulting to burkhardt. */
function t(projectName: string) {
  return TENANTS[projectName as TenantKey] ?? TENANTS.burkhardt;
}

// ── Branding ──────────────────────────────────────────────────────────────────

test.describe('Tenant branding', () => {
  test('page title contains brand name', async ({ page }, info) => {
    await page.goto('/');
    await expect(page).toHaveTitle(new RegExp(t(info.project.name).brandName));
  });

  test('header shows correct brand name', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.locator('.brand-name')).toContainText(t(info.project.name).brandName);
  });

  test('hero tagline is correct', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.locator('.hero-sub')).toContainText(t(info.project.name).tagline);
  });

  test('GA4 meta tag has correct measurement ID', async ({ page }, info) => {
    await page.goto('/');
    const content = await page.locator('meta[name="wbb-ga4-id"]').getAttribute('content');
    expect(content).toBe(t(info.project.name).ga4Id);
  });

  test('footer brand name is correct', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.locator('.footer-name')).toContainText(t(info.project.name).brandName);
  });

  test('footer copyright contains brand name', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.locator('.footer-bottom')).toContainText(t(info.project.name).brandName);
  });

  test('no unresolved {{TENANT_*}} tokens in page', async ({ page }) => {
    await page.goto('/');
    const html = await page.content();
    expect(html).not.toContain('{{TENANT_');
  });
});

// ── Email generation ──────────────────────────────────────────────────────────
//
// Submits a real (un-mocked) form to /api/contact and verifies that the
// emailPreview returned in test/dev mode contains the correct brand name.
//
// In smoke tests against production, emailPreview is not returned
// (NODE_ENV !== 'test'), so only the success flag is checked.
//
// The "(no mock)" suffix triggers the deploy.yml grep filter that skips
// these tests on frontend-only deploys.

test.describe('Email generation', () => {
  test('email body references correct brand name (no mock)', async ({ page }, info) => {
    const expected = t(info.project.name);

    await page.goto('/#schedule');

    // Step 1
    await page.fill('#name',  'Tenant Test User');
    await page.fill('#email', 'tenanttest@example.com');
    await page.fill('#phone', '5550001111');
    await page.click('.btn-submit');
    await expect(page.locator('#formStep2')).toBeVisible();

    // Step 2 — submit and capture the API response
    const responsePromise = page.waitForResponse(r => r.url().includes('/api/contact'));
    await page.click('.btn-submit');
    const response = await responsePromise;
    const body = await response.json() as { success: boolean; message?: string; emailPreview?: string };

    expect(body.success, `API error: ${body.message}`).toBe(true);

    // emailPreview is only present in test/dev mode (NODE_ENV=test or SKIP_EMAIL=true).
    // Skip the brand name assertion in smoke tests where it won't be returned.
    if (body.emailPreview) {
      expect(body.emailPreview, 'Email body should reference the correct brand name').toContain(expected.brandName);
    }
  });
});
