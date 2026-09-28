import { describe, it, expect } from 'vitest';
import {
  validateEanBarcode,
  validateIntakePackaging,
  validateIntakePricing,
} from './productIntakeEngine';

describe('Product Intake & Zero-Mistake Validation Engine', () => {
  describe('EAN-13 / EAN-8 Modulo-10 Checksum Validation', () => {
    it('validates a correct standard EAN-13 barcode', () => {
      // 6941782115565 (Common stationery barcode)
      // 6*1 + 9*3 + 4*1 + 1*3 + 7*1 + 8*3 + 2*1 + 1*3 + 1*1 + 5*3 + 5*1 + 6*3 = 115
      // 10 - (115 % 10) = 10 - 5 = 5 (Matches last digit 5)
      const res = validateEanBarcode('6941782115565');
      expect(res.isValid).toBe(true);
      expect(res.cleanedEan).toBe('6941782115565');
      expect(res.expectedCheckDigit).toBe(5);
      expect(res.actualCheckDigit).toBe(5);
    });

    it('rejects an EAN-13 with a single-digit typo or swapped digit', () => {
      // Last digit altered from 5 to 8
      const res = validateEanBarcode('6941782115568');
      expect(res.isValid).toBe(false);
      expect(res.errorReason).toContain('Clé de contrôle erronée');
      expect(res.expectedCheckDigit).toBe(5);
      expect(res.actualCheckDigit).toBe(8);
    });

    it('validates a correct EAN-8 barcode', () => {
      // 96385074
      // 9*3 + 6*1 + 3*3 + 8*1 + 5*3 + 0*1 + 7*3 = 27 + 6 + 9 + 8 + 15 + 0 + 21 = 86
      // 10 - (86 % 10) = 4 (Matches last digit 4)
      const res = validateEanBarcode('96385074');
      expect(res.isValid).toBe(true);
      expect(res.cleanedEan).toBe('96385074');
      expect(res.expectedCheckDigit).toBe(4);
    });

    it('rejects barcode with wrong digit length', () => {
      const res = validateEanBarcode('12345');
      expect(res.isValid).toBe(false);
      expect(res.errorReason).toContain('Longueur invalide');
    });

    it('rejects empty barcode', () => {
      const res = validateEanBarcode('');
      expect(res.isValid).toBe(false);
    });
  });

  describe('Packaging & Colisage Sanity Guard', () => {
    it('approves sound packaging where inner <= outer', () => {
      const res = validateIntakePackaging(24, 6);
      expect(res.isValid).toBe(true);
      expect(res.outerPackSize).toBe(24);
      expect(res.innerPackSize).toBe(6);
      expect(res.error).toBeUndefined();
    });

    it('blocks packaging anomaly where inner pack exceeds outer carton', () => {
      const res = validateIntakePackaging(12, 48);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Incohérence');
      expect(res.error).toContain('ne peut pas dépasser');
    });

    it('clamps negative or zero packaging to minimum 1 piece', () => {
      const res = validateIntakePackaging(0, -5);
      expect(res.isValid).toBe(false);
    });
  });

  describe('Financial Pricing & Margin Integrity Guard', () => {
    it('validates a profitable wholesale & retail price structure', () => {
      const res = validateIntakePricing({
        purchasePrice: 4000,
        wholesalePrice: 5500,
        retailPrice: 7500,
      });

      expect(res.isValid).toBe(true);
      expect(res.isNegativeMargin).toBe(false);
      expect(res.marginGrosDa).toBe(1500);
      expect(res.marginGrosPercent).toBe(27); // 1500 / 5500
      expect(res.marginDetailDa).toBe(3500);
      expect(res.error).toBeUndefined();
    });

    it('strictly blocks negative margin (vente à perte)', () => {
      const res = validateIntakePricing({
        purchasePrice: 5000,
        wholesalePrice: 4200, // Selling below cost!
        retailPrice: 6000,
      });

      expect(res.isValid).toBe(false);
      expect(res.isNegativeMargin).toBe(true);
      expect(res.error).toContain('Vente à perte détectée');
      expect(res.error).toContain('inférieur au prix d\'achat');
    });

    it('strictly blocks retail price being lower than wholesale price', () => {
      const res = validateIntakePricing({
        purchasePrice: 3000,
        wholesalePrice: 5000,
        retailPrice: 4500, // Retail lower than wholesale!
      });

      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Incohérence tarifaire');
      expect(res.error).toContain('prix détail');
    });
  });
});
