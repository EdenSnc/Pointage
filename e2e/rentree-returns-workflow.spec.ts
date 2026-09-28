import { test, expect } from '@playwright/test';
import { clearAndSeedDatabase } from './fixtures/seed';

test.describe('E2E Flow: Retours Fin de Rentrée Scolaire & Multi-Voyages', () => {
  test.beforeEach(async ({ page }) => {
    await clearAndSeedDatabase(page);
  });

  test('9.1: Navigates to Retours Rentrée from Home screen and displays pre-seeded campaign', async ({ page }) => {
    // Navigate to root
    await page.goto('/');

    // Locate the Retours Rentrée quick action button
    const retoursBtn = page.getByRole('button', { name: /Retours Rentrée/i }).first();
    await expect(retoursBtn).toBeVisible();
    await retoursBtn.click();

    // Verify URL contains #/retours-rentree
    await expect(page).toHaveURL(/.*#\/retours-rentree/);

    // Verify main header and campaign title
    await expect(page.getByText(/Retours Fin de Rentrée/i).first()).toBeVisible();
    await expect(page.getByText(/Valorisation Bon État/i).first()).toBeVisible();

    // Verify multi-voyage tabs are present
    await expect(page.getByRole('button', { name: /Voyage 1/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Voyage 2/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Voyage 3/i })).toBeVisible();
  });

  test('9.2: Switches between voyages and verifies multi-site logistics (Kral Béchar, Oran, Bleu Blanc)', async ({ page }) => {
    await page.goto('/#/retours-rentree');

    // Click on Voyage 1 (Kral Markt Béchar)
    const v1Tab = page.getByRole('button', { name: /Voyage 1/i });
    await v1Tab.click();

    // Verify details for Voyage 1: Kral Markt Béchar
    await expect(page.getByText(/Kral Markt.*Béchar/i).first()).toBeVisible();
    await expect(page.getByText(/08-30129/i).first()).toBeVisible();
    await expect(page.getByText(/Karim/i).first()).toBeVisible();

    // Verify items in Voyage 1 (Cahier 96P Seyes SBM)
    await expect(page.getByText(/CAH-96P-SBM/i)).toBeVisible();

    // Click on Voyage 2 (Oran Surface)
    const v2Tab = page.getByRole('button', { name: /Voyage 2/i });
    await v2Tab.click();

    // Verify details for Voyage 2: Oran Surface
    await expect(page.getByText(/Oran.*Surface/i).first()).toBeVisible();
    await expect(page.getByText(/31-88412/i).first()).toBeVisible();
    await expect(page.getByText(/Mourad/i).first()).toBeVisible();

    // Verify items in Voyage 2 (Trousses Oxford)
    await expect(page.getByText(/TROU-OXF-01/i)).toBeVisible();
  });

  test('9.3: Performs real-time carton pointage and avarie counting', async ({ page }) => {
    await page.goto('/#/retours-rentree');

    // Switch to Voyage 2
    await page.getByRole('button', { name: /Voyage 2/i }).click();

    // Check initial carton count
    await expect(page.getByText('60 ctn').first()).toBeVisible();

    // Click +1 ctn button
    const plus1Btn = page.getByTitle(/Ajouter 1 carton conforme/i).first();
    await plus1Btn.click();

    // Verify carton count increments to 61 ctn
    await expect(page.getByText('61 ctn').first()).toBeVisible();

    // Click +1 Avarie button
    const plusAvarieBtn = page.getByTitle(/Signaler 1 carton avarié/i).first();
    await plusAvarieBtn.click();

    // Verify damaged count in voyage header increases from 2 to 3
    await expect(page.getByText(/Avaries : 3 ctns/i).first()).toBeVisible();
  });

  test('9.4: Allows switching reception site for a voyage (e.g. to Bleu Blanc)', async ({ page }) => {
    await page.goto('/#/retours-rentree');

    // Switch to Voyage 2
    await page.getByRole('button', { name: /Voyage 2/i }).click();

    // Find the site select dropdown
    const siteSelect = page.locator('select').first();
    await expect(siteSelect).toBeVisible();

    // Change site to Bleu Blanc
    await siteSelect.selectOption('bleu_blanc');

    // Verify site was updated in the header info
    await expect(siteSelect).toHaveValue('bleu_blanc');
  });

  test('9.5: Opens financial credit note modal and WhatsApp dispatch manifest', async ({ page }) => {
    await page.goto('/#/retours-rentree');

    // Open Credit Note modal
    const creditBtn = page.getByRole('button', { name: /Générer Avoir/i }).first();
    await expect(creditBtn).toBeVisible();
    await creditBtn.click();

    // Verify modal appears
    await expect(page.getByText(/Génération d'Avoir & Décharge Financière/i)).toBeVisible();
    await expect(page.getByText(/Valider Avoir & Réduire la Créance/i)).toBeVisible();

    // Close modal via Annuler button
    const cancelBtn = page.getByRole('button', { name: 'Annuler', exact: true });
    await cancelBtn.click();

    // Verify modal is closed
    await expect(page.getByText(/Génération d'Avoir & Décharge Financière/i)).not.toBeVisible();

    // Click WhatsApp Manifest button using title
    const whatsappBtn = page.getByTitle(/Copier Décharge Quai WhatsApp/i).first();
    await expect(whatsappBtn).toBeVisible();
    await whatsappBtn.click();

    // Verify toast appears
    await expect(page.getByText(/Décharge WhatsApp copié dans le presse-papier/i).first()).toBeVisible();
  });
});
