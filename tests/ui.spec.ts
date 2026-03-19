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

  test('step 1 is visible and step 2 is hidden on load', async ({ page }) => {
    await expect(page.locator('#formStep1')).toBeVisible();
    await expect(page.locator('#formStep2')).toBeHidden();
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

  test('successful submission returns to step 1 with success message', async ({ page }) => {
    await page.route('/api/contact', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Your consultation request has been submitted successfully!' }),
      })
    );

    await page.click('.btn-submit');

    await expect(page.locator('#formStep1')).toBeVisible();
    await expect(page.locator('.btn-submit')).toHaveText('Schedule My Free Consultation');
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
    // The webServer in playwright.config.ts sets NODE_ENV=test so
    // emailService skips the real SES send and returns success.
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
    await expect(page.locator('#formStep1')).toBeVisible();
    await expect(page.locator('.btn-submit')).toHaveText('Schedule My Free Consultation');
  });
});
