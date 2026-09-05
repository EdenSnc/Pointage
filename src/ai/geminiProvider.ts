import type { LLMProvider, ExtractionResult } from './types';
import type { ImportPayload } from '../types';
import { optimizeDocumentImage } from './imageOptimizer';
import { recordApiUsage } from './quotaTracker';

const GEMINI_SYSTEM_INSTRUCTION = `Tu es un assistant expert en extraction optique de Bons de Livraison (BL) d'entrepôt et de notes manuscrites.
Analyse l'image ou le texte et extrais toutes les lignes de produits sous forme de JSON strict.

RÈGLES CRITIQUES:
1. "billNumber": le numéro du BL (ex: "BL-2026-001", "BC/0U126/03835"). Si absent sur note informelle, utilise "NOTE-MANUSCRITE".
2. "client": le nom de l'enseigne ou destinataire. Si absent, utilise "NOTE INTERNE / DIVERS".
3. "lines": liste ordonnée de tous les articles avec:
   - "no": numéro de ligne séquentiel ("1", "2", "3"...). Si absent sur le papier, attribue-le automatiquement.
   - "page": numéro de page où figure la ligne (défaut 1).
   - "reference": LA RÉFÉRENCE EST L'IDENTIFIANT PRINCIPAL (ex: "70380/84", "CL-500", "99201"). Ne jamais tronquer ni omettre une référence.
   - "ean": code-barres 13 chiffres si présent, sinon null (le code-barres est secondaire).
   - "designation": nom ou description de l'article. Si non mentionné (ex: note manuscrite avec références seules), reprends la référence ou un libellé visible.
   - "quantity": quantité numérique (nombre entier positif). Si une référence est listée sans quantité explicite, utilise 1 par défaut.
   - "packagesRaw": colisage si présent (ex: "2CT/20"), sinon null.
4. BONS MANUSCRITS & NOTES BROUILLON:
   - Le document peut être une feuille manuscrite au stylo, un brouillon d'entrepôt ou une liste rapide de références.
   - Extraire chaque ligne même avec une écriture imparfaite.
5. BONS MULTI-PAGES:
   - Si les photos ou pages correspondent au MÊME bon de livraison (même numéro de BL, même client, ou pages 1, 2, 3...), regroupe OBLIGATOIREMENT toutes les lignes sous un SEUL objet BL dans "bills" avec le même "billNumber".
   - Assigne la propriété "page" (1, 2...) correspondante à chaque ligne.
   - Ne crée plusieurs objets dans "bills" QUE s'il s'agit réellement de factures ou de clients distincts.

FORMAT JSON REQUIS:
{
  "bills": [
    {
      "billNumber": "BL-EXEMPLE",
      "client": "NOM CLIENT",
      "date": "2026-09-03",
      "lines": [
        {
          "no": "1",
          "page": 1,
          "reference": "REF-100",
          "ean": "3760123456789",
          "designation": "STYLO BILLE BLEU",
          "quantity": 50,
          "packagesRaw": "1CT/50"
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
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const errMsg = errJson?.error?.message || response.statusText;
      if (response.status === 429) {
        if (modelId === 'gemini-3.8-flash') {
          throw new Error('Quota journalier atteint pour Gemini 3.8 Flash (max 20 scans/jour en gratuit). Basculez sur Flash Lite 3.5 (500 scans/jour) pour continuer.');
        } else {
          throw new Error('Trop de requêtes rapides (limite 15 scans/min). Veuillez patienter 10 secondes puis réessayez.');
        }
      }
      throw new Error(`Erreur API Gemini (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

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
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const errMsg = errJson?.error?.message || response.statusText;
      if (response.status === 429) {
        if (modelId === 'gemini-3.8-flash') {
          throw new Error('Quota journalier atteint pour Gemini 3.8 Flash (max 20 scans/jour en gratuit). Basculez sur Flash Lite 3.5 (500 scans/jour) pour continuer.');
        } else {
          throw new Error('Trop de requêtes rapides (limite 15 scans/min). Veuillez patienter 10 secondes puis réessayez.');
        }
      }
      throw new Error(`Erreur API Gemini (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

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
