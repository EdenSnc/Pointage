import { describe, it, expect } from 'vitest';
import {
  extractPackagingInfo,
  extractBrandKeyword,
  extractOpticalFeaturesFromText,
  reconcileProductRecognition,
} from './opticalProductRecognition';
import type { OrderLine, ProductProfile } from './types';

describe('Optical Feature & Packaging Extraction', () => {
  it('extracts pack size from standard Algerian carton notations', () => {
    expect(extractPackagingInfo('CARTON DE 48 PCS').packSize).toBe(48);
    expect(extractPackagingInfo('COLIS 100 PIECES').packSize).toBe(100);
    expect(extractPackagingInfo('Qté: 24 u').packSize).toBe(24);
    expect(extractPackagingInfo('BOX x50').packSize).toBe(50);
  });

  it('extracts nested inner and outer packaging (e.g. 10 x 50)', () => {
    const res = extractPackagingInfo('PAQUET 10 x 50 PCS');
    expect(res.innerPackSize).toBe(10);
    expect(res.packSize).toBe(500);
  });

  it('detects famous stationery and warehouse brands', () => {
    expect(extractBrandKeyword('Stylos bille BIC cristal bleu')).toBe('BIC');
    expect(extractBrandKeyword('Compas scolaire MAPED stop system')).toBe('MAPED');
    expect(extractBrandKeyword('Cahier OXFORD 96 pages')).toBe('OXFORD');
    expect(extractBrandKeyword('Disque a tronconner CROWN 115mm')).toBe('CROWN');
    expect(extractBrandKeyword('Article sans marque connue')).toBeUndefined();
  });

  it('generates structured optical features and HUD bounding boxes', () => {
    const rawText = 'SBM IMP/EXP\nREF: 71662\nEAN: 6131234567890\nCARTON DE 24 PCS';
    const features = extractOpticalFeaturesFromText(rawText);

    expect(features.referenceCandidates).toContain('71662');
    expect(features.eanCandidates).toContain('6131234567890');
    expect(features.packSize).toBe(24);
    expect(features.brand).toBe('SBM');
    expect(features.boundingBoxes.length).toBeGreaterThanOrEqual(3);

    // Verify bounding box structure
    const refBox = features.boundingBoxes.find((b) => b.type === 'reference');
    expect(refBox).toBeDefined();
    expect(refBox?.label).toContain('71662');

    const eanBox = features.boundingBoxes.find((b) => b.type === 'ean');
    expect(eanBox).toBeDefined();
    expect(eanBox?.label).toContain('6131234567890');
  });
});

describe('Multi-Tiered Product Reconciler', () => {
  const dummyLines: OrderLine[] = [
    {
      id: 1,
      billId: 101,
      no: '1',
      reference: 'ART-1012',
      designation: 'Disque a tronconner 115mm',
      ean: '6130001112223',
      quantity: 20,
      status: 'active',
      outerPackSize: 50,
      referenceAliases: ['DISQUE-115'],
    },
    {
      id: 2,
      billId: 101,
      no: '2',
      reference: '71662',
      designation: 'SAC A DOS MOYEN 22 L 4 MO 71662',
      quantity: 10,
      status: 'active',
      outerPackSize: 24,
      referenceAliases: [],
    },
    {
      id: 3,
      billId: 101,
      no: '3',
      reference: 'CAH-96P-SEYES',
      designation: 'Cahier 96p seyes 24x32',
      ean: '3086123456789',
      quantity: 200,
      status: 'active',
      outerPackSize: 100,
      referenceAliases: [],
    },
  ];

  it('Tier 1: matches exact EAN against active bill lines with highest confidence', () => {
    const features = extractOpticalFeaturesFromText('CODE: 3086123456789');
    const result = reconcileProductRecognition(features, dummyLines);

    expect(result.matchType).toBe('bill_exact');
    expect(result.matchedLine?.id).toBe(3);
    expect(result.reference).toBe('CAH-96P-SEYES');
    expect(result.confidence).toBe(0.99);
  });

  it('Tier 1: matches exact reference against active bill lines', () => {
    const features = extractOpticalFeaturesFromText('REF: 71662\nCOLIS 24 PCS');
    const result = reconcileProductRecognition(features, dummyLines);

    expect(result.matchType).toBe('bill_exact');
    expect(result.matchedLine?.id).toBe(2);
    expect(result.packSize).toBe(24);
    expect(result.confidence).toBe(0.98);
  });

  it('Tier 1: matches reference alias (e.g. DISQUE-115)', () => {
    const features = extractOpticalFeaturesFromText('REF: DISQUE-115');
    const result = reconcileProductRecognition(features, dummyLines);

    expect(result.matchType).toBe('bill_exact');
    expect(result.matchedLine?.id).toBe(1);
    expect(result.reference).toBe('ART-1012');
  });

  it('Tier 1: matches partial reference token', () => {
    const features = extractOpticalFeaturesFromText('ITEM: 1012');
    const result = reconcileProductRecognition(features, dummyLines);

    expect(result.matchType).toBe('bill_partial');
    expect(result.matchedLine?.id).toBe(1);
    expect(result.confidence).toBe(0.92);
  });

  it('Tier 2: matches sibling bill lines of the same client', () => {
    const siblingLines: OrderLine[] = [
      {
        id: 99,
        billId: 102,
        no: '4',
        reference: 'STY-BIC-BLEU',
        designation: 'Stylo a bille bleu',
        quantity: 50,
        status: 'active',
        outerPackSize: 60,
        referenceAliases: [],
      },
    ];

    const features = extractOpticalFeaturesFromText('REF: STY-BIC-BLEU');
    const result = reconcileProductRecognition(features, dummyLines, siblingLines, 'BL-102');

    expect(result.matchType).toBe('sibling_match');
    expect(result.matchedSiblingLine?.id).toBe(99);
    expect(result.matchedSiblingBillNumber).toBe('BL-102');
    expect(result.confidence).toBe(0.91);
  });

  it('Tier 3: matches general master catalog profile', () => {
    const profiles: ProductProfile[] = [
      {
        id: 501,
        reference: 'REG-30CM-ALU',
        designation: 'Regle aluminium 30cm',
        outerPackSize: 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const features = extractOpticalFeaturesFromText('REF: REG-30CM-ALU');
    const result = reconcileProductRecognition(features, dummyLines, [], undefined, profiles);

    expect(result.matchType).toBe('catalog_profile');
    expect(result.matchedProfile?.id).toBe(501);
    expect(result.designation).toBe('Regle aluminium 30cm');
    expect(result.confidence).toBe(0.86);
  });

  it('Tier 4: marks completely unknown items as unmatched new product ready for extra/reception', () => {
    const features = extractOpticalFeaturesFromText('REF: NOUVEAU-PRODUIT-XYZ\nCARTON DE 12 PCS');
    const result = reconcileProductRecognition(features, dummyLines);

    expect(result.matchType).toBe('unmatched_new');
    expect(result.reference).toBe('NOUVEAU-PRODUIT-XYZ');
    expect(result.packSize).toBe(12);
  });
});
