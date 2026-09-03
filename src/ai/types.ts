// ============================================================
// POINTAGE — Modular LLM Extraction Layer Types
// ============================================================

import type { ImportPayload } from '../types';

export interface ExtractedBillLine {
  no: string;
  page?: number | null;
  reference?: string | null;
  ean?: string | null;
  designation: string;
  quantity: number;
  packagesRaw?: string | null;
  outerPackSize?: number | null;
  innerPackSize?: number | null;
}

export interface ExtractedBill {
  billNumber: string;
  client: string;
  date?: string | null;
  lines: ExtractedBillLine[];
}

export interface ExtractionResult {
  payload: ImportPayload;
  rawText?: string;
  providerId: string;
  modelUsed: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  models: { id: string; label: string; recommended?: boolean }[];
  extractFromImage(
    imageFile: File | Blob | (File | Blob)[],
    apiKey: string,
    modelId?: string
  ): Promise<ExtractionResult>;
  extractFromText(
    text: string,
    apiKey: string,
    modelId?: string
  ): Promise<ExtractionResult>;
}
