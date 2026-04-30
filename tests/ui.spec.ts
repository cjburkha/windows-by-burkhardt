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

  test('real server returns success (no mock) — catches credential or server errors', async ({ page }) => {
    // Does NOT mock /api/contact — hits the real running server.
    // SKIP_EMAIL=true (set by npm run test:dev) means SES is skipped but
    // all validation and logic runs with real credentials.
    const responsePromise = page.waitForResponse('/api/contact');
    await page.click('.btn-submit');
    const response = await responsePromise;
    const body = await response.json();

    // Log the email preview — visible in the Playwright HTML report under this test
    if (body.emailPreview) {
      console.log('\n📧 Email that would have been sent:\n' + '─'.repeat(50) + '\n' + body.emailPreview + '─'.repeat(50));
    }

    await expect(page.locator('#formMessage')).not.toHaveClass(/error/);
    await expect(page.locator('#formMessage')).not.toContainText(/error|failed|sorry/i);
    await expect(page.locator('#formConfirmation')).toBeVisible();
    await expect(page.locator('.field-submit')).toBeHidden();
  });
});

test.describe('Full form submission', () => {
  test('all fields filled — complete two-step flow with email preview', async ({ page }) => {
    await page.goto('/#schedule');

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

// ── Database persistence ──────────────────────────────────────────────────────
// Submits the real form against the real server (no mocks) and then queries
// Postgres directly to assert the record was written with the correct values.
// Skipped automatically when DATABASE_URL is not set (e.g. CI without a DB).

import { Pool } from 'pg';

const DB_TEST_EMAIL = `db-test-${Date.now()}@example.com`;

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
      // Clean up the test record so the DB stays tidy
      await pool.query('DELETE FROM "Submission" WHERE email = $1', [DB_TEST_EMAIL]);
      await pool.end();
    }
  });

  test('form submission is saved to the database with correct field values', async ({ page }) => {
    if (!pool) {
      test.skip(true, 'DATABASE_URL not set — skipping DB persistence test');
      return;
    }

    // ?isTestLead=true marks this submission in the DB so it can be filtered
    // out of real lead reports.  The query param is forwarded by script.js to
    // /api/contact and read by server.js before the DB write.
    await page.goto('/?isTestLead=true#schedule');

    // Step 1
    await page.fill('#name',    'DB Test User');
    await page.fill('#email',   DB_TEST_EMAIL);
    await page.fill('#phone',   '5550001234');
    await page.fill('#address', '99 Persistence Lane');
    await page.fill('#city',    'Testville');
    await page.fill('#state',   'WI');
    await page.fill('#zip',     '53000');
    await page.selectOption('#preferredTime',    'Afternoon (1pm)');
    await page.selectOption('#preferredContact', 'Phone');
    await page.fill('#message', 'This is an automated DB persistence test.');

    await page.click('.btn-submit');
    await expect(page.locator('#formStep2')).toBeVisible();

    // Step 2 — referral
    await page.fill('#referralFirstName', 'Ref');
    await page.fill('#referralLastName',  'Person');
    await page.fill('#referralPhone',     '5559990000');

    // Submit and wait for success
    const responsePromise = page.waitForResponse('/api/contact');
    await page.click('.btn-submit');
    const response = await responsePromise;
    expect((await response.json()).success).toBe(true);
    await expect(page.locator('#formConfirmation')).toBeVisible();

    // The DB write is fire-and-forget — poll for up to 3s
    let row: Record<string, unknown> | null = null;
    for (let i = 0; i < 30; i++) {
      const result = await pool!.query(
        'SELECT * FROM "Submission" WHERE email = $1',
        [DB_TEST_EMAIL]
      );
      if (result.rows.length > 0) { row = result.rows[0]; break; }
      await new Promise(r => setTimeout(r, 100));
    }

    expect(row, 'No DB record found for test submission').not.toBeNull();
    expect(row!['name']).toBe('DB Test User');
    expect(row!['email']).toBe(DB_TEST_EMAIL);
    expect(row!['phone']).toBe('(555) 000-1234');   // auto-formatted by the phone input handler
    expect(row!['address']).toBe('99 Persistence Lane');
    expect(row!['city']).toBe('Testville');
    expect(row!['state']).toBe('WI');
    expect(row!['zip']).toBe('53000');
    expect(row!['preferredTime']).toBe('Afternoon (1pm)');
    expect(row!['preferredContact']).toBe('Phone');
    expect(row!['message']).toBe('This is an automated DB persistence test.');
    expect(row!['referralFirstName']).toBe('Ref');
    expect(row!['referralLastName']).toBe('Person');
    expect(row!['referralPhone']).toBe('(555) 999-0000');  // auto-formatted by the referral phone input handler
    expect(row!['tenantId']).toBe('burkhardt');            // submission is saved with the resolved tenant ID
    expect(row!['isTestLead']).toBe(true);                 // ?isTestLead=true query param was forwarded to server
  });
});
