import { test, expect } from '@playwright/test';
import { clearAndSeedDatabase } from './fixtures/seed';

const MOBILE_VIEWPORTS = [
  { name: 'Samsung_Galaxy_A54', width: 412, height: 915 },
  { name: 'iPhone_SE_Compact', width: 375, height: 667 },
];

for (const vp of MOBILE_VIEWPORTS) {
  test.describe(`Mobile Responsiveness & Visual Ergonomics: ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      isMobile: true,
      hasTouch: true,
    });

    test.beforeEach(async ({ page }) => {
      await clearAndSeedDatabase(page);
    });

    test(`M1: Home screen renders cleanly without horizontal scroll on ${vp.name}`, async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify no horizontal overflow blowout
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      // Verify header, quick bar, segmented control, and bills are visible
      await expect(page.getByRole('button', { name: /Cartographie/i }).first()).toBeVisible();
      await expect(page.getByText('Bons Actifs').first()).toBeVisible();
      await expect(page.getByText('ETS MOHAMED BENALI').first()).toBeVisible();

      await page.screenshot({
        path: `C:/Users/Admin/.gemini/antigravity/brain/f1304958-04cb-4b13-ba11-976c2dff9213/mobile_home_${vp.name}.png`,
        fullPage: false,
      });
    });

    test(`M2: Cartographie modal is responsive and fully contained on ${vp.name}`, async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open Cartographie modal
      const cartoBtn = page.getByRole('button', { name: /Cartographie/i }).first();
      await cartoBtn.click();

      await expect(page.getByRole('heading', { name: /Cartographie/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Chambre/i }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Couloir/i }).first()).toBeVisible();

      // Check modal does not spill horizontally
      const isContained = await page.evaluate(() => {
        const modal = document.querySelector('.modal-backdrop .card');
        if (!modal) return false;
        const rect = modal.getBoundingClientRect();
        return rect.width <= window.innerWidth && rect.left >= 0 && rect.right <= window.innerWidth + 1;
      });
      expect(isContained).toBe(true);

      await page.screenshot({
        path: `C:/Users/Admin/.gemini/antigravity/brain/f1304958-04cb-4b13-ba11-976c2dff9213/mobile_carto_${vp.name}.png`,
      });
    });

    test(`M3: Bill Detail & Logistics Stepper renders cleanly on ${vp.name}`, async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Click first bill to open detail screen
      await page.getByText('ETS MOHAMED BENALI').first().click();
      await page.waitForLoadState('networkidle');

      // Verify order lines and stages appear
      await expect(page.getByText('SAC A DOS MOYEN 22 L 4 MO 71662').first()).toBeVisible();

      // Check no horizontal scrollbar
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      await page.screenshot({
        path: `C:/Users/Admin/.gemini/antigravity/brain/f1304958-04cb-4b13-ba11-976c2dff9213/mobile_bill_detail_${vp.name}.png`,
      });
    });

    test(`M4: Product Verification Screen renders cleanly on ${vp.name}`, async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open bill detail
      await page.getByText('ETS MOHAMED BENALI').first().click();
      await page.waitForLoadState('networkidle');

      // Click first product row to open verification screen
      await page.getByText('SAC A DOS MOYEN 22 L 4 MO 71662').first().click();
      await page.waitForLoadState('networkidle');

      // Verify product counters
      await expect(page.getByText(/Quantité /i).first()).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      await page.screenshot({
        path: `C:/Users/Admin/.gemini/antigravity/brain/f1304958-04cb-4b13-ba11-976c2dff9213/mobile_product_${vp.name}.png`,
      });
    });
  });
}
