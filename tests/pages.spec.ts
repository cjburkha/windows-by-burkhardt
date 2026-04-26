/**
 * Inner page smoke tests — Reviews and Gallery.
 *
 * These run on the burkhardt project only (ui.spec.ts pattern) since the
 * review copy and gallery images are currently Burkhardt-specific.
 *
 * In CI the server starts with ASSET_BASE_URL unset so templates load from
 * disk.  In prod smoke tests they are fetched live from S3/_templates/.
 */
import { test, expect } from '@playwright/test';

// ── Reviews page ─────────────────────────────────────────────────────────────

test.describe('Reviews page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reviews');
  });

  test('loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Reviews.*Windows by Burkhardt/);
  });

  test('no unresolved {{TENANT_*}} tokens', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toContain('{{TENANT_');
  });

  test('shows all three reviewer names', async ({ page }) => {
    const cards = page.locator('.testimonial-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('Julia W.');
    await expect(cards.nth(1)).toContainText('Sue G.');
    await expect(cards.nth(2)).toContainText('Stephanie C.');
  });

  test('every card has a 5-star rating', async ({ page }) => {
    const stars = page.locator('.testimonial-stars');
    await expect(stars).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      // Five filled star characters ★★★★★
      await expect(stars.nth(i)).toContainText('★★★★★');
    }
  });

  test('every card links to its Google review', async ({ page }) => {
    const links = page.locator('.review-more');
    await expect(links).toHaveCount(3);
    await expect(links.nth(0)).toHaveAttribute('href', 'https://maps.app.goo.gl/QYUM6gfQChrw4Jfc6');
    await expect(links.nth(1)).toHaveAttribute('href', 'https://maps.app.goo.gl/e7ivQ77L1bogm5h99');
    await expect(links.nth(2)).toHaveAttribute('href', 'https://maps.app.goo.gl/gXcn6ngStBTr87Q56');
  });

  test('review links open in a new tab', async ({ page }) => {
    const links = page.locator('.review-more');
    for (let i = 0; i < 3; i++) {
      await expect(links.nth(i)).toHaveAttribute('target', '_blank');
    }
  });

  test('shows key review snippet from Julia W.', async ({ page }) => {
    await expect(page.locator('.testimonial-card').nth(0))
      .toContainText('excellent experience');
  });

  test('platform cards link to Google, Facebook, and Nextdoor', async ({ page }) => {
    const platforms = page.locator('.platform-card');
    await expect(platforms).toHaveCount(3);
    const hrefs = await platforms.evaluateAll(els => els.map(e => e.getAttribute('href') ?? ''));
    expect(hrefs.some(h => h.includes('goo.gl') || h.includes('google.com'))).toBe(true);
    expect(hrefs.some(h => h.includes('facebook.com'))).toBe(true);
    expect(hrefs.some(h => h.includes('nextdoor.com'))).toBe(true);
  });
});

// ── Gallery page ──────────────────────────────────────────────────────────────

test.describe('Gallery page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gallery');
  });

  test('loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Gallery.*Windows by Burkhardt/);
  });

  test('no unresolved {{TENANT_*}} tokens', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toContain('{{TENANT_');
  });

  test('shows real photo grid, not placeholder', async ({ page }) => {
    await expect(page.locator('.gallery-placeholder')).toHaveCount(0);
    await expect(page.locator('.gallery-grid')).toBeVisible();
  });

  test('gallery has four images', async ({ page }) => {
    await expect(page.locator('.gallery-item img')).toHaveCount(4);
  });

  test('all images have a non-empty src', async ({ page }) => {
    const imgs = page.locator('.gallery-item img');
    const count = await imgs.count();
    for (let i = 0; i < count; i++) {
      const src = await imgs.nth(i).getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).toContain('/images/gallery/');
    }
  });

  test('images link to full-size versions in a new tab', async ({ page }) => {
    const links = page.locator('.gallery-item a');
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      await expect(links.nth(i)).toHaveAttribute('target', '_blank');
    }
  });
});
