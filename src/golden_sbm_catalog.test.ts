import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import Dexie, { Table } from 'dexie';
import { ProductProfile } from './types';
import catalogData from './data/golden_sbm_catalog.json';

class TestWarehouseDb extends Dexie {
  productProfiles!: Table<ProductProfile, number>;

  constructor() {
    super('test-catalog-db-' + Math.random());
    this.version(1).stores({
      productProfiles: '++id, reference, normalizedDesignation, category',
    });
  }
}

describe('GOLDEN SBM 2026 Telegram Catalog Integration', () => {
  it('loads valid catalog metadata and products', () => {
    expect(catalogData.products.length).toBeGreaterThanOrEqual(580);
    expect(catalogData.metadata.channel).toBe('GOLDEN SBM');
    expect(catalogData.metadata.categoriesCount).toBeGreaterThanOrEqual(80);
  });

  it('verifies that each product contains required reference, category, and name', () => {
    for (const p of catalogData.products) {
      expect(p.reference).toBeTruthy();
      expect(p.reference.length).toBeGreaterThan(0);
      expect(p.category).toBeTruthy();
      expect(p.name).toBeTruthy();
    }
  });

  it('verifies that saved product images exist on disk in public/products/', () => {
    const productsWithImages = catalogData.products.filter((p: any) => p.imagePath);
    expect(productsWithImages.length).toBeGreaterThanOrEqual(400);

    // Verify first 20 images exist on disk
    for (const p of productsWithImages.slice(0, 20)) {
      const fullDiskPath = path.join(process.cwd(), 'public', p.imagePath.replace(/^\//, ''));
      expect(fs.existsSync(fullDiskPath)).toBe(true);
    }
  });

  it('seeds cleanly into Dexie productProfiles table without collision', async () => {
    const db = new TestWarehouseDb();
    const now = new Date().toISOString();

    const uniqueMap = new Map<string, ProductProfile>();
    for (const p of catalogData.products) {
      if (!uniqueMap.has(p.reference)) {
        uniqueMap.set(p.reference, {
          reference: p.reference,
          designation: p.name,
          normalizedDesignation: (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
          outerPackSize: null,
          innerPackSize: null,
          warehouseZone: null,
          imageUrl: p.imagePath || null,
          updatedAt: now,
        });
      }
    }

    await db.productProfiles.bulkAdd(Array.from(uniqueMap.values()));
    const count = await db.productProfiles.count();
    expect(count).toBe(uniqueMap.size);
    expect(count).toBeGreaterThan(450);

    // Verify key products lookups
    const colle = await db.productProfiles.where('reference').equals('51064').first();
    expect(colle).toBeDefined();
    expect(colle?.designation).toContain('COLLE');

    const cartable = await db.productProfiles.where('reference').equals('72950').first();
    expect(cartable).toBeDefined();
    expect(cartable?.designation).toContain('CARTABLE EN CUIR');

    const ciseaux = await db.productProfiles.where('reference').equals('38045').first();
    expect(ciseaux).toBeDefined();
    expect(ciseaux?.designation).toContain('CISEAUX ECOLIER');

    await db.delete();
  });
});
