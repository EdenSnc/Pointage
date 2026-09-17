import { test, expect } from '@playwright/test';
import { clearAndSeedDatabase } from './fixtures/seed';

test.describe('E2E Flow 2: Bill Pointage Workflow & Stage Progression', () => {
  test.beforeEach(async ({ page }) => {
    await clearAndSeedDatabase(page);
  });

  test('2.1: Navigates from home into bill detail and renders client & order lines', async ({ page }) => {
    // Click on the seeded bill card on HomeScreen
    const billCard = page.getByText('ETS MOHAMED BENALI');
    await expect(billCard).toBeVisible();
    await billCard.click();

    // Verify URL transitioned to bill view
    await expect(page).toHaveURL(/.*#\/bill\/1.*/);

    // Verify bill header info
    await expect(page.getByText('BL-2026-001')).toBeVisible();

    // Verify all 3 seeded order lines are rendered
    await expect(page.getByText('ART-1012')).toBeVisible();
    await expect(page.getByText('REF: 71662')).toBeVisible();
    await expect(page.getByText('REF-B2')).toBeVisible();
  });

  test('2.2: Transitions smoothly across logistical stages (Préparation, Chargement, Pointage)', async ({ page }) => {
    await page.goto('/#/bill/1');

    // Default stage is Préparation (rendered as Prépa in the pipeline)
    const prepLabel = page.getByText(/Prépa/i).first();
    await expect(prepLabel).toBeVisible();

    // Switch to Chargement
    const chargementNode = page.getByText('Chargement').first();
    await expect(chargementNode).toBeVisible();
    await chargementNode.click();

    // URL or stage state reflects chargement
    await expect(page).toHaveURL(/.*stage=chargement.*/);

    // Switch to Pointage
    const pointageNode = page.getByText('Pointage').first();
    await expect(pointageNode).toBeVisible();
    await pointageNode.click();

    // URL reflects pointage
    await expect(page).toHaveURL(/.*stage=pointage.*/);
  });

  test('2.3: Opens product line, inputs count quantity, and records verification', async ({ page }) => {
    await page.goto('/#/bill/1');

    // Click on first line card (ART-1012)
    const productCard = page.locator('#line-1');
    await expect(productCard).toBeVisible();
    await productCard.click();

    // Verify navigation to ProductScreen
    await expect(page).toHaveURL(/.*#\/bill\/1\/line\/1.*/);
    await expect(page.getByText('Disque à tronçonner 115mm acier')).toBeVisible();

    // Tap +1 Carton shortcut to add quantity
    const addCartonBtn = page.getByRole('button', { name: /\+1 Carton/i }).first();
    await expect(addCartonBtn).toBeVisible();
    await addCartonBtn.click();

    // The validation button should now display "+50 pcs • Valider"
    const submitBtn = page.getByRole('button', { name: /Valider/i }).first();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify success feedback toast or return navigation
    await expect(page.locator('.toast')).toBeVisible();

    // Return to BillScreen
    await page.goto('/#/bill/1');
    await expect(page.locator('#line-1')).toBeVisible();
  });

  test('2.4: Filters order lines using status pills (Tous, À faire, Validés)', async ({ page }) => {
    await page.goto('/#/bill/1');

    // Verify initial "Tous" filter shows all 3 lines
    const filterAll = page.getByRole('button', { name: /^Tous/i }).first();
    await expect(filterAll).toBeVisible();
    await expect(page.locator('.product-card')).toHaveCount(3);

    // Filter by "À faire"
    const filterTodo = page.getByRole('button', { name: /À faire/i }).first();
    await expect(filterTodo).toBeVisible();
    await filterTodo.click();

    // All 3 items are initially uncounted, so they remain in "À faire"
    await expect(page.locator('.product-card')).toHaveCount(3);

    // Filter by "Validés"
    const filterDone = page.getByRole('button', { name: /Validés/i }).first();
    await expect(filterDone).toBeVisible();
    await filterDone.click();

    // No lines are completed yet, so 0 lines shown
    await expect(page.locator('.product-card')).toHaveCount(0);

    // Reset back to "Tous"
    await filterAll.click();
    await expect(page.locator('.product-card')).toHaveCount(3);
  });
});
