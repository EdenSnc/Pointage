import { describe, it, expect } from 'vitest';
import {
  extractReferenceCandidates,
  matchCandidateToCatalog,
  type CatalogItemLookups,
} from './opticalScannerEngine';

describe('Optical Scanner Engine: Barcode & Reference Extraction', () => {
  // =========================================================================
  // 1. EXTRACTION FROM NOISY CARTON TEXT & LABELS
  // =========================================================================

  describe('1. Candidate Extraction from Carton Text', () => {
    it('1.1: Extracts explicit REF prefix from noisy cardboard markings', () => {
      const cartonText = 'SARL SBM IMPORT EXP REF: 71662 COLIS 50 PCS MADE IN CHINA';
      const candidates = extractReferenceCandidates(cartonText);
      expect(candidates).toContain('71662');
    });

    it('1.2: Extracts various prefix notations (ART, ITEM NO, CODE, N°, SKU)', () => {
      expect(extractReferenceCandidates('ART. 1012 - PINCE UNIVERSELLE')).toContain('1012');
      expect(extractReferenceCandidates('ITEM NO: 620/A TROUSSE')).toContain('620/A');
      expect(extractReferenceCandidates('CODE: 29129 FEUTRE NOIR')).toContain('29129');
      expect(extractReferenceCandidates('N° 03885')).toContain('03885');
      expect(extractReferenceCandidates('SKU-99 AGRAFEUSE')).toContain('SKU-99');
    });

    it('1.3: Filters out noise words and generic warehouse terms', () => {
      const noisy = 'CARTON PIECES QTY 100 WEIGHT 15 KGS MADE IN ALGERIA SBM';
      const candidates = extractReferenceCandidates(noisy);
      expect(candidates).not.toContain('CARTON');
      expect(candidates).not.toContain('PIECES');
      expect(candidates).not.toContain('WEIGHT');
      expect(candidates).not.toContain('MADE');
    });

    it('1.4: Handles empty or non-string inputs safely without throwing', () => {
      expect(extractReferenceCandidates('')).toEqual([]);
      expect(extractReferenceCandidates('   ')).toEqual([]);
      expect(extractReferenceCandidates(null as any)).toEqual([]);
      expect(extractReferenceCandidates(undefined as any)).toEqual([]);
    });

    it('1.5: Extracts hyphenated and slashed codes', () => {
      const text = 'BOITE CLASSEURS REF: 70380/84 BLEU 10PCS';
      const candidates = extractReferenceCandidates(text);
      expect(candidates).toContain('70380/84');
    });
  });

  // =========================================================================
  // 2. CATALOG MATCHING LOGIC
  // =========================================================================

  describe('2. Catalog Matching Logic', () => {
    const mockCatalog: CatalogItemLookups[] = [
      {
        reference: '71662',
        designation: 'SAC A DOS MOYEN 22 L 4 MO 71662',
        ean: '6941782115831',
        aliases: ['SAC-71662'],
      },
      {
        reference: 'ART-1012',
        designation: 'Disque à tronçonner 115mm',
        ean: '6130000010123',
      },
      {
        reference: '620',
        designation: 'Trousse scolaire ronde',
        ean: '6130000006200',
        aliases: ['TROUSSE-620'],
      },
      {
        reference: 'REF/2026/A',
        designation: 'Marteau manche bois 300g',
        ean: null,
      },
    ];

    it('2.1: Matches exact reference candidate with 1.0 confidence', () => {
      const candidates = ['71662'];
      const match = matchCandidateToCatalog(candidates, mockCatalog);
      expect(match).not.toBeNull();
      expect(match?.matchedReference).toBe('71662');
      expect(match?.matchType).toBe('exact_ref');
      expect(match?.confidence).toBe(1.0);
    });

    it('2.2: Matches EAN barcode string with 0.98 confidence', () => {
      const candidates = ['6941782115831'];
      const match = matchCandidateToCatalog(candidates, mockCatalog);
      expect(match).not.toBeNull();
      expect(match?.matchedReference).toBe('71662');
      expect(match?.matchType).toBe('exact_ean');
      expect(match?.confidence).toBe(0.98);
    });

    it('2.3: Matches alias when reference has alternate code', () => {
      const candidates = ['SAC-71662'];
      const match = matchCandidateToCatalog(candidates, mockCatalog);
      expect(match).not.toBeNull();
      expect(match?.matchedReference).toBe('71662');
      expect(match?.matchType).toBe('alias_ref');
    });

    it('2.4: Matches clean alphanumeric code ignoring slashes and symbols', () => {
      const candidates = ['REF2026A'];
      const match = matchCandidateToCatalog(candidates, mockCatalog);
      expect(match).not.toBeNull();
      expect(match?.matchedReference).toBe('REF/2026/A');
      expect(match?.matchType).toBe('clean_ref');
    });

    it('2.5: Matches numeric substring/suffix when candidate is pure number of SKU', () => {
      const candidates = ['1012'];
      const match = matchCandidateToCatalog(candidates, mockCatalog);
      expect(match).not.toBeNull();
      expect(match?.matchedReference).toBe('ART-1012');
      expect(match?.matchType).toBe('numeric_suffix');
    });

    it('2.6: Returns null when candidates do not match any catalog item', () => {
      const candidates = ['UNKNOWN-9999', 'NOTHING'];
      const match = matchCandidateToCatalog(candidates, mockCatalog);
      expect(match).toBeNull();
    });

    it('2.7: Handles empty candidates or empty catalog gracefully', () => {
      expect(matchCandidateToCatalog([], mockCatalog)).toBeNull();
      expect(matchCandidateToCatalog(['71662'], [])).toBeNull();
    });
  });

  // =========================================================================
  // 3. OPTICAL SCANNER COORDINATOR
  // =========================================================================

  describe('3. OpticalScannerCoordinator Video Ingestion', () => {
    it('3.1: Returns null gracefully if video is not yet ready (readyState < 2)', async () => {
      const { opticalScannerCoordinator } = await import('./opticalScannerEngine');
      const fakeVideo = { readyState: 0 } as any;
      const result = await opticalScannerCoordinator.detectBarcodeFromVideo(fakeVideo);
      expect(result).toBeNull();

      const textResult = await opticalScannerCoordinator.detectReferenceTextFromVideo(fakeVideo, []);
      expect(textResult).toBeNull();
    });

    it('3.2: Safely handles null video element without throwing', async () => {
      const { opticalScannerCoordinator } = await import('./opticalScannerEngine');
      const result = await opticalScannerCoordinator.detectBarcodeFromVideo(null as any);
      expect(result).toBeNull();

      const textResult = await opticalScannerCoordinator.detectReferenceTextFromVideo(null as any, []);
      expect(textResult).toBeNull();
    });
  });
});

