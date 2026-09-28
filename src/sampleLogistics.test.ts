import { describe, it, expect } from 'vitest';
import {
  suggestTransportability,
  buildArrivalSamplePlan,
  formatAgentTourneeManifest,
  formatElFethPricingManifest,
  loadPreparateursRoster,
  savePreparateurToRoster,
  DEFAULT_PREPARATEUR_WORKERS,
} from './sampleLogistics';
import type { CandidateItemForSampling, ProductSampleAllocation } from './types';

describe('Agent à Tourner & Product Sample Logistics', () => {
  describe('suggestTransportability heuristics', () => {
    it('identifies compact stationery items as easily transportable', () => {
      const pen = suggestTransportability({ designation: 'Stylo à bille Bleu Schneider 0.7mm' });
      expect(pen.grade).toBe('easily_transportable');
      expect(pen.suggestedNote).toContain('compact');

      const trousse = suggestTransportability({ designation: 'Trousse scolaire double compartiment' });
      expect(trousse.grade).toBe('easily_transportable');

      const calc = suggestTransportability({ designation: 'Calculatrice scientifique FX-82' });
      expect(calc.grade).toBe('easily_transportable');
    });

    it('identifies heavy/bulky items as bulky_refused', () => {
      const ream = suggestTransportability({ designation: 'Ramette papier repro 80g A4 500f' });
      expect(ream.grade).toBe('bulky_refused');
      expect(ream.suggestedNote).toContain('Showroom & El Feth');

      const board = suggestTransportability({ designation: 'Tableau blanc 120x90cm avec cadre alu' });
      expect(board.grade).toBe('bulky_refused');
    });

    it('marks unrecognized items as pending_evaluation', () => {
      const unknown = suggestTransportability({ designation: 'Kit Plastique Spécial Réf X-99' });
      expect(unknown.grade).toBe('pending_evaluation');
    });
  });

  describe('buildArrivalSamplePlan allocation rules', () => {
    const activeAgents = ['Yassine', 'Djaber', 'Mourad'];

    it('allocates 1 for Showroom, 1 for El Feth, and 1 per Agent for transportable items', () => {
      const items: CandidateItemForSampling[] = [
        {
          reference: 'STY-BLUE-01',
          designation: 'Boite Stylos Roller Bleu',
          category: 'scolaire',
          transportability: 'easily_transportable',
          workerEvaluationNote: 'Petit format, rentre dans la sacoche',
        },
      ];

      const result = buildArrivalSamplePlan({
        items,
        activeAgents,
        managerName: 'Amine (Chef Dépôt)',
        consultedWorkerName: 'Walid (Préparateur)',
      });

      expect(result.totalShowroom).toBe(1);
      expect(result.totalElFeth).toBe(1);
      expect(result.totalAgentTourner).toBe(3); // 3 agents: Yassine, Djaber, Mourad
      expect(result.excludedBulkyCount).toBe(0);
      expect(result.allocationsToCreate).toHaveLength(5); // 1 + 1 + 3

      // Verify destinations
      const showroom = result.allocationsToCreate.find((a) => a.destination === 'showroom');
      expect(showroom).toBeDefined();
      expect(showroom?.assignedAgentName).toBe('Showroom Dépôt');
      expect(showroom?.quantity).toBe(1);
      expect(showroom?.consultedWorkerName).toBe('Walid (Préparateur)');

      const elFeth = result.allocationsToCreate.find((a) => a.destination === 'el_feth');
      expect(elFeth).toBeDefined();
      expect(elFeth?.assignedAgentName).toBe('Librairie El Feth');
      expect(elFeth?.quantity).toBe(1);

      const drivers = result.allocationsToCreate.filter((a) => a.destination === 'agent_tourner');
      expect(drivers).toHaveLength(3);
      expect(drivers.map((d) => d.assignedAgentName)).toEqual(['Yassine', 'Djaber', 'Mourad']);
    });

    it('excludes drivers if product is bulky_refused, allocating only to Showroom and El Feth', () => {
      const items: CandidateItemForSampling[] = [
        {
          reference: 'PAP-RAM-A4',
          designation: 'Carton 5 Ramettes Papier A4',
          category: 'bureautique',
          transportability: 'bulky_refused',
          workerEvaluationNote: 'Trop lourd (12.5kg) pour tournée chauffeur',
        },
      ];

      const result = buildArrivalSamplePlan({
        items,
        activeAgents,
        managerName: 'Amine (Chef Dépôt)',
        consultedWorkerName: 'Karim (Préparateur)',
      });

      expect(result.totalShowroom).toBe(1);
      expect(result.totalElFeth).toBe(1);
      expect(result.totalAgentTourner).toBe(0); // 0 drivers!
      expect(result.excludedBulkyCount).toBe(1);
      expect(result.allocationsToCreate).toHaveLength(2); // Only Showroom + El Feth

      const driverAllocs = result.allocationsToCreate.filter((a) => a.destination === 'agent_tourner');
      expect(driverAllocs).toHaveLength(0);
    });

    it('processes multi-item mix of transportable and bulky products accurately', () => {
      const items: CandidateItemForSampling[] = [
        {
          reference: 'COMP-01',
          designation: 'Compas scolaire métallique',
          transportability: 'easily_transportable',
        },
        {
          reference: 'TAB-120',
          designation: 'Grand Tableau Mural',
          transportability: 'bulky_refused',
        },
      ];

      const result = buildArrivalSamplePlan({
        items,
        activeAgents: ['Yassine', 'Djaber'],
        managerName: 'Farid (Manager)',
        consultedWorkerName: 'Hichem (Préparateur)',
      });

      expect(result.totalShowroom).toBe(2);
      expect(result.totalElFeth).toBe(2);
      expect(result.totalAgentTourner).toBe(2); // only for the compas, 2 agents
      expect(result.excludedBulkyCount).toBe(1);
      expect(result.allocationsToCreate).toHaveLength(6);
    });
  });

  describe('Manifest formatting', () => {
    it('generates a driver touring manifest with zero emojis', () => {
      const samples: ProductSampleAllocation[] = [
        {
          id: 1,
          reference: 'STY-001',
          designation: 'Stylos Gel 0.5mm Pack de 4',
          destination: 'agent_tourner',
          assignedAgentName: 'Yassine',
          quantity: 1,
          transportability: 'easily_transportable',
          managerApproved: true,
          consultedWorkerName: 'Walid',
          status: 'given_to_agent',
          elFethRetailPrice: 350,
          allocatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const manifest = formatAgentTourneeManifest('Yassine', samples);
      expect(manifest).toContain('CHAUFFEUR : YASSINE');
      expect(manifest).toContain('[REF: STY-001]');
      expect(manifest).toContain('Prix Conseille El Feth : 350 DA');
      // Verify zero emojis
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
      expect(emojiRegex.test(manifest)).toBe(false);
    });

    it('generates El Feth pricing manifest with zero emojis', () => {
      const samples: ProductSampleAllocation[] = [
        {
          id: 2,
          reference: 'TROU-09',
          designation: 'Trousse Peluche Panda',
          destination: 'el_feth',
          assignedAgentName: 'Librairie El Feth',
          quantity: 1,
          transportability: 'easily_transportable',
          managerApproved: true,
          status: 'allocated',
          elFethWholesalePrice: 280,
          elFethRetailPrice: 420,
          elFethMarketNote: 'Produit phare pour la rentree scolaire',
          allocatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const manifest = formatElFethPricingManifest(samples);
      expect(manifest).toContain('LIBRAIRIE EL FETH');
      expect(manifest).toContain('280 DA');
      expect(manifest).toContain('420 DA');
      expect(manifest).toContain('Produit phare');
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
      expect(emojiRegex.test(manifest)).toBe(false);
    });
  });

  describe('Preparateur workers roster', () => {
    it('loads default preparateurs and saves new worker', () => {
      const roster = loadPreparateursRoster();
      expect(roster.length).toBeGreaterThanOrEqual(DEFAULT_PREPARATEUR_WORKERS.length);
      expect(roster).toContain('Walid (Préparateur Principal)');

      const updated = savePreparateurToRoster('Nourredine (Préparateur)');
      expect(updated).toContain('Nourredine (Préparateur)');
    });
  });
});
