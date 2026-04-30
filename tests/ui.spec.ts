import { test, expect } from '@playwright/test';

test.describe('Page load', () => {
  test('has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Windows by Burkhardt/);
  });
});

test.describe('Consultation form – step 1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#schedule');
  });

  test('step 1 is visible, step 2 and confirmation hidden on load', async ({ page }) => {
    await expect(page.locator('#formStep1')).toBeVisible();
    await expect(page.locator('#formStep2')).toBeHidden();
    await expect(page.locator('#formConfirmation')).toBeHidden();
    await expect(page.locator('.field-submit')).toBeVisible();
    await expect(page.locator('.btn-submit')).toHaveText('Schedule My Free Consultation');
  });

  test('clicking submit without required fields stays on step 1', async ({ page }) => {
    await page.click('.btn-submit');
    await expect(page.locator('#formStep2')).toBeHidden();
  });

  test('filling required fields advances to step 2', async ({ page }) => {
    await page.fill('#name', 'Jane Doe');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#phone', '5551234567');
    await page.click('.btn-submit');

    await expect(page.locator('#formStep1')).toBeHidden();
    await expect(page.locator('#formStep2')).toBeVisible();
    await expect(page.locator('.btn-submit')).toHaveText('Complete');
  });
});

test.describe('Consultation form – step 2', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#schedule');
    await page.fill('#name', 'Jane Doe');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#phone', '5551234567');
    await page.click('.btn-submit');
  });

  test('referral fields have correct placeholders (no "Referrer" prefix)', async ({ page }) => {
    await expect(page.locator('#referralFirstName')).toHaveAttribute('placeholder', 'First Name');
    await expect(page.locator('#referralLastName')).toHaveAttribute('placeholder', 'Last Name');
    await expect(page.locator('#referralPhone')).toHaveAttribute('placeholder', 'Phone Number');
  });

  test('successful submission shows confirmation panel and success message', async ({ page }) => {
    await page.route('/api/contact', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Your consultation request has been submitted successfully!' }),
      })
    );

    await page.click('.btn-submit');

    await expect(page.locator('#formConfirmation')).toBeVisible();
    await expect(page.locator('#formStep1')).toBeHidden();
    await expect(page.locator('#formStep2')).toBeHidden();
    await expect(page.locator('.field-submit')).toBeHidden();
    await expect(page.locator('#formMessage')).toContainText('submitted successfully');
  });

  test('no error message is shown on successful submit', async ({ page }) => {
    await page.route('/api/contact', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Your consultation request has been submitted successfully!' }),
      })
    );

    await page.click('.btn-submit');

    await expect(page.locator('#formMessage')).not.toHaveClass(/error/);
    await expect(page.locator('#formMessage')).not.toContainText(/error|failed|sorry/i);
    await expect(page.locator('#formConfirmation')).toBeVisible();
  });

  test('API error stays on step 2 with Complete button re-enabled', async ({ page }) => {
    await page.route('/api/contact', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Server error' }),
      })
    );

    await page.click('.btn-submit');

    await expect(page.locator('#formStep2')).toBeVisible();
    await expect(page.locator('.btn-submit')).toHaveText('Complete');
    await expect(page.locator('.btn-submit')).toBeEnabled();
    await expect(page.locator('#formMessage')).toBeVisible();
  });
});

test.describe('Full form submission', () => {
  test('all fields filled — complete two-step flow with email preview', async ({ page }) => {
    await page.goto('/#schedule');

    // Mock the API so this test works identically in local dev, CI, and prod smoke runs.
    // The real-server submission is covered by the DB persistence test.
    await page.route('/api/contact', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Your consultation request has been submitted successfully!' }),
      })
    );

    // Step 1: fill every field
    await page.fill('#name', 'Chris Burkhardt');
    await page.fill('#email', 'chris@example.com');
    await page.fill('#phone', '5551234567');
    await page.fill('#address', '123 Main Street');
    await page.fill('#city', 'Springfield');
    await page.fill('#state', 'IL');
    await page.fill('#zip', '62701');

    // Pick a date 7 days from now via JS to avoid locale/format issues
    await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      (document.getElementById('preferredDate') as HTMLInputElement).value =
        d.toISOString().split('T')[0];
    });

    await page.selectOption('#preferredTime', 'Morning (9am)');
    await page.selectOption('#preferredContact', 'Email');
    await page.fill('#message', 'Looking to replace 6 double-hung windows. Interested in energy-efficient options.');

    // Advance to step 2
    await page.click('.btn-submit');
    await expect(page.locator('#formStep2')).toBeVisible();

    // Step 2: fill referral fields
    await page.fill('#referralFirstName', 'Sarah');
    await page.fill('#referralLastName', 'Johnson');
    await page.fill('#referralPhone', '5559876543');

    // Submit and capture response
    const responsePromise = page.waitForResponse('/api/contact');
    await page.click('.btn-submit');
    const response = await responsePromise;
    const body = await response.json();

    // Log the full email preview — visible in HTML report under this test
    if (body.emailPreview) {
      console.log('\n📧 Full email preview (all fields):\n' + '─'.repeat(50) + '\n' + body.emailPreview + '─'.repeat(50));
    }

    await expect(page.locator('#formMessage')).not.toHaveClass(/error/);
    await expect(page.locator('#formMessage')).toContainText('submitted successfully');
    await expect(page.locator('#formConfirmation')).toBeVisible();
    await expect(page.locator('.field-submit')).toBeHidden();
    await expect(page.locator('#confirmName')).toHaveText('Chris Burkhardt');
    await expect(page.locator('#confirmEmail')).toHaveText('chris@example.com');
    await expect(page.locator('#confirmPhone')).toHaveText('(555) 123-4567');
  });
});

test.describe('Post-submission confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#schedule');
    await page.route('/api/contact', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Your consultation request has been submitted successfully!' }),
      })
    );
    await page.fill('#name', 'Jane Doe');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#phone', '5551234567');
    await page.click('.btn-submit'); // advance to step 2
    await page.click('.btn-submit'); // submit
  });

  test('confirmation panel is visible', async ({ page }) => {
    await expect(page.locator('#formConfirmation')).toBeVisible();
  });

  test('submit button and form note are hidden', async ({ page }) => {
    await expect(page.locator('.field-submit')).toBeHidden();
  });

  test('form steps are hidden', async ({ page }) => {
    await expect(page.locator('#formStep1')).toBeHidden();
    await expect(page.locator('#formStep2')).toBeHidden();
  });

  test('confirmation shows submitted name, email and phone', async ({ page }) => {
    await expect(page.locator('#confirmName')).toHaveText('Jane Doe');
    await expect(page.locator('#confirmEmail')).toHaveText('jane@example.com');
    await expect(page.locator('#confirmPhone')).toHaveText('(555) 123-4567');
  });

  test('address row is hidden when no address was provided', async ({ page }) => {
    await expect(page.locator('#confirmAddressRow')).toBeHidden();
  });

  test('schedule row is hidden when no date or time provided', async ({ page }) => {
    await expect(page.locator('#confirmScheduleRow')).toBeHidden();
  });

  test('Schedule Another returns to step 1 with form ready', async ({ page }) => {
    await page.click('#btnScheduleAnother');
    await expect(page.locator('#formStep1')).toBeVisible();
    await expect(page.locator('.field-submit')).toBeVisible();
    await expect(page.locator('.btn-submit')).toHaveText('Schedule My Free Consultation');
    await expect(page.locator('#formConfirmation')).toBeHidden();
    await expect(page.locator('#formMessage')).toBeHidden();
  });
});

test.describe('Post-submission confirmation \u2014 address and schedule rows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#schedule');
    await page.route('/api/contact', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Your consultation request has been submitted successfully!' }),
      })
    );
    await page.fill('#name', 'Chris Burkhardt');
    await page.fill('#email', 'chris@example.com');
    await page.fill('#phone', '5551234567');
    await page.fill('#address', '123 Main Street');
    await page.fill('#city', 'Springfield');
    await page.fill('#state', 'IL');
    await page.fill('#zip', '62701');
    await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      (document.getElementById('preferredDate') as HTMLInputElement).value =
        d.toISOString().split('T')[0];
    });
    await page.selectOption('#preferredTime', 'Morning (9am)');
    await page.click('.btn-submit'); // advance to step 2
    await page.click('.btn-submit'); // submit
  });

  test('address row is visible and shows submitted address', async ({ page }) => {
    await expect(page.locator('#confirmAddressRow')).toBeVisible();
    await expect(page.locator('#confirmAddress')).toContainText('123 Main Street');
    await expect(page.locator('#confirmAddress')).toContainText('Springfield');
  });

  test('schedule row is visible and shows preferred time', async ({ page }) => {
    await expect(page.locator('#confirmScheduleRow')).toBeVisible();
    await expect(page.locator('#confirmSchedule')).toContainText('Morning (9am)');
  });
});

// ── Database persistence ─────────────────────────────────────────────────────
// Submits the real form with ?isTestLead=true, then queries Postgres directly
// to assert the row was written correctly.  Single test, single submission.
// Skipped automatically when DATABASE_URL is not set (e.g. CI without a DB).

import { Pool } from 'pg';

const DB_TEST_EMAIL = 'smoke@example.com';

function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return new Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: { rejectUnauthorized: false },
  });
}

test.describe('Database persistence', () => {
  let pool: Pool | null;

  test.beforeAll(() => {
    pool = getPool();
  });

  test.afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM "Submission" WHERE email = $1', [DB_TEST_EMAIL]);
      await pool.end();
    }
  });

  test('real submission sends email and is saved to DB', async ({ page }) => {
    if (!pool) {
      test.skip(true, 'DATABASE_URL not set — skipping DB persistence test');
      return;
    }

    // Delete any leftover row from a previous run so the poll below is unambiguous
    await pool!.query('DELETE FROM "Submission" WHERE email = $1', [DB_TEST_EMAIL]);

    // ?isTestLead=true marks the DB row as a test submission (filterable in reports)
    // but the full SES + CAPI flow still runs — this verifies real email delivery.
    await page.goto('/?isTestLead=true#schedule');
    await page.fill('#name',  'Smoke Test');
    await page.fill('#email', DB_TEST_EMAIL);
    await page.fill('#phone', '5550000000');
    await page.click('.btn-submit');
    await expect(page.locator('#formStep2')).toBeVisible();

    const responsePromise = page.waitForResponse(r => r.url().includes('/api/contact'));
    await page.click('.btn-submit');
    const response = await responsePromise;
    const body = await response.json();

    if (body.emailPreview) {
      console.log('\n📧 Email preview:\n' + '─'.repeat(50) + '\n' + body.emailPreview + '─'.repeat(50));
    }

    expect(body.success).toBe(true);
    await expect(page.locator('#formConfirmation')).toBeVisible();

    // DB write is fire-and-forget — poll for up to 5s
    let row: Record<string, unknown> | null = null;
    for (let i = 0; i < 50; i++) {
      const result = await pool!.query(
        'SELECT * FROM "Submission" WHERE email = $1 ORDER BY "submittedAt" DESC LIMIT 1',
        [DB_TEST_EMAIL]
      );
      if (result.rows.length > 0) { row = result.rows[0]; break; }
      await new Promise(r => setTimeout(r, 100));
    }

    expect(row, 'No DB record found for smoke test submission').not.toBeNull();
    expect(row!['name']).toBe('Smoke Test');
    expect(row!['email']).toBe(DB_TEST_EMAIL);
    expect(row!['tenantId']).toBe('burkhardt');
    expect(row!['isTestLead']).toBe(true);
  });
});
