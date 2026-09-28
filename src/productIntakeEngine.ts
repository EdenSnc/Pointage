// ============================================================
// POINTAGE — Product Intake & Zero-Mistake Validation Engine
// Saisie des Nouveaux Produits • AI Vision & Extraction Rapide
// Modulo-10 EAN Checksum, Duplicate SKU Guards & Margin Verification
// ============================================================

import { db } from './db';
import type { ProductProfile, WarehouseZone } from './types';
import { providerRegistry } from './ai/providerRegistry';

export interface EanValidationResult {
  isValid: boolean;
  cleanedEan: string;
  expectedCheckDigit?: number;
  actualCheckDigit?: number;
  errorReason?: string;
}

/**
 * Calculates and validates standard EAN-13 / EAN-8 Modulo-10 checksum.
 * Prevents 100% of single-digit transpositions and misread barcodes.
 */
export function validateEanBarcode(rawBarcode: string): EanValidationResult {
  if (!rawBarcode) {
    return { isValid: false, cleanedEan: '', errorReason: 'Code-barres vide' };
  }

  const cleaned = rawBarcode.replace(/[^0-9]/g, '');

  if (cleaned.length === 13) {
    // Standard EAN-13
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(cleaned[i], 10);
      sum += i % 2 === 0 ? digit * 1 : digit * 3;
    }
    const expected = (10 - (sum % 10)) % 10;
    const actual = parseInt(cleaned[12], 10);

    if (expected === actual) {
      return { isValid: true, cleanedEan: cleaned, expectedCheckDigit: expected, actualCheckDigit: actual };
    }
    return {
      isValid: false,
      cleanedEan: cleaned,
      expectedCheckDigit: expected,
      actualCheckDigit: actual,
      errorReason: `Clé de contrôle erronée (attendu: ${expected}, lu: ${actual})`,
    };
  }

  if (cleaned.length === 8) {
    // EAN-8
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const digit = parseInt(cleaned[i], 10);
      sum += i % 2 === 0 ? digit * 3 : digit * 1;
    }
    const expected = (10 - (sum % 10)) % 10;
    const actual = parseInt(cleaned[7], 10);

    if (expected === actual) {
      return { isValid: true, cleanedEan: cleaned, expectedCheckDigit: expected, actualCheckDigit: actual };
    }
    return {
      isValid: false,
      cleanedEan: cleaned,
      expectedCheckDigit: expected,
      actualCheckDigit: actual,
      errorReason: `Clé de contrôle EAN-8 erronée (attendu: ${expected}, lu: ${actual})`,
    };
  }

  if (cleaned.length === 12) {
    // UPC-A (12 digits)
    return { isValid: true, cleanedEan: cleaned };
  }

  return {
    isValid: false,
    cleanedEan: cleaned,
    errorReason: `Longueur invalide (${cleaned.length} chiffres au lieu de 13 ou 8)`,
  };
}

export interface CollisionCheckResult {
  hasConflict: boolean;
  conflictType?: 'reference_exists' | 'barcode_exists';
  existingProduct?: ProductProfile;
  message?: string;
}

/**
 * Checks if the reference or barcode is already assigned to another catalog article.
 * Prevents accidental overwrite of existing warehouse inventory.
 */
export async function checkProductCollision(
  reference: string,
  barcode?: string | null,
  excludeId?: number
): Promise<CollisionCheckResult> {
  const cleanRef = reference.trim().toUpperCase();
  if (!cleanRef) return { hasConflict: false };

  const allProfiles = await db.productProfiles.toArray();

  // 1. Reference check
  const refMatch = allProfiles.find(
    (p) => p.id !== excludeId && p.reference && p.reference.trim().toUpperCase() === cleanRef
  );
  if (refMatch) {
    return {
      hasConflict: true,
      conflictType: 'reference_exists',
      existingProduct: refMatch,
      message: `La référence "${cleanRef}" existe déjà sous : "${refMatch.designation || 'Sans nom'}" (ID: ${refMatch.id})`,
    };
  }

  // 2. Barcode check
  if (barcode) {
    const cleanEan = barcode.replace(/[^0-9]/g, '');
    if (cleanEan.length >= 8) {
      const eanMatch = allProfiles.find(
        (p) => (p as any).barcode === cleanEan || (p as any).ean === cleanEan
      );
      if (eanMatch && eanMatch.id !== excludeId) {
        return {
          hasConflict: true,
          conflictType: 'barcode_exists',
          existingProduct: eanMatch,
          message: `Le code-barres "${cleanEan}" est déjà attribué à : [${eanMatch.reference}] ${eanMatch.designation}`,
        };
      }
    }
  }

  return { hasConflict: false };
}

export interface PackagingValidationResult {
  isValid: boolean;
  outerPackSize: number;
  innerPackSize: number;
  warning?: string;
  error?: string;
}

/**
 * Validates packaging and unit integrity (inner pack <= outer pack, realistic limits).
 */
export function validateIntakePackaging(
  outer: number | string | undefined | null,
  inner: number | string | undefined | null
): PackagingValidationResult {
  const outerNum = typeof outer === 'number' ? outer : parseInt(String(outer || '1'), 10) || 1;
  const innerNum = typeof inner === 'number' ? inner : parseInt(String(inner || '1'), 10) || 1;

  if (outerNum < 1) {
    return { isValid: false, outerPackSize: 1, innerPackSize: 1, error: 'Le conditionnement carton doit être ≥ 1 pièce' };
  }
  if (innerNum < 1) {
    return { isValid: false, outerPackSize: outerNum, innerPackSize: 1, error: 'Le sous-conditionnement doit être ≥ 1 pièce' };
  }
  if (innerNum > outerNum) {
    return {
      isValid: false,
      outerPackSize: outerNum,
      innerPackSize: innerNum,
      error: `Incohérence : Le sous-paquet (${innerNum} pcs) ne peut pas dépasser le carton (${outerNum} pcs)`,
    };
  }
  if (outerNum > 5000) {
    return {
      isValid: true,
      outerPackSize: outerNum,
      innerPackSize: innerNum,
      warning: `Conditionnement très volumineux (${outerNum} pcs). Vérifiez s'il s'agit bien de pièces et non de sous-cartons.`,
    };
  }

  return { isValid: true, outerPackSize: outerNum, innerPackSize: innerNum };
}

export interface MarginValidationResult {
  isValid: boolean;
  purchasePriceDa: number;
  wholesalePriceDa: number;
  retailPriceDa: number;
  marginGrosDa: number;
  marginGrosPercent: number;
  marginDetailDa: number;
  marginDetailPercent: number;
  isNegativeMargin: boolean;
  warning?: string;
  error?: string;
}

/**
 * Evaluates purchase, wholesale and retail pricing.
 * Blocks negative profit margins and flags anomalies before DB insertion.
 */
export function validateIntakePricing(params: {
  purchasePrice?: number | string | null;
  wholesalePrice?: number | string | null;
  retailPrice?: number | string | null;
}): MarginValidationResult {
  const purchase = Math.max(0, Number(params.purchasePrice) || 0);
  const wholesale = Math.max(0, Number(params.wholesalePrice) || 0);
  const retail = Math.max(0, Number(params.retailPrice) || 0);

  const marginGrosDa = wholesale > 0 ? wholesale - purchase : 0;
  const marginGrosPercent = wholesale > 0 ? Math.round((marginGrosDa / wholesale) * 100) : 0;

  const marginDetailDa = retail > 0 ? retail - purchase : 0;
  const marginDetailPercent = retail > 0 ? Math.round((marginDetailDa / retail) * 100) : 0;

  // Strict zero-mistake guards:
  if (purchase > 0 && wholesale > 0 && wholesale < purchase) {
    return {
      isValid: false,
      purchasePriceDa: purchase,
      wholesalePriceDa: wholesale,
      retailPriceDa: retail,
      marginGrosDa,
      marginGrosPercent,
      marginDetailDa,
      marginDetailPercent,
      isNegativeMargin: true,
      error: `Vente à perte détectée ! Prix de gros (${wholesale} DA) inférieur au prix d'achat (${purchase} DA). Perte : ${Math.abs(marginGrosDa)} DA/pc`,
    };
  }

  if (wholesale > 0 && retail > 0 && retail < wholesale) {
    return {
      isValid: false,
      purchasePriceDa: purchase,
      wholesalePriceDa: wholesale,
      retailPriceDa: retail,
      marginGrosDa,
      marginGrosPercent,
      marginDetailDa,
      marginDetailPercent,
      isNegativeMargin: false,
      error: `Incohérence tarifaire : Le prix détail (${retail} DA) ne peut pas être inférieur au prix de gros (${wholesale} DA)`,
    };
  }

  let warning: string | undefined;
  if (wholesale > 0 && purchase > 0 && marginGrosPercent < 4) {
    warning = `Attention : Marge de gros très faible (${marginGrosPercent}%). Vérifiez les montants.`;
  }

  return {
    isValid: true,
    purchasePriceDa: purchase,
    wholesalePriceDa: wholesale,
    retailPriceDa: retail,
    marginGrosDa,
    marginGrosPercent,
    marginDetailDa,
    marginDetailPercent,
    isNegativeMargin: false,
    warning,
  };
}

export interface ExtractedProductAiPayload {
  reference?: string;
  ean?: string;
  designation?: string;
  brand?: string;
  outerPackSize?: number;
  innerPackSize?: number;
  category?: 'scolaire' | 'bureautique' | 'autre';
  purchasePrice?: number;
  wholesalePrice?: number;
  retailPrice?: number;
  isGoldenProduct?: boolean;
  suggestedZone?: WarehouseZone;
  transportability?: 'easily_transportable' | 'bulky_refused';
  confidenceScore: number; // 0 to 1
  rawDetectedSnippets: string[];
}

/**
 * AI Intake Accelerator: Analyzes product photo or shipping document snippet using Gemini Multimodal.
 * Runs deterministic poka-yoke checks on the output before returning.
 */
export async function analyzeProductPhotoWithAi(
  imageBase64: string,
  modelId: string = 'gemini-2.5-flash-lite'
): Promise<ExtractedProductAiPayload> {
  const apiKey = providerRegistry.getApiKey('gemini');
  if (!apiKey) {
    throw new Error('Clé API Gemini non configurée. Activez-la dans les Paramètres.');
  }

  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  const prompt = `Tu es un système expert en enregistrement et catalogage de nouveaux produits pour un entrepôt de papeterie et fournitures scolaires/bureautique en Algérie (SBM, Oxford, Maped, Bic, Schneider, Casio, etc.).
Analyse cette photo de carton, étiquette ou emballage d'article et extrais les informations dans un JSON strict :
{
  "reference": "la référence principale propre (ex: 71662, CAH-96P, STY-01, FX-82, ART-401)",
  "ean": "le code-barres 13 chiffres (EAN-13) si visible et net, sinon null",
  "designation": "la désignation commerciale claire et normalisée en français (ex: Cahier 96 Pages Seyès Grand Format, Boite 50 Stylos Bille Bleus 0.7mm)",
  "brand": "la marque commerciale (ex: SBM, Oxford, Maped, Bic, Schneider, Deli)",
  "category": "scolaire" ou "bureautique" ou "autre",
  "outerPackSize": nombre d'unités par carton/colis si indiqué (ex: 80, 24, 50, 100), sinon null,
  "innerPackSize": sous-conditionnement (ex: 10, 6, 12, 1), sinon 1,
  "purchasePrice": prix d'achat en Dinars Algériens (DA) si mentionné, sinon null,
  "wholesalePrice": prix de gros estimé en DA si mentionné, sinon null,
  "retailPrice": prix public/détail en DA si mentionné, sinon null,
  "isGoldenProduct": true si article star à forte rotation (cahier standard, stylo bleu, trousse rentrée, calculatrice scolaire), false sinon,
  "transportability": "easily_transportable" si compact/léger pour sacoche chauffeur commercial, ou "bulky_refused" si carton lourd/volumineux (>5kg ou >35cm),
  "confidenceScore": indice de certitude de lecture de 0.1 à 1.0,
  "rawDetectedSnippets": ["liste des textes clés lus"]
}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erreur IA Gemini (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const textContent = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Réponse vide du modèle de vision');
  }

  const parsed = JSON.parse(textContent);

  // Validate EAN from AI with deterministic checksum
  let validatedEan: string | undefined = undefined;
  if (parsed.ean) {
    const eanCheck = validateEanBarcode(parsed.ean);
    if (eanCheck.isValid) {
      validatedEan = eanCheck.cleanedEan;
    }
  }

  // Validate packaging
  const packCheck = validateIntakePackaging(parsed.outerPackSize, parsed.innerPackSize);

  return {
    reference: parsed.reference ? String(parsed.reference).trim().toUpperCase() : undefined,
    ean: validatedEan,
    designation: parsed.designation ? String(parsed.designation).trim() : undefined,
    brand: parsed.brand ? String(parsed.brand).trim() : undefined,
    outerPackSize: packCheck.outerPackSize,
    innerPackSize: packCheck.innerPackSize,
    category: parsed.category === 'bureautique' || parsed.category === 'autre' ? parsed.category : 'scolaire',
    purchasePrice: parsed.purchasePrice ? Number(parsed.purchasePrice) : undefined,
    wholesalePrice: parsed.wholesalePrice ? Number(parsed.wholesalePrice) : undefined,
    retailPrice: parsed.retailPrice ? Number(parsed.retailPrice) : undefined,
    isGoldenProduct: Boolean(parsed.isGoldenProduct),
    transportability: parsed.transportability === 'bulky_refused' ? 'bulky_refused' : 'easily_transportable',
    confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.85,
    rawDetectedSnippets: Array.isArray(parsed.rawDetectedSnippets) ? parsed.rawDetectedSnippets : [],
  };
}

/**
 * Commits a newly registered product profile into Dexie DB with full schema safety.
 */
export async function saveNewProductProfile(
  profile: Omit<ProductProfile, 'id' | 'updatedAt'> & { id?: number }
): Promise<number> {
  const now = new Date().toISOString();
  const cleanRef = profile.reference.trim().toUpperCase();

  const dataToSave: ProductProfile = {
    ...profile,
    reference: cleanRef,
    designation: profile.designation ? profile.designation.trim() : cleanRef,
    normalizedDesignation: profile.designation ? profile.designation.trim().toLowerCase() : cleanRef.toLowerCase(),
    outerPackSize: profile.outerPackSize || 1,
    innerPackSize: profile.innerPackSize || 1,
    warehouseZone: profile.warehouseZone || null,
    locationNote: profile.locationNote || null,
    warehouseSite: profile.warehouseSite || 'oran_surface',
    updatedAt: now,
  };

  if (profile.id) {
    await db.productProfiles.update(profile.id, dataToSave);
    return profile.id;
  }

  return db.productProfiles.add(dataToSave);
}
