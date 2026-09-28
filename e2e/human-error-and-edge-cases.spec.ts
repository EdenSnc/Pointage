import { test, expect } from '@playwright/test';
import { clearAndSeedDatabase } from './fixtures/seed';

test.describe('E2E Flow 7: Deep Human Error Fortification & Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await clearAndSeedDatabase(page);
  });

  test('7.1 (Keyboard Ergonomics): Typing space in search input does not trigger background accelerators', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('#home-global-search-input');
    await expect(searchInput).toBeVisible();

    // Type query with spaces
    await searchInput.fill('CAHIER SEYES 96P');
    await expect(searchInput).toHaveValue('CAHIER SEYES 96P');

    // Press space while focused
    await searchInput.press('Space');
    await expect(searchInput).toHaveValue('CAHIER SEYES 96P ');

    // Verify no modals or unwanted overlays popped up accidentally
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  });

  test('7.2 (B2B Credit Safety): Blocks unauthorized debt ceiling overdraft with Poka-Yoke confirmation modal', async ({ page }) => {
    await page.goto('/#/gros');
    await page.waitForLoadState('networkidle');

    // Verify client select dropdown is present and contains grossiste accounts
    // Select client with already saturated debt ceiling (Papeterie El Manar: 310,000 / 300,000 DA)
    const clientSelect = page.locator('select').first();
    await expect(clientSelect).toBeVisible();
    await clientSelect.selectOption('Papeterie El Manar');

    // Add cartons: CAH-96P-SBM (6,800 DA/carton)
    const addBtn = page.locator('button').filter({ hasText: /Ajouter Carton/i }).first();
    await expect(addBtn).toBeVisible();

    // Click to add carton
    await addBtn.click();

    // Open cart drawer
    const cartToggle = page.locator('button').filter({ hasText: /Panier/i }).first();
    await cartToggle.click();

    // Attempt to transmit order to warehouse quai
    const transmitBtn = page.getByRole('button', { name: /Transmettre Quai/i });
    await expect(transmitBtn).toBeVisible();
    await transmitBtn.click();

    // Check if debt ceiling overdraft modal appeared
    const overdraftModal = page.getByText(/Dépassement de Plafond Client/i);
    await expect(overdraftModal).toBeVisible();

    // Verify modal details
    await expect(page.locator('.modal-backdrop').getByText(/Exposition Totale/i)).toBeVisible();
    await expect(page.locator('.modal-backdrop').getByText(/Plafond Autorisé/i)).toBeVisible();

    // Test Cancel button: cart remains intact, modal dismissed
    const cancelBtn = page.locator('.modal-backdrop').getByRole('button', { name: /Annuler/i });
    await cancelBtn.click();
    await expect(overdraftModal).not.toBeVisible();

    // Click again and test Dérogation Validée
    await transmitBtn.click();
    await expect(overdraftModal).toBeVisible();

    const overrideBtn = page.locator('.modal-backdrop').getByRole('button', { name: /Dérogation Validée/i });
    await overrideBtn.click();

    // Verify order transmitted toast
    await expect(page.locator('.toast')).toContainText(/transmise au quai/i);
  });

  test('7.3 (Commercial Protection): Prevents negative amounts and enforces check number on cheque collections', async ({ page }) => {
    await page.goto('/#/commercial');
    await page.waitForLoadState('networkidle');

    // Click on first client's "Encaisser Règlement" button in Tour Planner
    const clientPayBtn = page.locator('button').filter({ hasText: /Encaisser Règlement/i }).first();
    await expect(clientPayBtn).toBeVisible();
    await clientPayBtn.click();

    // Test 1: Negative amount input guard
    const amountInput = page.locator('input[placeholder="Ex: 150000"]');
    await expect(amountInput).toBeVisible();
    await amountInput.fill('-1500');

    const submitPayBtn = page.getByRole('button', { name: /Confirmer Encaissement/i });
    await submitPayBtn.click();

    // Verify error toast
    await expect(page.locator('.toast')).toContainText(/strictement positif/i);

    // Test 2: Cheque without check number guard
    await amountInput.fill('25000');
    const chequeOption = page.getByRole('button', { name: 'Chèque', exact: true });
    await chequeOption.click();

    // Submit with empty check number
    await submitPayBtn.click();
    await expect(page.locator('.toast')).toContainText(/numéro de chèque est obligatoire/i);

    // Test 3: Fill valid check number and submit
    const checkNumberInput = page.locator('input[placeholder="Ex: CHQ-992144"]');
    await expect(checkNumberInput).toBeVisible();
    await checkNumberInput.fill('CHQ-889922');

    await submitPayBtn.click();
    await expect(page.locator('.toast')).toContainText(/validé pour/i);
  });

  test('7.4 (Product Intake Poka-Yoke): Anti-loss margin lock and checksum verification', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open Product Intake Modal
    const intakeBtn = page.getByRole('button', { name: /Nouv. Produit/i });
    await expect(intakeBtn).toBeVisible();
    await intakeBtn.click();

    // Verify Modal appears with heading
    await expect(page.getByRole('heading', { name: /Saisie de Nouveaux Produits/i })).toBeVisible();

    // Enter Reference and Designation
    await page.locator('input[placeholder="Ex: CAH-96P-SBM"]').fill('TEST-SKU-SAFE-01');
    await page.locator('input[placeholder*="Ex: Cahier 96 Pages"]').fill('Article Test Securite Marge');

    // Case A: Negative Margin (Purchase 5000 DA, Wholesale 4500 DA)
    const purchaseInput = page.locator('input[placeholder="Ex: 5100"]');
    const wholesaleInput = page.locator('input[placeholder="Ex: 6800"]');

    await purchaseInput.fill('5000');
    await wholesaleInput.fill('4500');

    // Verify negative margin warning banner is displayed
    await expect(page.getByText(/Vente à perte détectée/i)).toBeVisible();

    // Verify Save Button is disabled
    const saveBtn = page.locator('form button[type="submit"]');
    await expect(saveBtn).toBeDisabled();

    // Fix wholesale price to profitable margin (6500 DA)
    await wholesaleInput.fill('6500');
    await expect(page.getByText(/Vente à perte détectée/i)).not.toBeVisible();

    // Case B: Invalid EAN-13 Checksum (13 digits but wrong check digit)
    const eanInput = page.locator('input[placeholder="Ex: 6941782115565"]');
    await eanInput.fill('6131234567891'); // Wrong check digit (attendu: 3, lu: 1)
    await expect(page.getByText(/Clé de contrôle erronée/i)).toBeVisible();
    await expect(saveBtn).toBeDisabled();

    // Enter Valid EAN-13 Checksum (attendu: 3)
    await eanInput.fill('6131234567893'); // Correct Modulo-10 checksum
    await expect(page.getByText(/Checksum Conforme/i)).toBeVisible();

    // Now save button must be enabled
    await expect(saveBtn).toBeEnabled();

    // Close modal via Escape shortcut
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: /Saisie de Nouveaux Produits/i })).not.toBeVisible();
  });

  test('7.5 (Wave Picking & Escape Dismissal): Rapid multi-bill wave consolidation opens and closes cleanly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open Wave Picking modal via button
    const waveBtn = page.locator('button').filter({ hasText: /Vague/i }).first();
    await expect(waveBtn).toBeVisible();
    await waveBtn.click();

    // Verify Wave Picking modal overlay
    await expect(page.getByText(/Vague de Préparation/i).first()).toBeVisible();
    await expect(page.getByText(/Progression Vague/i)).toBeVisible();

    // Test WhatsApp copy button
    const copyBtn = page.getByRole('button', { name: /Copier Feuille Chariot/i });
    await expect(copyBtn).toBeVisible();

    // Dismiss with Escape key
    await page.keyboard.press('Escape');
    await expect(page.getByText(/Vague de Préparation Consolidée/i)).not.toBeVisible();

    // Test Alt+W keyboard accelerator to re-open
    await page.keyboard.press('Alt+w');
    await expect(page.getByText(/Vague de Préparation/i).first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByText(/Vague de Préparation Consolidée/i)).not.toBeVisible();
  });

  test('7.6 (High Velocity Rush Mode): Toggles ultra-dense order rows with Alt+R and allows express validation undo', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Activate Rush Mode via Alt+R
    await page.keyboard.press('Alt+r');

    // Verify Rush Mode badge and dense rows appear
    await expect(page.getByText(/Mode Rush :/i)).toBeVisible();

    // Find Express validate button on first bill
    const expressBtn = page.locator('button:has-text("Express")').first();
    await expect(expressBtn).toBeVisible();
    await expressBtn.click();

    // Verify 5-second undo toast appears
    const undoToast = page.locator('.toast, [style*="z-index"]');
    await expect(undoToast).toContainText(/validé express/i);
    await expect(page.getByRole('button', { name: /Annuler \(5s\)/i })).toBeVisible();

    // Click Undo
    const cancelBtn = page.getByRole('button', { name: /Annuler \(5s\)/i });
    await cancelBtn.click();

    // Verify validation cancelled confirmation
    await expect(page.locator('.toast')).toContainText(/Validation express annulée/i);
  });
});
