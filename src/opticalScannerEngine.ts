// ============================================================
// POINTAGE — Dual-Mode Optical Scanner Engine
// Detects both Barcodes (EAN, Code-128, QR) AND Printed Reference Numbers (Carton Text)
// Engineered for Smartphone PWAs in Warehouse Logistics (100% Offline Capable)
// ============================================================

export interface OpticalCandidateMatch {
  candidate: string;
  matchedReference: string;
  matchedEan?: string;
  designation?: string;
  confidence: number;
  matchType: 'exact_ref' | 'exact_ean' | 'alias_ref' | 'numeric_suffix' | 'clean_ref';
}

export interface OpticalScanResult {
  type: 'barcode' | 'reference';
  rawCode: string;
  matchedReference?: string;
  matchedEan?: string;
  designation?: string;
  confidence: number;
  source: 'barcode_detector' | 'zxing' | 'text_detector' | 'ocr_canvas';
  label: string;
}

export interface CatalogItemLookups {
  reference: string;
  designation?: string;
  ean?: string | null;
  aliases?: string[];
}

/**
 * Common prefixes used on imported cardboard cartons & packaging labels
 * (French, English, Turkish, Chinese export conventions).
 */
const REFERENCE_PREFIX_REGEX =
  /(?:(?:R[EÉ]F|ART(?:ICLE)?|ITEM(?:\s*N[O°])?|CODE|N[O°]|SKU|MOD(?:[EÈ]LE)?|P\/N|S\/N)[\s.:#/-]*)([A-Z0-9][A-Z0-9_./-]{1,24})/gi;

/**
 * Extracts all viable reference number candidates from raw OCR / camera text.
 * High priority is given to explicit prefix matches (e.g. "REF: 71662"),
 * followed by isolated alphanumeric SKU patterns.
 */
export function extractReferenceCandidates(rawText: string): string[] {
  if (!rawText || typeof rawText !== 'string') return [];

  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (val: string) => {
    if (!val) return;
    // Clean leading/trailing punctuation and whitespace
    const cleaned = val
      .trim()
      .replace(/^[\s.:#/-]+/, '')
      .replace(/[\s.:#/-]+$/, '')
      .toUpperCase();

    // Discard empty, single-character, or excessively long strings
    if (cleaned.length < 2 || cleaned.length > 30) return;
    // Discard common noise words often found on cartons
    const noiseWords = new Set([
      'MADE',
      'CHINA',
      'ALGERIA',
      'FRANCE',
      'COLIS',
      'CARTON',
      'PIECES',
      'PIECE',
      'PCS',
      'QTY',
      'QUANTITE',
      'TOTAL',
      'PACK',
      'BOX',
      'POIDS',
      'WEIGHT',
      'KGS',
      'GROS',
      'SBM',
      'SAKER',
      'SARL',
      'IMPORT',
      'EXPORT',
    ]);
    if (noiseWords.has(cleaned)) return;

    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      candidates.push(cleaned);
    }
  };

  // 1. High Priority: Explicit Prefix Matches (e.g. "REF: 71662", "ART. 1012")
  let match: RegExpExecArray | null;
  const prefixRegex = new RegExp(REFERENCE_PREFIX_REGEX);
  while ((match = prefixRegex.exec(rawText)) !== null) {
    if (match[1]) {
      addCandidate(match[1]);
    }
  }

  // 2. Medium Priority: Numbers or alphanumeric tokens (3 to 10 digits or hyphenated codes)
  // e.g. "71662", "1012", "620", "29129", "SAJ/2026", "SKU-99", "REF-A1"
  const tokenRegex = /\b([A-Z0-9]{1,6}[-/][A-Z0-9]{1,8}|[0-9]{3,8}|[A-Z]{2,4}[0-9]{2,6})\b/gi;
  while ((match = tokenRegex.exec(rawText)) !== null) {
    if (match[1]) {
      addCandidate(match[1]);
    }
  }

  // 3. Low Priority: Check any other distinct 3-8 character alphanumeric tokens
  const words = rawText.split(/[\s,;|]+/);
  for (const w of words) {
    const alphanumeric = w.replace(/[^A-Za-z0-9/-]/g, '');
    if (alphanumeric.length >= 3 && alphanumeric.length <= 12) {
      addCandidate(alphanumeric);
    }
  }

  return candidates;
}

/**
 * Matches extracted candidates against a provided catalog (productProfiles or orderLines).
 * Returns the best matching product, or null if no catalog reference matches.
 */
export function matchCandidateToCatalog(
  candidates: string[],
  catalog: CatalogItemLookups[]
): OpticalCandidateMatch | null {
  if (!candidates || candidates.length === 0 || !catalog || catalog.length === 0) {
    return null;
  }

  // Build lookup structures for O(1) matching
  const exactRefMap = new Map<string, CatalogItemLookups>();
  const exactEanMap = new Map<string, CatalogItemLookups>();
  const cleanRefMap = new Map<string, CatalogItemLookups>();
  const aliasMap = new Map<string, CatalogItemLookups>();

  for (const item of catalog) {
    if (item.reference) {
      const upperRef = item.reference.trim().toUpperCase();
      exactRefMap.set(upperRef, item);
      const cleanRef = upperRef.replace(/[^A-Z0-9]/g, '');
      if (cleanRef.length >= 2) {
        cleanRefMap.set(cleanRef, item);
      }
    }
    if (item.ean) {
      const cleanEan = item.ean.trim().replace(/[^0-9]/g, '');
      if (cleanEan.length >= 6) {
        exactEanMap.set(cleanEan, item);
      }
    }
    if (item.aliases && item.aliases.length > 0) {
      for (const alias of item.aliases) {
        if (alias) {
          aliasMap.set(alias.trim().toUpperCase(), item);
        }
      }
    }
  }

  // Priority 1: Exact Reference Match
  for (const cand of candidates) {
    const upper = cand.toUpperCase();
    const hit = exactRefMap.get(upper);
    if (hit) {
      return {
        candidate: cand,
        matchedReference: hit.reference,
        matchedEan: hit.ean || undefined,
        designation: hit.designation,
        confidence: 1.0,
        matchType: 'exact_ref',
      };
    }
  }

  // Priority 2: Exact EAN Match
  for (const cand of candidates) {
    const cleanNumbers = cand.replace(/[^0-9]/g, '');
    if (cleanNumbers.length >= 6) {
      const hit = exactEanMap.get(cleanNumbers);
      if (hit) {
        return {
          candidate: cand,
          matchedReference: hit.reference,
          matchedEan: hit.ean || undefined,
          designation: hit.designation,
          confidence: 0.98,
          matchType: 'exact_ean',
        };
      }
    }
  }

  // Priority 3: Reference Alias Match
  for (const cand of candidates) {
    const upper = cand.toUpperCase();
    const hit = aliasMap.get(upper);
    if (hit) {
      return {
        candidate: cand,
        matchedReference: hit.reference,
        matchedEan: hit.ean || undefined,
        designation: hit.designation,
        confidence: 0.95,
        matchType: 'alias_ref',
      };
    }
  }

  // Priority 4: Clean Alphanumeric Match (stripping hyphens, spaces, slashes)
  for (const cand of candidates) {
    const cleanCand = cand.replace(/[^A-Z0-9]/g, '');
    if (cleanCand.length >= 3) {
      const hit = cleanRefMap.get(cleanCand);
      if (hit) {
        return {
          candidate: cand,
          matchedReference: hit.reference,
          matchedEan: hit.ean || undefined,
          designation: hit.designation,
          confidence: 0.90,
          matchType: 'clean_ref',
        };
      }
    }
  }

  // Priority 5: Numeric Proximity / Substring Match for references
  // e.g. If candidate is "71662" and reference is "SAC-71662" or "71662-BLEU"
  for (const cand of candidates) {
    if (cand.length >= 3) {
      const matchingItem = catalog.find((item) => {
        if (!item.reference) return false;
        const up = item.reference.toUpperCase();
        return up === cand || up.includes(cand);
      });
      if (matchingItem) {
        return {
          candidate: cand,
          matchedReference: matchingItem.reference,
          matchedEan: matchingItem.ean || undefined,
          designation: matchingItem.designation,
          confidence: 0.85,
          matchType: 'numeric_suffix',
        };
      }
    }
  }

  return null;
}

/**
 * Optical Scanner Coordinator:
 * Coordinates Barcode Detection (native BarcodeDetector or ZXing)
 * and Optical Reference Text Detection (native TextDetector or Canvas OCR).
 */
export class OpticalScannerCoordinator {
  private zxingReader: any = null;
  private nativeBarcodeDetector: any = null;
  private nativeTextDetector: any = null;
  private hasCheckedNativeSupport = false;

  constructor() {
    this.initNativeDetectors();
  }

  private initNativeDetectors() {
    if (typeof window === 'undefined') return;
    if (this.hasCheckedNativeSupport) return;
    this.hasCheckedNativeSupport = true;

    // Check Native BarcodeDetector (Supported in modern Chromium / Android Chrome)
    if ('BarcodeDetector' in window) {
      try {
        this.nativeBarcodeDetector = new (window as any).BarcodeDetector({
          formats: [
            'ean_13',
            'ean_8',
            'code_128',
            'code_39',
            'itf',
            'upc_a',
            'upc_e',
            'qr_code',
          ],
        });
      } catch (e) {
        console.warn('Native BarcodeDetector initialization warning:', e);
      }
    }

    // Check Native TextDetector (Shape Detection API on Android Chromium)
    if ('TextDetector' in window) {
      try {
        this.nativeTextDetector = new (window as any).TextDetector();
      } catch (e) {
        console.warn('Native TextDetector initialization warning:', e);
      }
    }
  }

  /**
   * Lazily loads ZXing Browser reader for barcode fallback
   */
  public async getZxingReader(): Promise<any> {
    if (this.zxingReader) return this.zxingReader;
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
      ]);
      this.zxingReader = new BrowserMultiFormatReader(hints);
      return this.zxingReader;
    } catch (e) {
      console.warn('Failed to load ZXing library:', e);
      return null;
    }
  }

  /**
   * Scans a video element for barcodes (via native BarcodeDetector or ZXing).
   */
  public async detectBarcodeFromVideo(video: HTMLVideoElement): Promise<{ rawCode: string; source: 'barcode_detector' | 'zxing' } | null> {
    if (!video || video.readyState < 2) return null;

    // 1. Try Native BarcodeDetector first (fastest hardware acceleration on Android)
    if (this.nativeBarcodeDetector) {
      try {
        const barcodes = await this.nativeBarcodeDetector.detect(video);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          return {
            rawCode: barcodes[0].rawValue.trim(),
            source: 'barcode_detector',
          };
        }
      } catch (e) {
        // Fallback to ZXing if native detection throws
      }
    }

    // 2. Fallback to ZXing Browser reader
    try {
      const reader = await this.getZxingReader();
      if (reader) {
        const result = reader.decode(video);
        if (result && result.getText()) {
          return {
            rawCode: result.getText().trim(),
            source: 'zxing',
          };
        }
      }
    } catch (e) {
      // Expected when no barcode is in frame
    }

    return null;
  }

  /**
   * Scans a video element for printed reference number text (via TextDetector).
   */
  public async detectReferenceTextFromVideo(
    video: HTMLVideoElement,
    catalog: CatalogItemLookups[]
  ): Promise<OpticalCandidateMatch | null> {
    if (!video || video.readyState < 2) return null;

    // Try Native TextDetector
    if (this.nativeTextDetector) {
      try {
        const texts = await this.nativeTextDetector.detect(video);
        if (texts && texts.length > 0) {
          const aggregatedText = texts.map((t: any) => t.rawValue).join(' ');
          const candidates = extractReferenceCandidates(aggregatedText);
          const match = matchCandidateToCatalog(candidates, catalog);
          if (match) return match;
        }
      } catch (e) {
        // Silent catch for live video feed
      }
    }

    return null;
  }
}

// Global Singleton Instance
export const opticalScannerCoordinator = new OpticalScannerCoordinator();
