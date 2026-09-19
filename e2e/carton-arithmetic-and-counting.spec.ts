import { test, expect } from '@playwright/test';
import { clearAndSeedDatabase } from './fixtures/seed';

test.describe('E2E Flow 5: Carton Arithmetic & Packaging Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await clearAndSeedDatabase(page);
  });

  test('5.1: Multi-tier packaging arithmetic calculates correctly across boxes and units', async ({ page }) => {
    await page.goto('/#/bill/1/line/1');

    // Verify product header
    await expect(page.getByText('Disque à tronçonner 115mm acier')).toBeVisible();

    // Switch to Boîte/Pot target tab
    const boiteTab = page.getByRole('button', { name: /^Boîte\/Pot$/i }).first();
    await expect(boiteTab).toBeVisible();
    await boiteTab.click();

    // Add 1 Boîte (+10 pcs)
    const addBoiteBtn = page.getByRole('button', { name: /\+1 Boîte/i }).first();
    await expect(addBoiteBtn).toBeVisible();
    await addBoiteBtn.click();

    // Switch to Pièces target tab
    const piecesTab = page.getByRole('button', { name: /^Pièces$/i }).first();
    await expect(piecesTab).toBeVisible();
    await piecesTab.click();

    // Add 5 Units (+5 pcs)
    const add5Btn = page.getByRole('button', { name: /\+5/i }).first();
    await expect(add5Btn).toBeVisible();
    await add5Btn.click();

    // Total batch should be 10 + 5 = 15 pcs
    await expect(page.getByText(/\+15 pcs • Valider/i)).toBeVisible();

    // Validate count
    const submitBtn = page.getByRole('button', { name: /\+15 pcs • Valider/i }).first();
    await submitBtn.click();

    // Verify toast confirmation
    await expect(page.locator('.toast')).toBeVisible();
  });

  test('5.2 (Edge Case): Zero count guard prevents submission when 0 quantity is entered', async ({ page }) => {
    await page.goto('/#/bill/1/line/1');

    // On initial mount with no increments selected, the Valider button must be disabled
    const submitBtn = page.getByRole('button', { name: /^Valider$/i }).first();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeDisabled();
  });

  test('5.3 (Edge Case): Excess / Over-delivery triggers warning badges and surplus count event', async ({ page }) => {
    // Navigate to line 4 (SURPLUS-ITEM: ordered 5 pcs, outerPack 10)
    await page.goto('/#/bill/1/line/4');
    await expect(page.getByText('MARQUEUR PERMANENT NOIR')).toBeVisible();

    // Click +1 Carton (+10 pcs) which exceeds ordered 5 pcs
    const addCartonBtn = page.getByRole('button', { name: /\+1 Carton/i }).first();
    await expect(addCartonBtn).toBeVisible();
    await addCartonBtn.click();

    // Batch preview should indicate EXCÉDENT
    await expect(page.getByText(/EXCÉDENT/i).first()).toBeVisible();

    // Submit the excess count
    const submitBtn = page.getByRole('button', { name: /Valider/i }).first();
    await submitBtn.click();

    // Verify glance banner or header displays excédent indicator
    await expect(page.getByText(/Excédent/i).first()).toBeVisible();
  });
});
