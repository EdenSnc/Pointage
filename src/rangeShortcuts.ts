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
    icon: '👝',
    keywords: ['trousse', 'plumier', 'fourre-tout', 'fourretout'],
  },
  {
    id: 'sacs',
    name: 'Sacs & Cartables',
    icon: '🎒',
    keywords: ['sac', 'cartable', 'sac a dos', 'valise', 'besace', 'sacoche'],
  },
  {
    id: 'stylos',
    name: 'Stylos, Feutres & Écriture',
    icon: '🖊️',
    keywords: ['stylo', 'feutre', 'marqueur', 'surligneur', 'roller', 'crayon', 'mine', 'bille', 'plume'],
  },
  {
    id: 'cahiers',
    name: 'Cahiers, Papier & Registres',
    icon: '📒',
    keywords: ['cahier', 'registre', 'bloc', 'papier', 'ramette', 'feuillet', 'dessin', 'chemise carton'],
  },
  {
    id: 'classeurs',
    name: 'Classeurs & Rangement',
    icon: '📁',
    keywords: ['classeur', 'chemise', 'archive', 'pochette', 'lutin', 'separateur', 'porte document'],
  },
  {
    id: 'gommes',
    name: 'Gommes, Tailles & Correction',
    icon: '✏️',
    keywords: ['gomme', 'taille crayon', 'taille', 'correcteur', 'blanco', 'effaceur', 'ruban corr'],
  },
  {
    id: 'colles',
    name: 'Colles & Adhésifs',
    icon: '🧪',
    keywords: ['colle', 'scotch', 'adhesif', 'ruban adhesif', 'stick'],
  },
  {
    id: 'regles',
    name: 'Règles & Géométrie',
    icon: '📐',
    keywords: ['regle', 'equerre', 'rapporteur', 'compas', 'trace lettre', 'decimetre', 'double decimetre'],
  },
  {
    id: 'calculatrices',
    name: 'Calculatrices',
    icon: '🧮',
    keywords: ['calculatrice', 'scientifique', 'scolaire', 'bureau'],
  },
  {
    id: 'peinture',
    name: 'Peinture, Arts & Couleurs',
    icon: '🎨',
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
  return { id: 'divers', name: 'Autres Articles', icon: '📦' };
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
 * Clusters a list of numeric references into ranges (e.g. 620-629, 650-659, 680-699)
 */
export function clusterNumericReferences(
  rawItems: ({ num: number; lineId?: number } | number)[]
): NumericRangeCluster[] {
  if (rawItems.length === 0) return [];

  const items = rawItems.map((item) =>
    typeof item === 'number' ? { num: item, lineId: item } : { num: item.num, lineId: item.lineId ?? item.num }
  );

  const sorted = [...items].sort((a, b) => a.num - b.num);
  const clusters: NumericRangeCluster[] = [];

  let currentCluster: { min: number; max: number; lineIds: number[] } | null = null;

  for (const item of sorted) {
    if (!currentCluster) {
      currentCluster = { min: item.num, max: item.num, lineIds: [item.lineId] };
      continue;
    }

    // If both belong to the exact same decade (e.g. 620-629)
    const isSameDecade = Math.floor(item.num / 10) === Math.floor(currentCluster.max / 10);
    const isClose = item.num - currentCluster.max <= (item.num >= 10000 ? 25 : 5);

    if (isSameDecade || isClose) {
      currentCluster.max = item.num;
      currentCluster.lineIds.push(item.lineId);
    } else {
      // Finalize previous cluster
      clusters.push(formatCluster(currentCluster));
      currentCluster = { min: item.num, max: item.num, lineIds: [item.lineId] };
    }
  }

  if (currentCluster) {
    clusters.push(formatCluster(currentCluster));
  }

  return clusters;
}

function formatCluster(c: { min: number; max: number; lineIds: number[] }): NumericRangeCluster {
  const decadeStart = Math.floor(c.min / 10) * 10;
  const decadeEnd = decadeStart + 9;
  const isSameDecade = Math.floor(c.min / 10) === Math.floor(c.max / 10);

  let label = '';
  if (isSameDecade && decadeStart >= 10) {
    label = `Série ${decadeStart}-${decadeEnd}`;
  } else if (c.min === c.max) {
    label = `Réf ${c.min}`;
  } else {
    label = `${c.min} - ${c.max}`;
  }

  return {
    min: c.min,
    max: c.max,
    label,
    count: c.lineIds.length,
    lineIds: c.lineIds,
  };
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
    ? `⛔ Réf ${num} : Série ${decadeStart}-${decadeEnd} présente mais Réf ${num} est absent de cette commande ! (Zapper)`
    : `⛔ Réf ${num} : AUCUN article dans cette commande ! (Zapper directement)`;

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
