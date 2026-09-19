import type { Page } from '@playwright/test';

/**
 * Seeds a deterministic warehouse dataset directly into Dexie IndexedDB
 * (Sessions, Active Bills, Order Lines, Master Profiles)
 */
export async function clearAndSeedDatabase(page: Page) {
  // Navigate to root so Dexie DB is initialized
  await page.goto('/');

  // Set standard localStorage configuration (skip onboarding walkthrough, set operators)
  await page.evaluate(() => {
    localStorage.setItem('pointage_onboarded', 'true');
    localStorage.setItem('pointage_onboarding_seen', 'true');
    localStorage.setItem('pointage_operator', 'Mourad');
    localStorage.setItem(
      'pointage_operator_roster',
      JSON.stringify(['Mourad', 'Karim', 'Amine', 'Yacine'])
    );
  });

  // Seed IndexedDB tables directly
  await page.evaluate(async () => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('pointage-surface-db');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const idb = req.result;
        const tx = idb.transaction(
          ['workSessions', 'bills', 'orderLines', 'productProfiles', 'countEvents'],
          'readwrite'
        );

        tx.objectStore('workSessions').clear();
        tx.objectStore('bills').clear();
        tx.objectStore('orderLines').clear();
        tx.objectStore('productProfiles').clear();
        tx.objectStore('countEvents').clear();

        // 1. Active Work Session
        tx.objectStore('workSessions').put({
          id: 1,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // 2. Active and Completed Customer Orders (BLs)
        tx.objectStore('bills').put({
          id: 1,
          sessionId: 1,
          billNumber: 'BL-2026-001',
          client: 'ETS MOHAMED BENALI (ORAN)',
          date: '2026-09-17',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        tx.objectStore('bills').put({
          id: 2,
          sessionId: 1,
          billNumber: 'BL-2026-002',
          client: 'SARL PAPETERIE CENTRALE (ALGER)',
          date: '2026-09-10',
          status: 'completed',
          createdAt: new Date('2026-09-10T10:00:00Z').toISOString(),
          updatedAt: new Date('2026-09-10T12:00:00Z').toISOString(),
        });

        // 3. Order Lines with Diverse Categories and Edge Cases
        const lineStore = tx.objectStore('orderLines');
        lineStore.put({
          id: 1,
          billId: 1,
          no: '1',
          originalNo: '1',
          page: 1,
          originalPage: 1,
          reference: 'ART-1012',
          originalReference: 'ART-1012',
          ean: '6130000010123',
          originalEan: '6130000010123',
          designation: 'Disque à tronçonner 115mm acier',
          originalDesignation: 'Disque à tronçonner 115mm acier',
          orderedQty: 20,
          originalOrderedQty: 20,
          status: 'active',
          outerPackSize: 50,
          innerPackSize: 10,
          warehouseZone: 'CH_CTR',
          packagesRaw: '50 PCS/CTN',
          referenceAliases: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        lineStore.put({
          id: 2,
          billId: 1,
          no: '2',
          originalNo: '2',
          page: 1,
          originalPage: 1,
          reference: '71662',
          originalReference: '71662',
          ean: '6941782115831',
          originalEan: '6941782115831',
          designation: 'SAC A DOS MOYEN 22 L 4 MO 71662',
          originalDesignation: 'SAC A DOS MOYEN 22 L 4 MO 71662',
          orderedQty: 10,
          originalOrderedQty: 10,
          status: 'active',
          outerPackSize: 20,
          innerPackSize: 5,
          warehouseZone: null,
          packagesRaw: '20 PCS/CTN',
          referenceAliases: ['SAC-71662'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        lineStore.put({
          id: 3,
          billId: 1,
          no: '3',
          originalNo: '3',
          page: 1,
          originalPage: 1,
          reference: 'REF-B2',
          originalReference: 'REF-B2',
          ean: '613000000002',
          originalEan: '613000000002',
          designation: 'STYLO A BILLE BLEU 0.7',
          originalDesignation: 'STYLO A BILLE BLEU 0.7',
          orderedQty: 100,
          originalOrderedQty: 100,
          status: 'active',
          outerPackSize: 50,
          innerPackSize: 50,
          warehouseZone: 'CO_R2',
          packagesRaw: '50 PCS/BTE',
          referenceAliases: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        lineStore.put({
          id: 4,
          billId: 1,
          no: '4',
          originalNo: '4',
          page: 1,
          originalPage: 1,
          reference: 'SURPLUS-ITEM',
          originalReference: 'SURPLUS-ITEM',
          ean: '613999999001',
          originalEan: '613999999001',
          designation: 'MARQUEUR PERMANENT NOIR',
          originalDesignation: 'MARQUEUR PERMANENT NOIR',
          orderedQty: 5,
          originalOrderedQty: 5,
          status: 'active',
          outerPackSize: 10,
          innerPackSize: 2,
          warehouseZone: 'CH_SE',
          packagesRaw: '10 PCS/CTN',
          referenceAliases: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Archived bill lines for cross-bill & history tests
        lineStore.put({
          id: 5,
          billId: 2,
          no: '1',
          originalNo: '1',
          page: 1,
          originalPage: 1,
          reference: 'ART-1012',
          originalReference: 'ART-1012',
          ean: '6130000010123',
          originalEan: '6130000010123',
          designation: 'Disque à tronçonner 115mm acier (ARCHIVE)',
          originalDesignation: 'Disque à tronçonner 115mm acier (ARCHIVE)',
          orderedQty: 30,
          originalOrderedQty: 30,
          status: 'active',
          outerPackSize: 50,
          innerPackSize: 10,
          warehouseZone: 'CH_CTR',
          packagesRaw: '50 PCS/CTN',
          referenceAliases: [],
          createdAt: new Date('2026-09-10T10:00:00Z').toISOString(),
          updatedAt: new Date('2026-09-10T10:00:00Z').toISOString(),
        });

        lineStore.put({
          id: 6,
          billId: 2,
          no: '2',
          originalNo: '2',
          page: 1,
          originalPage: 1,
          reference: '72950',
          originalReference: '72950',
          ean: '6941782117149',
          originalEan: '6941782117149',
          designation: 'CARTABLE EN CUIR 72950',
          originalDesignation: 'CARTABLE EN CUIR 72950',
          orderedQty: 15,
          originalOrderedQty: 15,
          status: 'active',
          outerPackSize: 10,
          innerPackSize: 1,
          warehouseZone: 'CH_NW',
          packagesRaw: '10 PCS/CTN',
          referenceAliases: [],
          createdAt: new Date('2026-09-10T10:00:00Z').toISOString(),
          updatedAt: new Date('2026-09-10T10:00:00Z').toISOString(),
        });

        // 4. Product Profiles
        const profileStore = tx.objectStore('productProfiles');
        profileStore.put({
          reference: 'ART-1012',
          designation: 'Disque à tronçonner 115mm acier',
          warehouseZone: 'CH_CTR',
          outerPackSize: 50,
          innerPackSize: 10,
          updatedAt: new Date().toISOString(),
        });

        profileStore.put({
          reference: '71662',
          designation: 'SAC A DOS MOYEN 22 L 4 MO 71662',
          warehouseZone: null,
          outerPackSize: 20,
          innerPackSize: 5,
          updatedAt: new Date().toISOString(),
        });

        profileStore.put({
          reference: '72950',
          designation: 'CARTABLE EN CUIR 72950',
          warehouseZone: 'CH_NW',
          outerPackSize: 10,
          innerPackSize: 1,
          updatedAt: new Date().toISOString(),
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });

  // Reload page to hydrate Dexie useLiveQuery hooks
  await page.reload();
}

/**
 * Resets database to complete empty state
 */
export async function clearDatabase(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('pointage_onboarded', 'true');
    localStorage.setItem('pointage_onboarding_seen', 'true');
    localStorage.setItem('pointage_operator', 'Mourad');
  });
  await page.evaluate(async () => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('pointage-surface-db');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const idb = req.result;
        const tx = idb.transaction(
          ['workSessions', 'bills', 'orderLines', 'productProfiles', 'countEvents'],
          'readwrite'
        );
        tx.objectStore('workSessions').clear();
        tx.objectStore('bills').clear();
        tx.objectStore('orderLines').clear();
        tx.objectStore('productProfiles').clear();
        tx.objectStore('countEvents').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
}
