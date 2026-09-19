import { test, expect } from '@playwright/test';
import { clearAndSeedDatabase } from './fixtures/seed';

test.describe('E2E Flow 6: Offline Vault Durability & Fault Tolerance', () => {
  test.beforeEach(async ({ page }) => {
    await clearAndSeedDatabase(page);
  });

  test('6.1 (Edge Case): Auto-recovers database from localStorage vault if IndexedDB is cleared', async ({ page }) => {
    await page.goto('/#/');

    // 1. Trigger vault synchronization to guarantee localStorage has the mirrored snapshot
    await page.evaluate(async () => {
      const { syncVaultMirror } = await import('/src/offlineVault.ts');
      await syncVaultMirror();
    });

    // Verify localStorage vault mirror is populated
    const vaultData = await page.evaluate(() => localStorage.getItem('pointage_offline_vault_mirror'));
    expect(vaultData).not.toBeNull();
    expect(vaultData).toContain('BL-2026-001');

    // 2. Simulate catastrophic IndexedDB eviction / clearance
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('pointage-surface-db');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['bills', 'orderLines'], 'readwrite');
          tx.objectStore('bills').clear();
          tx.objectStore('orderLines').clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      });
    });

    // 3. Reload page (simulating reopening the app after eviction)
    await page.reload();

    // 4. Verify auto-recovery restores the bill
    await expect(page.getByText('BL-2026-001')).toBeVisible();
    await expect(page.getByText('ETS MOHAMED BENALI (ORAN)')).toBeVisible();
  });

  test('6.2: Operator roster updates persist across browser reloads', async ({ page }) => {
    await page.goto('/#/');

    // Open operator modal
    const opBtn = page.getByRole('button', { name: /Opérateur/i }).first();
    await opBtn.click();

    // Verify modal appears
    await expect(page.getByText(/Équipe & Opérateur/i)).toBeVisible();

    // Switch active operator to Karim
    const karimBtn = page.getByText('Karim').first();
    await expect(karimBtn).toBeVisible();
    await karimBtn.click();

    // Verify header badge reflects Karim
    await expect(page.getByRole('button', { name: /Opérateur actif : Karim/i })).toBeVisible();

    // Reload page to verify persistence in localStorage
    await page.reload();

    // Verify Karim is still active
    await expect(page.getByRole('button', { name: /Opérateur actif : Karim/i })).toBeVisible();
  });
});
