// ============================================================
// POINTAGE — Mental Shortcuts Engine (Plages Numériques & Skip-Guide)
// Accelerates warehouse picking by mapping reference ranges & skipping absent series
// ============================================================

import type { OrderLine } from './types';

export interface ProductFamilyGroup {
  id: string;
  name: string;
  icon: string;
  lines: OrderLine[];
  lineCount: number;
  totalOrderedUnits: number;
  numericRanges: NumericRangeCluster[];
  seriesSummary: string;
}

export interface NumericRangeCluster {
  min: number;
  max: number;
  label: string; // ex: "620 - 629 (Série 62x)"
  count: number;
  lineIds: number[];
}

export interface ReferenceCheckResult {
  query: string;
  numericValue: number | null;
  found: boolean;
  matchedLine?: OrderLine;
  isSkipped: boolean;
  skipReason?: string;
  familyContext?: string;
  activeRangesInBill: string[];
}

const FAMILY_DEFINITIONS: { id: string; name: string; icon: string; keywords: string[] }[] = [
  {
    id: 'trousses',
    name: 'Trousses & Plumiers',
    icon: 'pouch',
    keywords: ['trousse', 'plumier', 'fourre-tout', 'fourretout'],
  },
  {
    id: 'sacs',
    name: 'Sacs & Cartables',
    icon: 'backpack',
    keywords: ['sac', 'cartable', 'sac a dos', 'valise', 'besace', 'sacoche'],
  },
  {
    id: 'stylos',
    name: 'Stylos, Feutres & Écriture',
    icon: 'pen',
    keywords: ['stylo', 'feutre', 'marqueur', 'surligneur', 'roller', 'crayon', 'mine', 'bille', 'plume'],
  },
  {
    id: 'cahiers',
    name: 'Cahiers, Papier & Registres',
    icon: 'book',
    keywords: ['cahier', 'registre', 'bloc', 'papier', 'ramette', 'feuillet', 'dessin', 'chemise carton'],
  },
  {
    id: 'classeurs',
    name: 'Classeurs & Rangement',
    icon: 'folder',
    keywords: ['classeur', 'chemise', 'archive', 'pochette', 'lutin', 'separateur', 'porte document'],
  },
  {
    id: 'gommes',
    name: 'Gommes, Tailles & Correction',
    icon: 'eraser',
    keywords: ['gomme', 'taille crayon', 'taille', 'correcteur', 'blanco', 'effaceur', 'ruban corr'],
  },
  {
    id: 'colles',
    name: 'Colles & Adhésifs',
    icon: 'glue',
    keywords: ['colle', 'scotch', 'adhesif', 'ruban adhesif', 'stick'],
  },
  {
    id: 'regles',
    name: 'Règles & Géométrie',
    icon: 'ruler',
    keywords: ['regle', 'equerre', 'rapporteur', 'compas', 'trace lettre', 'decimetre', 'double decimetre'],
  },
  {
    id: 'calculatrices',
    name: 'Calculatrices',
    icon: 'calculator',
    keywords: ['calculatrice', 'scientifique', 'scolaire', 'bureau'],
  },
  {
    id: 'peinture',
    name: 'Peinture, Arts & Couleurs',
    icon: 'palette',
    keywords: ['peinture', 'gouache', 'aquarelle', 'pinceau', 'palette', 'pate a modeler', 'acrylique', 'coloriage'],
  },
];

/**
 * Normalizes text for family and reference matching
 */
export function normalizeTextForSearch(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
}

/**
 * Detects the product family based on designation keywords
 */
export function detectProductFamily(designation: string): { id: string; name: string; icon: string } {
  const norm = normalizeTextForSearch(designation);
  for (const fam of FAMILY_DEFINITIONS) {
    for (const kw of fam.keywords) {
      if (norm.includes(kw)) {
        return { id: fam.id, name: fam.name, icon: fam.icon };
      }
    }
  }
  return { id: 'divers', name: 'Autres Articles', icon: 'package' };
}

/**
 * Extracts pure numeric value from a reference code (e.g., "71662" -> 71662, "REF-622" -> 622)
 */
export function extractNumericReference(ref: string | null | undefined): number | null {
  if (!ref) return null;
  const digitsMatch = ref.match(/\d+/g);
  if (!digitsMatch || digitsMatch.length === 0) return null;
  // Use the longest digit block or the primary block
  const longest = digitsMatch.reduce((a, b) => (b.length > a.length ? b : a), '');
  const parsed = parseInt(longest, 10);
  return isNaN(parsed) ? null : parsed;
}

export interface ReferenceCheckResult {
  query: string;
  numericValue: number | null;
  found: boolean;
  matchedLine?: OrderLine;
  isSkipped: boolean;
  skipReason?: string;
  familyContext?: string;
  activeRangesInBill: string[];
  matchType: 'exact_present' | 'absent_skip_advice' | 'not_numeric';
  shouldSkip: boolean;
  message: string;
}

/**
 * Clusters numeric references into intuitive human mental shortcuts (e.g. "Série 600", "Série 650", "Série 730").
 * Only produces a shortcut when multiple items (>= 2) share a recognizable decade or hundred.
 * Never produces arbitrary arithmetic ranges (e.g. "71636 - 71651") or 1-item fake series.
 * Returns an empty array if there is no clear, natural mental shortcut.
 */
export function clusterNumericReferences(
  rawItems: ({ num: number; lineId?: number } | number)[]
): NumericRangeCluster[] {
  if (rawItems.length === 0) return [];

  const items = rawItems
    .map((item) =>
      typeof item === 'number'
        ? { num: item, lineId: item }
        : { num: item.num, lineId: item.lineId ?? item.num }
    )
    .filter((item) => Number.isFinite(item.num) && item.num >= 0);

  // A single item is never a series or a shortcut.
  if (items.length < 2) {
    return [];
  }

  // 1. Group items by exact decade: Math.floor(num / 10) * 10
  // e.g. 731, 734 -> 730; 653, 658 -> 650; 552 -> 550
  const decadeMap = new Map<number, { min: number; max: number; lineIds: number[] }>();
  for (const item of items) {
    const dec = Math.floor(item.num / 10) * 10;
    if (!decadeMap.has(dec)) {
      decadeMap.set(dec, { min: item.num, max: item.num, lineIds: [] });
    }
    const d = decadeMap.get(dec)!;
    d.min = Math.min(d.min, item.num);
    d.max = Math.max(d.max, item.num);
    d.lineIds.push(item.lineId);
  }

  // If ALL items belong to the same exact decade (e.g. all in 730's, all in 650's)
  if (decadeMap.size === 1) {
    const dec = Array.from(decadeMap.keys())[0];
    const d = decadeMap.get(dec)!;
    return [
      {
        min: d.min,
        max: d.max,
        label: `Série ${dec}`,
        count: d.lineIds.length,
        lineIds: d.lineIds,
      },
    ];
  }

  // 2. Group items by exact hundred: Math.floor(num / 100) * 100
  // e.g. 612, 650 -> 600; 71600, 71636, 71651 -> 71600
  const hundredMap = new Map<number, { min: number; max: number; lineIds: number[] }>();
  for (const item of items) {
    const hund = Math.floor(item.num / 100) * 100;
    if (!hundredMap.has(hund)) {
      hundredMap.set(hund, { min: item.num, max: item.num, lineIds: [] });
    }
    const h = hundredMap.get(hund)!;
    h.min = Math.min(h.min, item.num);
    h.max = Math.max(h.max, item.num);
    h.lineIds.push(item.lineId);
  }

  // If ALL items belong to the same hundred (e.g. "all in 600", "all in 500", "all in 71600")
  if (hundredMap.size === 1) {
    const hund = Array.from(hundredMap.keys())[0];
    const h = hundredMap.get(hund)!;

    // If within this hundred, items cleanly separate into multiple distinct decades with >= 2 items each
    // (e.g. 3 items in 620 and 2 items in 650):
    const strongDecades = Array.from(decadeMap.entries()).filter(([_, d]) => d.lineIds.length >= 2);
    const totalInStrongDecades = strongDecades.reduce((sum, [_, d]) => sum + d.lineIds.length, 0);

    // Only split into sub-decades if strong decades account for ALL items
    if (strongDecades.length >= 2 && totalInStrongDecades === items.length) {
      return strongDecades
        .sort((a, b) => a[0] - b[0])
        .map(([dec, d]) => ({
          min: d.min,
          max: d.max,
          label: `Série ${dec}`,
          count: d.lineIds.length,
          lineIds: d.lineIds,
        }));
    }

    // Otherwise, the entire family forms one clear hundred series (e.g. "Série 71600", "Série 600", "Série 500")
    return [
      {
        min: h.min,
        max: h.max,
        label: `Série ${hund}`,
        count: h.lineIds.length,
        lineIds: h.lineIds,
      },
    ];
  }

  // 3. If items span multiple hundreds, only keep strong clusters with >= 2 items
  const clusters: NumericRangeCluster[] = [];
  const usedLineIds = new Set<number>();

  // Check strong decades (>= 2 items, e.g. Série 650, Série 730)
  const sortedDecades = Array.from(decadeMap.entries()).sort((a, b) => a[0] - b[0]);
  for (const [dec, d] of sortedDecades) {
    if (d.lineIds.length >= 2) {
      clusters.push({
        min: d.min,
        max: d.max,
        label: `Série ${dec}`,
        count: d.lineIds.length,
        lineIds: d.lineIds,
      });
      d.lineIds.forEach((id) => usedLineIds.add(id));
    }
  }

  // For items not in a strong decade, check if they form a strong hundred (>= 2 items)
  const remainingItems = items.filter((i) => !usedLineIds.has(i.lineId));
  if (remainingItems.length >= 2) {
    const remHundredMap = new Map<number, { min: number; max: number; lineIds: number[] }>();
    for (const item of remainingItems) {
      const hund = Math.floor(item.num / 100) * 100;
      if (!remHundredMap.has(hund)) {
        remHundredMap.set(hund, { min: item.num, max: item.num, lineIds: [] });
      }
      const h = remHundredMap.get(hund)!;
      h.min = Math.min(h.min, item.num);
      h.max = Math.max(h.max, item.num);
      h.lineIds.push(item.lineId);
    }

    for (const [hund, h] of remHundredMap.entries()) {
      if (h.lineIds.length >= 2) {
        clusters.push({
          min: h.min,
          max: h.max,
          label: `Série ${hund}`,
          count: h.lineIds.length,
          lineIds: h.lineIds,
        });
      }
    }
  }

  clusters.sort((a, b) => a.min - b.min);

  // If items are completely scattered without >= 2 items in any series, return []
  // (No illogical or single-item ranges shown)
  return clusters;
}

/**
 * Analyzes all lines in a bill to construct mental shortcuts, family groupings,
 * and active reference ranges.
 */
export function analyzeBillRangeStructure(lines: OrderLine[]): {
  families: ProductFamilyGroup[];
  allClusters: NumericRangeCluster[];
  summaryMessage: string;
} {
  const familyMap = new Map<string, { info: { id: string; name: string; icon: string }; lines: OrderLine[] }>();

  for (const line of lines) {
    const fam = detectProductFamily(line.designation || '');
    if (!familyMap.has(fam.id)) {
      familyMap.set(fam.id, { info: fam, lines: [] });
    }
    familyMap.get(fam.id)!.lines.push(line);
  }

  const allItemsWithNums: { num: number; lineId: number }[] = [];

  const families: ProductFamilyGroup[] = Array.from(familyMap.values()).map(({ info, lines: famLines }) => {
    const famItems: { num: number; lineId: number }[] = [];
    let totalUnits = 0;

    for (const l of famLines) {
      totalUnits += l.orderedQty || 0;
      const num = extractNumericReference(l.reference);
      if (num !== null && l.id) {
        famItems.push({ num, lineId: l.id });
        allItemsWithNums.push({ num, lineId: l.id });
      }
    }

    const clusters = clusterNumericReferences(famItems);
    const seriesSummary = clusters.length > 0 ? clusters.map((c) => c.label).join(' • ') : 'Réf diverses';

    return {
      id: info.id,
      name: info.name,
      icon: info.icon,
      lines: famLines,
      lineCount: famLines.length,
      totalOrderedUnits: totalUnits,
      numericRanges: clusters,
      seriesSummary,
    };
  });

  // Sort families by line count descending
  families.sort((a, b) => b.lineCount - a.lineCount);

  const allClusters = clusterNumericReferences(allItemsWithNums);

  const summaryMessage =
    families.length > 0
      ? `${families.length} familles d'articles identifiées dans la commande.`
      : 'Aucun article répertorié.';

  return {
    families,
    allClusters,
    summaryMessage,
  };
}

/**
 * Checks a queried reference number against the bill.
 * If absent, gives the worker the exact "Skip" feedback so they don't waste time looking!
 */
export function checkReferenceInBill(
  query: string,
  lines: OrderLine[],
  structure?: ReturnType<typeof analyzeBillRangeStructure>
): ReferenceCheckResult {
  const trimmed = query.trim();
  const num = extractNumericReference(trimmed);

  const struct = structure || analyzeBillRangeStructure(lines);
  const activeRangeLabels = struct.allClusters.map((c) => c.label);

  if (!num) {
    return {
      query: trimmed,
      numericValue: null,
      found: false,
      isSkipped: false,
      activeRangesInBill: activeRangeLabels,
      matchType: 'not_numeric',
      shouldSkip: false,
      message: '',
    };
  }

  // Exact reference match check
  const exact = lines.find((l) => {
    const lNum = extractNumericReference(l.reference);
    return lNum === num || (l.reference && l.reference.trim() === trimmed);
  });

  if (exact) {
    return {
      query: trimmed,
      numericValue: num,
      found: true,
      matchedLine: exact,
      isSkipped: false,
      activeRangesInBill: activeRangeLabels,
      matchType: 'exact_present',
      shouldSkip: false,
      message: `Article trouvé : N°${exact.no} (${exact.designation})`,
    };
  }

  // Reference is absent! Generate the Skip-Guide intelligence
  const decadeStart = Math.floor(num / 10) * 10;
  const decadeEnd = decadeStart + 9;
  const hasDecadeCluster = struct.allClusters.some(
    (c) => Math.floor(c.min / 10) === Math.floor(num / 10) || Math.floor(c.max / 10) === Math.floor(num / 10)
  );

  const skipReason = hasDecadeCluster
    ? `Réf ${num} : Série ${decadeStart} présente mais Réf ${num} est absent de cette commande (Zapper)`
    : `Réf ${num} : AUCUN article dans cette commande ! (Zapper directement)`;

  let familyContext = '';
  const trousseFam = struct.families.find((f) => f.id === 'trousses');
  if (trousseFam && trousseFam.numericRanges.length > 0) {
    familyContext = `Pour les Trousses, seules les séries : ${trousseFam.numericRanges.map((r) => r.label).join(', ')} sont commandées.`;
  }

  return {
    query: trimmed,
    numericValue: num,
    found: false,
    isSkipped: true,
    skipReason,
    familyContext,
    activeRangesInBill: activeRangeLabels,
    matchType: 'absent_skip_advice',
    shouldSkip: true,
    message: skipReason,
  };
}
