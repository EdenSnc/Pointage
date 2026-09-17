import { test, expect } from '@playwright/test';
import { clearAndSeedDatabase } from './fixtures/seed';

test.describe('E2E Flow 3: Spatial Zone Mapping & Camera HUD', () => {
  test.beforeEach(async ({ page }) => {
    await clearAndSeedDatabase(page);
  });

  test('3.1: Opens Cartographie modal from quick bar and displays search input and compass grid', async ({ page }) => {
    // Open Cartographie modal via Quick Action Bar
    const cartoBtn = page.getByRole('button', { name: /Cartographie/i }).first();
    await expect(cartoBtn).toBeVisible();
    await cartoBtn.click();

    // Verify modal overlay and header appear
    await expect(page.getByRole('heading', { name: /Cartographie/i })).toBeVisible();

    // Verify search input is present
    const searchInput = page.getByPlaceholder(/Scanner code-barres|taper référence/i);
    await expect(searchInput).toBeVisible();

    // Verify compass navigation tabs are present
    await expect(page.getByRole('button', { name: /Chambre Principale/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Couloir/i })).toBeVisible();
  });

  test('3.2: Searches product, selects it, and assigns zone via 3x3 compass grid', async ({ page }) => {
    // Open modal
    const cartoBtn = page.getByRole('button', { name: /Cartographie/i }).first();
    await cartoBtn.click();

    // Type reference into search input
    const searchInput = page.getByPlaceholder(/Scanner code-barres|taper référence/i);
    await searchInput.fill('71662');

    // Press Enter to trigger search/select
    await searchInput.press('Enter');

    // Verify product card is selected
    await expect(page.getByText('SAC A DOS MOYEN 22 L 4 MO 71662').first()).toBeVisible();

    // Click on zone CH_NW (Nord-Ouest) in the compass grid
    const zoneBtn = page.locator('button').filter({ hasText: 'CH_NW' }).first();
    await expect(zoneBtn).toBeVisible();
    await expect(zoneBtn).toBeEnabled();
    await zoneBtn.click();

    // Verify feedback toast confirming zone assignment
    await expect(page.getByText(/✓ 71662 ➔/i)).toBeVisible();

    // Verify IndexedDB was updated with the new zone (via reference index)
    const updatedZone = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('pointage-surface-db');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('productProfiles', 'readonly');
          const store = tx.objectStore('productProfiles');
          const idx = store.index('reference');
          const getReq = idx.get('71662');
          getReq.onsuccess = () => resolve(getReq.result?.warehouseZone);
        };
      });
    });
    expect(updatedZone).toBe('CH_NW');
  });

  test('3.3: Toggles camera scanner and verifies dual-mode HUD badges', async ({ page }) => {
    // Open modal
    const cartoBtn = page.getByRole('button', { name: /Cartographie/i }).first();
    await cartoBtn.click();

    // Toggle Camera on
    const camBtn = page.getByRole('button', { name: /Caméra/i });
    await expect(camBtn).toBeVisible();
    await camBtn.click();

    // Verify dual-detection HUD badge and viewfinder reticle appear
    await expect(page.getByText(/Double Détection : Code-Barres & Réf Carton/i)).toBeVisible();
    await expect(page.getByText(/Visez le code ou la référence/i)).toBeVisible();

    // Close camera
    const closeCamBtn = page.getByRole('button', { name: /Fermer Cam/i });
    await expect(closeCamBtn).toBeVisible();
    await closeCamBtn.click();

    // Verify HUD is dismissed
    await expect(page.getByText(/Double Détection/i)).not.toBeVisible();
  });
});
