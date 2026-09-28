// ============================================================
// POINTAGE — Agent à Tourner & Échantillonnage Arrivage
// Logistics & Allocation Engine: Showroom, El Feth & Chauffeurs
// Transportability Co-Decision (Chef Dépôt + Préparateurs)
// ============================================================

import {
  db,
  saveProductSample,
  saveProductSamplesBatch,
  getAllProductSamples,
  getProductSamplesByAgent,
  getProductSamplesByDestination,
  deleteProductSample,
} from './db';
import type {
  ProductSampleAllocation,
  TransportabilityGrade,
  SampleDestination,
  SampleStatus,
} from './types';
import { loadDriverRoster } from './driverLogistics';

export const DEFAULT_PREPARATEUR_WORKERS: string[] = [
  'Walid (Préparateur Principal)',
  'Karim (Préparateur Scolaire)',
  'Hichem (Préparateur Bureautique)',
  'Mohamed (Manutentionnaire)',
  'Yacine (Préparateur Quai)',
];

export const TRANSPORTABILITY_NOTE_PRESETS: string[] = [
  'Format trousse / stylo compact, rentre parfaitement dans la sacoche',
  'Pochette ou classeur léger, facile à présenter en boutique',
  'Calculatrice / compas sous blister rigide, idéal pour démo',
  'Poids modéré (< 1kg), transportable sans encombrement',
  'Volumineux (> 35cm) ou lourd (> 5kg), refusé pour chauffeurs',
  'Carton entier indivisible, réservé Showroom & El Feth',
];

const PREPARATEURS_KEY = 'pointage_preparateurs_roster';

export function loadPreparateursRoster(): string[] {
  try {
    const raw = localStorage.getItem(PREPARATEURS_KEY);
    if (!raw) return [...DEFAULT_PREPARATEUR_WORKERS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return Array.from(new Set([...DEFAULT_PREPARATEUR_WORKERS, ...parsed]));
    }
  } catch {}
  return [...DEFAULT_PREPARATEUR_WORKERS];
}

export function savePreparateurToRoster(workerName: string): string[] {
  const clean = workerName.trim();
  if (!clean) return loadPreparateursRoster();
  const current = loadPreparateursRoster();
  const next = Array.from(new Set([...current, clean]));
  try {
    localStorage.setItem(PREPARATEURS_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

/**
 * Heuristic auto-evaluation based on product designation and packaging.
 * Informs the Warehouse Manager & Worker before final approval.
 */
export function suggestTransportability(item: {
  designation: string;
  outerPackSize?: number | null;
  innerPackSize?: number | null;
  category?: string;
}): { grade: TransportabilityGrade; suggestedNote: string } {
  const text = (item.designation || '').toLowerCase();

  // Heavy / Bulky items that should not burden a commercial driver's briefcase
  const bulkyKeywords = [
    'ramette',
    'papier repro',
    'bobine',
    'carton 500',
    'rouleau kraft',
    'tableau blanc 120',
    'tableau blanc 90',
    'meuble',
    'classeur gros',
    'carton vrac',
  ];

  for (const kw of bulkyKeywords) {
    if (text.includes(kw)) {
      return {
        grade: 'bulky_refused',
        suggestedNote: 'Trop lourd ou volumineux pour sacoche de tournée (réservé Showroom & El Feth)',
      };
    }
  }

  // Easily transportable golden products (compact, high showcase value)
  const compactKeywords = [
    'stylo',
    'trousse',
    'feutre',
    'surligneur',
    'crayon',
    'compas',
    'calculatrice',
    'gomme',
    'taille',
    'colle',
    'correcteur',
    'marqueur',
    'pinceau',
    'ciseaux',
    'regle',
    'pastels',
    'peinture',
    'scotch',
    'porte-mine',
  ];

  for (const kw of compactKeywords) {
    if (text.includes(kw)) {
      return {
        grade: 'easily_transportable',
        suggestedNote: 'Article compact et léger, présentation idéale en librairie',
      };
    }
  }

  return {
    grade: 'pending_evaluation',
    suggestedNote: 'À évaluer sur quai avec le préparateur selon dimensions et poids réels',
  };
}

export interface CandidateItemForSampling {
  reference: string;
  ean?: string | null;
  designation: string;
  category?: 'scolaire' | 'bureautique' | 'autre';
  receptionSessionId?: number | null;
  transportability?: TransportabilityGrade;
  workerEvaluationNote?: string | null;
}

export interface ArrivalSamplePlanResult {
  allocationsToCreate: Array<Omit<ProductSampleAllocation, 'id' | 'allocatedAt' | 'updatedAt'>>;
  totalShowroom: number;
  totalElFeth: number;
  totalAgentTourner: number;
  excludedBulkyCount: number;
}

/**
 * Builds the exact sample plan based on the 3 fundamental destinations:
 * 1. Exactly 1 sample for the Showroom Interne (Vitrine Dépôt)
 * 2. Exactly 1 sample for Librairie El Feth (Prix & Référence Marché)
 * 3. Exactly 1 sample for each active Agent à Tourner (ONLY IF easily transportable)
 */
export function buildArrivalSamplePlan(params: {
  items: CandidateItemForSampling[];
  activeAgents: string[];
  managerName: string;
  consultedWorkerName: string;
  defaultWorkerNote?: string;
}): ArrivalSamplePlanResult {
  const { items, activeAgents, managerName, consultedWorkerName, defaultWorkerNote } = params;
  const allocationsToCreate: Array<Omit<ProductSampleAllocation, 'id' | 'allocatedAt' | 'updatedAt'>> = [];

  let totalShowroom = 0;
  let totalElFeth = 0;
  let totalAgentTourner = 0;
  let excludedBulkyCount = 0;

  for (const item of items) {
    const transport = item.transportability || 'easily_transportable';
    const workerNote = item.workerEvaluationNote || defaultWorkerNote || 'Conforme pour sacoche de tournée';

    // 1. Showroom Interne (Always 1 sample)
    allocationsToCreate.push({
      reference: item.reference,
      ean: item.ean || null,
      designation: item.designation,
      category: item.category || 'scolaire',
      receptionSessionId: item.receptionSessionId || null,
      destination: 'showroom',
      assignedAgentName: 'Showroom Dépôt',
      quantity: 1,
      transportability: transport,
      managerApproved: true,
      managerName,
      consultedWorkerName,
      workerEvaluationNote: workerNote,
      status: 'allocated',
      elFethWholesalePrice: null,
      elFethRetailPrice: null,
      elFethMarketNote: null,
      elFethReviewedBy: null,
      elFethReviewedAt: null,
      agentVendorFeedback: null,
    });
    totalShowroom++;

    // 2. Librairie El Feth (Always 1 sample for price decision)
    allocationsToCreate.push({
      reference: item.reference,
      ean: item.ean || null,
      designation: item.designation,
      category: item.category || 'scolaire',
      receptionSessionId: item.receptionSessionId || null,
      destination: 'el_feth',
      assignedAgentName: 'Librairie El Feth',
      quantity: 1,
      transportability: transport,
      managerApproved: true,
      managerName,
      consultedWorkerName,
      workerEvaluationNote: workerNote,
      status: 'allocated',
      elFethWholesalePrice: null,
      elFethRetailPrice: null,
      elFethMarketNote: null,
      elFethReviewedBy: null,
      elFethReviewedAt: null,
      agentVendorFeedback: null,
    });
    totalElFeth++;

    // 3. Agents à Tourner (1 sample PER active agent, STRICTLY IF easily transportable)
    if (transport === 'easily_transportable') {
      for (const agent of activeAgents) {
        allocationsToCreate.push({
          reference: item.reference,
          ean: item.ean || null,
          designation: item.designation,
          category: item.category || 'scolaire',
          receptionSessionId: item.receptionSessionId || null,
          destination: 'agent_tourner',
          assignedAgentName: agent,
          quantity: 1,
          transportability: 'easily_transportable',
          managerApproved: true,
          managerName,
          consultedWorkerName,
          workerEvaluationNote: workerNote,
          status: 'allocated',
          elFethWholesalePrice: null,
          elFethRetailPrice: null,
          elFethMarketNote: null,
          elFethReviewedBy: null,
          elFethReviewedAt: null,
          agentVendorFeedback: null,
        });
        totalAgentTourner++;
      }
    } else {
      excludedBulkyCount++;
    }
  }

  return {
    allocationsToCreate,
    totalShowroom,
    totalElFeth,
    totalAgentTourner,
    excludedBulkyCount,
  };
}

/**
 * Commits the generated sample plan into Dexie DB.
 */
export async function commitArrivalSamplePlan(
  plan: ArrivalSamplePlanResult
): Promise<number[]> {
  return saveProductSamplesBatch(plan.allocationsToCreate);
}

/**
 * Formats a clean, text-based commercial touring manifest for a driver.
 * Designed for immediate sharing via WhatsApp or thermal receipt print.
 * ZERO EMOJIS compliant.
 */
export function formatAgentTourneeManifest(
  agentName: string,
  samples: ProductSampleAllocation[]
): string {
  const activeSamples = samples.filter(
    (s) => s.assignedAgentName === agentName && s.destination === 'agent_tourner'
  );

  const dateStr = new Date().toLocaleDateString('fr-DZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const lines: string[] = [
    '========================================',
    `FEUILLE DE TOURNEE - AGENT COMMERCIAL`,
    `CHAUFFEUR : ${agentName.toUpperCase()}`,
    `DATE : ${dateStr}`,
    `TOTAL ECHANTILLONS EN SAC : ${activeSamples.length}`,
    '========================================',
    '',
    'ARTICLES EN DEMONSTRATION :',
  ];

  if (activeSamples.length === 0) {
    lines.push('Aucun echantillon actif dans la sacoche pour le moment.');
  } else {
    activeSamples.forEach((s, idx) => {
      lines.push(`${idx + 1}. [REF: ${s.reference}] ${s.designation}`);
      if (s.elFethRetailPrice) {
        lines.push(`   Prix Conseille El Feth : ${s.elFethRetailPrice} DA`);
      }
      if (s.workerEvaluationNote) {
        lines.push(`   Validation Depot : ${s.workerEvaluationNote}`);
      }
      lines.push(`   Statut : ${s.status === 'given_to_agent' ? 'En Tournee' : 'Alloue'}`);
      lines.push('');
    });
  }

  lines.push('----------------------------------------');
  lines.push('INSTRUCTIONS TOURNEE :');
  lines.push('- Presenter les nouveautes aux librairies et papeteries');
  lines.push('- Noter les retours et intentions de commande sur place');
  lines.push('- Conserver les echantillons propres dans la mallette');
  lines.push('========================================');

  return lines.join('\n');
}

/**
 * Formats manifest for Librairie El Feth (Pricing & Benchmark sheet).
 * ZERO EMOJIS compliant.
 */
export function formatElFethPricingManifest(
  samples: ProductSampleAllocation[]
): string {
  const elFethSamples = samples.filter((s) => s.destination === 'el_feth');
  const dateStr = new Date().toLocaleDateString('fr-DZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const lines: string[] = [
    '========================================',
    'BORDEREAU ECHANTILLONS - LIBRAIRIE EL FETH',
    'EVALUATION MARCHE & FIXATION DES PRIX',
    `DATE : ${dateStr}`,
    `NOMBRE D ARTICLES A TARIFER : ${elFethSamples.length}`,
    '========================================',
    '',
  ];

  elFethSamples.forEach((s, idx) => {
    lines.push(`${idx + 1}. REF: ${s.reference} | ${s.designation}`);
    lines.push(`   Prix Gros Propose : ${s.elFethWholesalePrice ? s.elFethWholesalePrice + ' DA' : 'A definir'}`);
    lines.push(`   Prix Detail Propose : ${s.elFethRetailPrice ? s.elFethRetailPrice + ' DA' : 'A definir'}`);
    if (s.elFethMarketNote) {
      lines.push(`   Avis Marche : ${s.elFethMarketNote}`);
    }
    lines.push('');
  });

  lines.push('========================================');
  lines.push('Validation finale : Responsable Achats & Tarification El Feth');
  return lines.join('\n');
}
