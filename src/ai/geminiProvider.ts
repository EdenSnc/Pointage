import type { LLMProvider, ExtractionResult } from './types';
import type { ImportPayload } from '../types';
import { optimizeDocumentImage } from './imageOptimizer';
import { recordApiUsage } from './quotaTracker';

const GEMINI_SYSTEM_INSTRUCTION = `Tu es un assistant expert en extraction optique de documents logistiques d'entrepôt : Factures (Invoices), Bons de Livraison (BL), Bons de Commande (BC) et notes manuscrites d'atelier.
Analyse l'image ou le texte et extrais toutes les données sous forme de JSON strict.

TYPOLOGIE DES DOCUMENTS:
- "invoice": Facture commerciale (ex: "Invoice SAJ/2026/5435") avec colonnes CODE, PU HT, TVA 19%, Remises et total TTC.
- "bl_official": Bon de Livraison officiel avec en-tête complet (ex: "SARL S.B.M IMP/EXP"), colonnes Référence, EAN 13 chiffres et lien BC.
- "bl_workshop": Bon de Livraison de préparation d'atelier (ex: "BL/OU126/03608") avec colonnes Référence, LOT, Packages et annotations au stylo.
- "bon_commande": Bon de Commande client (ex: "BC:03885").

RÈGLES CRITIQUES D'EXTRACTION:
1. "billNumber": le numéro du document (ex: "Invoice SAJ/2026/5435", "BL/OU126/03615", "BL/OU126/03608", "BC/0U126/03835"). Si absent, utilise "NOTE-MANUSCRITE".
2. "bcNumber": si un numéro de Bon de Commande est mentionné (ex: "BLEU BLANC NAKHIL N° BC:03885" -> "03885"), extrais-le.
3. "documentType": "invoice" | "bl_official" | "bl_workshop" | "bon_commande".
4. "client": nom du client (ex: "BLEU BLANC NAKHIL").
5. "date": date au format YYYY-MM-DD (ex: "2026-09-06").
6. "lines": liste ordonnée de tous les articles :
   - "no": numéro de ligne séquentiel ("1", "2", "3"...).
   - "page": numéro de page (défaut 1).
   - "reference": LA RÉFÉRENCE OU LE CODE ARTICLE (ex: "71662", "29129", "70380/84"). Dans les factures, la colonne s'intitule "CODE".
   - "ean": code-barres à 13 chiffres si présent dans la colonne "EAN" (ex: "6941782115831"), sinon null.
   - "designation": nom complet de l'article (ex: "SAC A DOS MOYEN 22 L 4 MO 71662").
   - "quantity": quantité numérique entière. ATTENTION : si le document comporte des annotations manuscrites d'atelier au stylo (ex: "-1" ou "-2" en marge, ou un nombre biffé), déduis la quantité corrigée finale réelle.
   - "unitPrice": prix unitaire HT numérique (colonne "PU", ex: 3332.50). Si absent, null.
   - "packagesRaw": colisage ou conditionnement (colonne "Packages", "Colisage" ou "Qté/Carton", ex: "0,04", "50,00", "1CT/50").
   - "discountPercent": remise ligne en % (colonne "Rem(%)" ou "Rem. Paiement(%)", ex: 15.0), sinon null.
7. TOTAUX & CADRE FINANCIER (si présents sur facture) :
   - "totalHt": total HT brut (ex: 32209.00).
   - "totalHtNet": total HT net après remise (ex: 30718.67).
   - "totalRemise": montant total de la remise (ex: 1490.33).
   - "totalTva": montant de la TVA (ex: 5836.55).
   - "totalTtc": total TTC (ex: 36555.22).
   - "totalRemPaiement": montant de l'escompte/remise paiement (ex: 1044.17).
   - "totalAvecRemise": montant net final à payer (ex: 35511.05).
   - "paymentMode": condition ou mode de règlement (ex: "GMS2026+++ GMS", "CLIENT 6%").
   - "agentName": agent émetteur (ex: "ShowOr", "ZDjaber").
   - "clientAddress", "nif", "nis", "rc", "ai": coordonnées fiscales imprimées du client.

FORMAT JSON REQUIS:
{
  "bills": [
    {
      "billNumber": "Invoice SAJ/2026/5435",
      "bcNumber": "03885",
      "documentType": "invoice",
      "client": "BLEU BLANC NAKHIL",
      "date": "2026-09-06",
      "agentName": "ShowOr",
      "paymentMode": "GMS2026+++ GMS",
      "clientAddress": "95 ET 96 LOTS ZONE D'ACTIVITE - BIR EL DJIR - ORAN",
      "nif": "002131112400617",
      "rc": "21B 2124006-00/31",
      "totalHt": 32209.00,
      "totalHtNet": 30718.67,
      "totalRemise": 1490.33,
      "totalTva": 5836.55,
      "totalTtc": 36555.22,
      "totalAvecRemise": 35511.05,
      "lines": [
        {
          "no": "1",
          "page": 1,
          "reference": "71662",
          "ean": "6941782115565",
          "designation": "SAC A DOS MOYEN 22 L 4 MO 71662",
          "quantity": 3,
          "unitPrice": 3332.50,
          "packagesRaw": "50,00"
        }
      ]
    }
  ]
}`;

async function prepareImagePayload(file: File | Blob): Promise<{ base64: string; mimeType: string }> {
  // Use high-res document optimizer if in browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const optimized = await optimizeDocumentImage(file, 2560, 0.92);
      return { base64: optimized.base64, mimeType: optimized.mimeType };
    } catch {
      // Fallback to direct FileReader if canvas not supported
    }
  }

  // Modern cross-platform ArrayBuffer / Buffer fallback (works seamlessly in Browser & Node)
  if (typeof (file as any).arrayBuffer === 'function') {
    const arrayBuf = await (file as any).arrayBuffer();
    const globalBuffer = (globalThis as any).Buffer;
    const base64 = typeof globalBuffer !== 'undefined'
      ? globalBuffer.from(arrayBuf).toString('base64')
      : btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
    return { base64, mimeType: file.type || 'image/jpeg' };
  }


  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        if (base64) resolve({ base64, mimeType: file.type || 'image/jpeg' });
        else reject(new Error('Échec de la lecture de l’image'));
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  throw new Error('Environnement non supporté pour la lecture d’image');
}

function sanitizeAndParseJSON(text: string): ImportPayload {
  let cleaned = text.trim();
  // Strip potential markdown code fences if model enclosed them
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  // Normalize if model returned an array of bills directly
  if (Array.isArray(parsed)) {
    return { bills: parsed };
  }
  // Normalize if model returned a single bill directly
  if (parsed && !parsed.bills && (parsed.lines || parsed.billNumber)) {
    return { bills: [parsed] };
  }
  if (parsed && Array.isArray(parsed.bills)) {
    return parsed;
  }

  throw new Error('Le format retourné par Gemini ne contient pas de factures valides.');
}

async function callGeminiApiWithRetry(
  url: string,
  requestBody: any,
  modelId: string,
  maxRetries = 2
): Promise<any> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch (networkErr: any) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Connexion Internet interrompue : La numérisation photo requiert du réseau. L\'import Excel et le pointage restent 100% opérationnels hors-ligne.');
      }
      throw new Error(`Réseau faible ou indisponible : Impossible de joindre les serveurs Gemini (${networkErr?.message || 'échec connexion'}). Réessayez dans une zone couverte ou utilisez l'import de fichier Excel.`);
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const errMsg = errJson?.error?.message || response.statusText;

      // Retry on transient 429 or 503 if attempts remain
      if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
        attempt++;
        const jitter = Math.random() * 400;
        const delay = attempt * 1200 + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (response.status === 429) {
        if (modelId === 'gemini-3.8-flash') {
          throw new Error('Pic de charge temporaire ou quota atteint pour Gemini 3.8 Flash (max 20 scans/j). Basculez sur Flash Lite 3.5 (500 scans/j) pour continuer sans attente.');
        } else {
          throw new Error('Trop de requêtes rapides (limite 15 scans/min). Veuillez patienter 10 secondes puis réessayez.');
        }
      }
      if (response.status === 503) {
        throw new Error('Les serveurs de Gemini sont temporairement surchargés (pic de demande mondial). Veuillez patienter quelques secondes ou utiliser Flash Lite 3.5.');
      }
      throw new Error(`Erreur API Gemini (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    return data;
  }
}

export const geminiProvider: LLMProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  models: [
    { id: 'gemini-3.5-flash-lite', label: 'Flash Lite (Recommandé • 500 scans/j)', recommended: true },
    { id: 'gemini-3.8-flash', label: 'Flash (Complet • 20 scans/j)' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Standard)' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (Secours)' },
  ],

  async extractFromImage(
    imageInput: File | Blob | (File | Blob)[],
    apiKey: string,
    modelId: string = 'gemini-3.5-flash-lite'
  ): Promise<ExtractionResult> {
    if (!apiKey.trim()) {
      throw new Error('Veuillez renseigner votre clé API Google Gemini.');
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Connexion Internet indisponible en entrepôt : La numérisation photo IA requiert du réseau. Utilisez l\'import de fichier Excel (.xlsx / .csv) ou le scan code-barres qui fonctionnent 100% hors-ligne.');
    }

    const files = Array.isArray(imageInput) ? imageInput : [imageInput];
    if (files.length === 0) {
      throw new Error('Aucune image fournie pour l’extraction.');
    }

    const imagePayloads = await Promise.all(files.map((f) => prepareImagePayload(f)));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey.trim()}`;

    const requestBody = {
      systemInstruction: {
        parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                files.length > 1
                  ? `Extraire toutes les lignes de ces ${files.length} pages de bons de livraison au format JSON spécifié. Assigner le numéro de page exact (1, 2, 3...) à chaque ligne et regrouper par facture.`
                  : 'Extraire les lignes de ce bon de livraison au format JSON spécifié.',
            },
            ...imagePayloads.map((img) => ({
              inlineData: {
                mimeType: img.mimeType,
                data: img.base64,
              },
            })),
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        ...(modelId.startsWith('gemini-3.8') || modelId.startsWith('gemini-3.7')
          ? { thinkingConfig: { thinkingLevel: 'low' } }
          : {}),
      },
    };

    const data = await callGeminiApiWithRetry(url, requestBody, modelId);
    const candidate = data.candidates?.[0];

    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('Le document est trop volumineux et a dépassé le plafond de tokens de sortie de l’IA. Veuillez photographier le bon page par page.');
    }

    const candidateText = candidate?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('Gemini n’a pas pu extraire de contenu de cette image.');
    }

    const payload = sanitizeAndParseJSON(candidateText);
    recordApiUsage(modelId);

    return {
      payload,
      rawText: candidateText,
      providerId: 'gemini',
      modelUsed: modelId,
    };

  },

  async extractFromText(
    text: string,
    apiKey: string,
    modelId: string = 'gemini-3.5-flash-lite'
  ): Promise<ExtractionResult> {
    if (!apiKey.trim()) {
      throw new Error('Veuillez renseigner votre clé API Google Gemini.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey.trim()}`;

    const requestBody = {
      systemInstruction: {
        parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Extraire les lignes de ce bon de livraison au format JSON spécifié:\n\n${text}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        ...(modelId.startsWith('gemini-3.8') || modelId.startsWith('gemini-3.7')
          ? { thinkingConfig: { thinkingLevel: 'low' } }
          : {}),
      },
    };

    const data = await callGeminiApiWithRetry(url, requestBody, modelId);
    const candidate = data.candidates?.[0];

    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('Le document est trop volumineux et a dépassé le plafond de tokens de sortie de l’IA.');
    }

    const candidateText = candidate?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('Gemini n’a pas pu extraire de données du texte fourni.');
    }

    const payload = sanitizeAndParseJSON(candidateText);
    recordApiUsage(modelId);

    return {
      payload,
      rawText: candidateText,
      providerId: 'gemini',
      modelUsed: modelId,
    };

  },
};

export interface ChecksumValidationResult {
  hasPrices: boolean;
  computedTotal: number;
  printedTotal: number | null;
  isValid: boolean;
  discrepancy: number;
  warning?: string;
}

/**
 * Mathematically validates the sum of all line items (qty * unitPrice) against
 * the total printed on the physical document (checksum guardrail).
 * This eliminates silent AI hallucinations and OCR misreadings.
 */
export function validateFinancialChecksum(
  lines: Array<{ quantity?: number; unitPrice?: number | null }>,
  printedTotal?: number | null,
  discountPercent?: number | null
): ChecksumValidationResult {
  let hasPrices = false;
  let computedTotal = 0;

  for (const line of lines) {
    if (typeof line.unitPrice === 'number' && !isNaN(line.unitPrice) && line.unitPrice > 0) {
      hasPrices = true;
      const qty = typeof line.quantity === 'number' && !isNaN(line.quantity) ? line.quantity : 1;
      // Strict 2-decimal rounded multiplication
      const lineTotal = Math.round((qty * line.unitPrice + Number.EPSILON) * 100) / 100;
      computedTotal = Math.round((computedTotal + lineTotal + Number.EPSILON) * 100) / 100;
    }
  }

  if (!hasPrices || printedTotal == null || printedTotal <= 0) {
    return {
      hasPrices,
      computedTotal,
      printedTotal: printedTotal ?? null,
      isValid: true,
      discrepancy: 0,
    };
  }

  let discrepancy = Math.round((computedTotal - printedTotal + Number.EPSILON) * 100) / 100;
  // Allow at most 0.10 DA due to rounding of decimals on line totals
  let isValid = Math.abs(discrepancy) <= 0.10;

  // If direct sum has discrepancy but a discount was reported on the invoice, check discounted total
  if (!isValid && typeof discountPercent === 'number' && discountPercent > 0 && discountPercent < 100) {
    const discountedComputed = Math.round((computedTotal * (1 - discountPercent / 100) + Number.EPSILON) * 100) / 100;
    const discountDisc = Math.round((discountedComputed - printedTotal + Number.EPSILON) * 100) / 100;
    if (Math.abs(discountDisc) <= 0.10) {
      isValid = true;
      discrepancy = discountDisc;
    }
  }

  return {
    hasPrices,
    computedTotal,
    printedTotal,
    isValid,
    discrepancy,
    warning: isValid
      ? undefined
      : `Écart de calcul détecté : Total des lignes (${computedTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA) ≠ Total imprimé (${printedTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA). Vérifiez les prix unitaires.`,
  };
}

