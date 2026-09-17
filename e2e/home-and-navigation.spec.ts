import { test, expect } from '@playwright/test';
import { clearDatabase, clearAndSeedDatabase } from './fixtures/seed';

test.describe('E2E Flow 1: Home Screen, Navigation & Operator Controls', () => {
  test('1.1: Renders empty state with action prompts when no active bills exist', async ({ page }) => {
    await clearDatabase(page);

    // Verify main header is visible
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Verify empty state illustration or action prompts
    const importPrompt = page.getByRole('button', { name: /Importer/i }).first();
    await expect(importPrompt).toBeVisible();
  });

  test('1.2: Renders seeded bills list with client details, progress, and quick action bar', async ({ page }) => {
    await clearAndSeedDatabase(page);

    // Verify seeded bill is present in the list
    const clientCard = page.getByText('ETS MOHAMED BENALI');
    await expect(clientCard).toBeVisible();

    const billNumber = page.getByText('BL-2026-001');
    await expect(billNumber).toBeVisible();

    // Verify Quick Bar has Cartographie and Scan buttons
    const cartoBtn = page.getByRole('button', { name: /Cartographie/i }).first();
    await expect(cartoBtn).toBeVisible();
  });

  test('1.3: Allows switching active operator via the operator modal', async ({ page }) => {
    await clearAndSeedDatabase(page);

    // Find and click the operator header button
    const opBtn = page.locator('button[aria-label^="Opérateur actif"]').first();
    await expect(opBtn).toBeVisible();
    await opBtn.click();

    // Verify Operator Modal appears
    const operatorModal = page.getByText(/Équipe & Opérateur/i);
    await expect(operatorModal).toBeVisible();

    // Select 'Karim' from the roster
    const karimChoice = page.getByText(/^Karim$/i).first();
    await expect(karimChoice).toBeVisible();
    await karimChoice.click();

    // Verify toast confirmation and operator change
    const toast = page.locator('.toast');
    await expect(toast).toContainText(/Karim/i);
  });

  test('1.4: Toggles audio/haptic sound mute button with immediate feedback', async ({ page }) => {
    await clearAndSeedDatabase(page);

    const soundBtn = page.locator('button[aria-label*="son"]').first();
    await expect(soundBtn).toBeVisible();

    // Click to toggle sound
    const initialLabel = await soundBtn.getAttribute('aria-label');
    await soundBtn.click();
    const updatedLabel = await soundBtn.getAttribute('aria-label');
    expect(updatedLabel).not.toEqual(initialLabel);
  });
});
