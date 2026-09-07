import { describe, it, expect } from 'vitest';
import { detectWilaya, decomposeTimestamp, ALGERIAN_WILAYAS } from './wilayas';

describe('Algerian Wilayas & Temporal Decomposition Engine', () => {
  it('has all 58 official Algerian Wilayas catalogued', () => {
    expect(ALGERIAN_WILAYAS.length).toBe(58);
    expect(ALGERIAN_WILAYAS[0].code).toBe('01');
    expect(ALGERIAN_WILAYAS[0].name).toBe('Adrar');
    expect(ALGERIAN_WILAYAS[15].code).toBe('16');
    expect(ALGERIAN_WILAYAS[15].name).toBe('Alger');
    expect(ALGERIAN_WILAYAS[30].code).toBe('31');
    expect(ALGERIAN_WILAYAS[30].name).toBe('Oran');
    expect(ALGERIAN_WILAYAS[57].code).toBe('58');
    expect(ALGERIAN_WILAYAS[57].name).toBe('In Guezzam');
  });

  it('detects wilaya by city name or known commune', () => {
    const r1 = detectWilaya('SARL GLOBAL DISTRIBUTION ALGER');
    expect(r1).not.toBeNull();
    expect(r1?.wilayaCode).toBe('16');
    expect(r1?.wilaya).toBe('16 - Alger');

    const r2 = detectWilaya('ETS BELKACEM - ES SENIA ORAN');
    expect(r2).not.toBeNull();
    expect(r2?.wilayaCode).toBe('31');
    expect(r2?.wilaya).toBe('31 - Oran');

    const r3 = detectWilaya('ZONE INDUSTRIELLE BBA (BORDJ BOU ARRERIDJ)');
    expect(r3).not.toBeNull();
    expect(r3?.wilayaCode).toBe('34');

    const r4 = detectWilaya('KHEMIS MILIANA');
    expect(r4).not.toBeNull();
    expect(r4?.wilayaCode).toBe('44');
    expect(r4?.wilaya).toBe('44 - Aïn Defla');
  });

  it('detects wilaya by numerical code tokens', () => {
    const r1 = detectWilaya('LIVRAISON CLIENT COMPTOIR (16)');
    expect(r1?.wilayaCode).toBe('16');

    const r2 = detectWilaya('DESTINATION W09 BLIDA');
    expect(r2?.wilayaCode).toBe('09');
    expect(r2?.wilaya).toBe('09 - Blida');
  });

  it('returns null gracefully for ambiguous or non-geographical text', () => {
    expect(detectWilaya('')).toBeNull();
    expect(detectWilaya(null)).toBeNull();
    expect(detectWilaya('CLIENT DIVERS SANS ADRESSE')).toBeNull();
  });

  it('decomposes timestamps into granular fields for database filtering', () => {
    const testDate = new Date('2026-09-07T14:35:22.000Z');
    const decomposed = decomposeTimestamp(testDate);

    expect(decomposed.year).toBe(testDate.getFullYear());
    expect(decomposed.month).toBe(testDate.getMonth() + 1);
    expect(decomposed.day).toBe(testDate.getDate());
    expect(decomposed.hour).toBe(testDate.getHours());
    expect(decomposed.minute).toBe(testDate.getMinutes());
    expect(decomposed.second).toBe(testDate.getSeconds());
    expect(decomposed.timestamp).toBe(testDate.getTime());
    expect(decomposed.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(decomposed.timeStr).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
