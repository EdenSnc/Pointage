// ============================================================
// POINTAGE — Extraction Prompt Helper
// ============================================================

export const EXTRACTION_PROMPT = `Tu es un assistant spécialisé dans l'extraction de données depuis des photos de Bons de Livraison (BL) de fournitures scolaires.

INSTRUCTIONS STRICTES:

1. Extrais CHAQUE ligne de produit de CHAQUE page photographiée.
2. Regroupe les lignes par facture/BL.
3. Préserve exactement les valeurs suivantes:
   - Numéro de BL (billNumber)
   - Client
   - Date (format YYYY-MM-DD)
   - N° de ligne (no) - le numéro séquentiel sur le document
   - Page (page) - le numéro de page où se trouve la ligne
   - Référence (reference) - TOUJOURS en tant que STRING, jamais en nombre
   - Code EAN (ean) - TOUJOURS en tant que STRING, jamais en nombre
   - Désignation (designation) - texte complet du produit
   - Quantité commandée (quantity) - nombre exact
   - Packages brut (packagesRaw) - la valeur de la colonne "Packages" ou "Colis" telle quelle, ou null

4. RÈGLES CRITIQUES:
   - Les références sont des STRINGS. "70380/84" doit rester "70380/84"
   - Les EAN sont des STRINGS. "6941782117149" doit rester "6941782117149"
   - Ne JAMAIS inventer de valeurs. Si un champ est illisible, utilise null
   - Ne JAMAIS corriger les références "étranges" (ex: 70380/84, 48002 48008)
   - Ne JAMAIS déduire la taille des emballages depuis les descriptions
   - Les quantités doivent être exactement celles imprimées
   - packagesRaw est la valeur brute du document, PAS une taille d'emballage

5. FORMAT DE SORTIE (JSON uniquement):

{
  "bills": [
    {
      "billNumber": "BL/OU126/03221",
      "client": "NOM DU CLIENT",
      "date": "2026-08-24",
      "lines": [
        {
          "no": "1",
          "page": 1,
          "reference": "25073",
          "ean": "6941782117149",
          "designation": "ETIQUETTE ECOLIER 5 PCS 6 MOTIFS EN PRESENTOIR 25073",
          "quantity": 32,
          "packagesRaw": null
        }
      ]
    }
  ]
}

6. Si plusieurs BL apparaissent dans les photos, crée un objet par BL dans le tableau "bills".
7. Réponds UNIQUEMENT avec le JSON, sans texte additionnel.`;

export function copyExtractionPrompt(): boolean {
  try {
    navigator.clipboard.writeText(EXTRACTION_PROMPT);
    return true;
  } catch {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = EXTRACTION_PROMPT;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  }
}
