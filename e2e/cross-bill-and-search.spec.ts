import { test, expect } from '@playwright/test';
import { clearAndSeedDatabase } from './fixtures/seed';

test.describe('E2E Flow 4: Cross-Bill & Deep Search Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await clearAndSeedDatabase(page);
  });

  test('4.1: Global search distinguishes active vs archived bills with explicit status badges', async ({ page }) => {
    await page.goto('/#/');

    // Focus global search bar on Home / BillListScreen
    const searchInput = page.getByPlaceholder(/Scanner code-barres|Rechercher/i).first();
    await expect(searchInput).toBeVisible();

    // Search for reference 72950 (which belongs to archived bill BL-2026-002)
    await searchInput.fill('72950');

    // Verify search result renders
    await expect(page.getByText('CARTABLE EN CUIR 72950')).toBeVisible();

    // Verify explicit "Historique" badge is displayed for the archived bill
    await expect(page.getByText(/Historique/i).first()).toBeVisible();
    await expect(page.getByText('SARL PAPETERIE CENTRALE (ALGER)')).toBeVisible();
  });

  test('4.2: Sibling product search displays both active and archived matches', async ({ page }) => {
    await page.goto('/#/');

    // Search for reference ART-1012 which exists on both active BL-2026-001 and archived BL-2026-002
    const searchInput = page.getByPlaceholder(/Scanner code-barres|Rechercher/i).first();
    await searchInput.fill('ART-1012');

    // Both bills should appear in search results
    await expect(page.getByText('BL-2026-001')).toBeVisible();
    await expect(page.getByText('BL-2026-002')).toBeVisible();

    // Verify presence of both "Actif" and "Historique" badges
    await expect(page.getByText(/Actif/i).first()).toBeVisible();
    await expect(page.getByText(/Historique/i).first()).toBeVisible();
  });

  test('4.3 (Edge Case): Special characters and script injections in search bar handle safely', async ({ page }) => {
    await page.goto('/#/');

    const searchInput = page.getByPlaceholder(/Scanner code-barres|Rechercher/i).first();

    // Test XSS / Script injection
    await searchInput.fill('<script>alert("xss")</script>');
    await expect(page.getByText(/Aucun résultat|0 article\(s\) trouvé\(s\)/i).first()).toBeVisible();

    // Test SQL-like syntax & special symbols
    await searchInput.fill("' OR 1=1 -- \\\\ /* test */");
    await expect(page.getByText(/Aucun résultat|0 article\(s\) trouvé\(s\)/i).first()).toBeVisible();

    // Ensure app didn't crash and search can be cleared back to normal state
    await searchInput.fill('');
    await expect(page.getByText('ETS MOHAMED BENALI (ORAN)')).toBeVisible();
  });

  test('4.4 (Edge Case): Navigation to non-existent bill ID displays clean fallback', async ({ page }) => {
    // Navigate directly to an invalid bill ID
    await page.goto('/#/bill/99999');

    // App should not crash or show raw white screen; it should show an actionable error fallback
    await expect(page.getByText('BL introuvable')).toBeVisible();
    await expect(page.getByText('Bon de livraison introuvable')).toBeVisible();

    // Back to home button should exist and navigate cleanly
    const backBtn = page.getByRole('button', { name: /Retour à l'accueil/i }).first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(page).toHaveURL(/.*#\/$/);
  });
});
