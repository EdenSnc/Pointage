// ============================================================
// POINTAGE — Decision Support Engine (Systèmes d'Aide à la Décision)
// Financial Optimization, Cash Collection, Volume Margins & Reassort
// Goal: Maximize Revenue, Accelerate Cash Flow & Prevent Losses
// ============================================================

import type {
  ClientAccount,
  OrderItem,
  OrderDraft,
  ProductProfile,
  DecisionSupportInsight,
} from './types';

/**
 * 1. B2B Wholesale Decision Support
 * Detects volume tier discount upsells, credit limit breaches, and golden product opportunities.
 */
export function analyzeB2BOrderOpportunities(params: {
  items: OrderItem[];
  client?: ClientAccount | null;
  productCatalog?: ProductProfile[];
}): {
  insights: DecisionSupportInsight[];
  volumeUpsell: {
    neededCartons: number;
    neededAmountDa: number;
    extraDiscountPercent: number;
    potentialGainDa: number;
  } | null;
  creditRisk: DecisionSupportInsight | null;
} {
  const { items, client, productCatalog = [] } = params;
  const insights: DecisionSupportInsight[] = [];
  let volumeUpsell: {
    neededCartons: number;
    neededAmountDa: number;
    extraDiscountPercent: number;
    potentialGainDa: number;
  } | null = null;
  let creditRisk: DecisionSupportInsight | null = null;

  const totalUnits = items.reduce((sum, it) => sum + it.quantity, 0);
  const subtotal = items.reduce((sum, it) => sum + it.totalPrice, 0);

  // A. Credit Limit & Financial Risk Check
  if (client) {
    const projectedBalance = client.currentBalance + subtotal;
    if (projectedBalance > client.creditLimit) {
      const excessDa = projectedBalance - client.creditLimit;
      creditRisk = {
        id: 'credit_limit_exceeded',
        type: 'overdue_credit_warning',
        title: 'Alerte Risque Financier — Plafond Dépassé',
        description: `Cette commande (${subtotal.toLocaleString('fr-DZ')} DA) porte l'encours à ${projectedBalance.toLocaleString('fr-DZ')} DA, dépassant le plafond autorisé de ${client.creditLimit.toLocaleString('fr-DZ')} DA (Dépassement : +${excessDa.toLocaleString('fr-DZ')} DA).`,
        potentialMoneyImpactDa: excessDa,
        actionLabel: 'Exiger acompte ou paiement comptant',
        urgency: 'high',
        metadata: { currentBalance: client.currentBalance, creditLimit: client.creditLimit, excessDa },
      };
      insights.push(creditRisk);
    } else if (client.currentBalance > client.creditLimit * 0.8) {
      insights.push({
        id: 'credit_near_limit',
        type: 'overdue_credit_warning',
        title: 'Encours Élevé (> 80% du Plafond)',
        description: `Le solde impayé du client s'élève à ${client.currentBalance.toLocaleString('fr-DZ')} DA. Proposer un encaissement partiel avant la prochaine commande.`,
        potentialMoneyImpactDa: client.currentBalance,
        actionLabel: 'Proposer encaissement',
        urgency: 'medium',
      });
    }
  }

  // B. Volume Tier Discount Accelerator
  // Wholesale Palier: At 20 cartons/colis -> +3% discount; at 50 cartons -> +5% discount
  if (totalUnits > 0) {
    let targetThreshold = 0;
    let extraDiscount = 0;

    if (totalUnits < 20) {
      targetThreshold = 20;
      extraDiscount = 3; // +3%
    } else if (totalUnits < 50) {
      targetThreshold = 50;
      extraDiscount = 5; // +5%
    }

    if (targetThreshold > 0 && targetThreshold - totalUnits <= 6) {
      const neededCartons = targetThreshold - totalUnits;
      const avgUnitPrice = subtotal / totalUnits;
      const neededAmountDa = Math.round(neededCartons * avgUnitPrice);
      const projectedNewTotal = subtotal + neededAmountDa;
      const potentialGainDa = Math.round(projectedNewTotal * (extraDiscount / 100));

      volumeUpsell = {
        neededCartons,
        neededAmountDa,
        extraDiscountPercent: extraDiscount,
        potentialGainDa,
      };

      insights.push({
        id: 'volume_discount_upsell',
        type: 'volume_discount_threshold',
        title: `Palier Volume : +${extraDiscount}% de remise accessible`,
        description: `Plus que ${neededCartons} carton(s) (${neededAmountDa.toLocaleString('fr-DZ')} DA) pour débloquer ${extraDiscount}% de remise sur l'ensemble de votre commande (Économie : +${potentialGainDa.toLocaleString('fr-DZ')} DA).`,
        potentialMoneyImpactDa: potentialGainDa,
        actionLabel: `Ajouter ${neededCartons} carton(s)`,
        urgency: 'info',
        metadata: volumeUpsell,
      });
    }
  }

  // C. Golden Products Cross-Sell Recommendation
  const currentRefs = new Set(items.map((i) => i.reference.toUpperCase()));
  const missingGolden = productCatalog.filter(
    (p) => p.isGoldenProduct && !currentRefs.has(p.reference.toUpperCase())
  );

  if (missingGolden.length > 0) {
    const topGolden = missingGolden[0];
    const unitPrice = topGolden.wholesalePrice || 1200;
    const estimatedCartonRevenue = unitPrice * (topGolden.outerPackSize || 24);

    insights.push({
      id: `golden_${topGolden.reference}`,
      type: 'high_margin_golden',
      title: `Article Star Recommandé : ${topGolden.reference}`,
      description: `${topGolden.designation || 'Produit Phare'} génère un fort taux de rotation en papeterie scolaire avec une marge brute supérieure.`,
      potentialMoneyImpactDa: estimatedCartonRevenue,
      actionLabel: `Ajouter 1 carton (${topGolden.outerPackSize || 24} pcs)`,
      urgency: 'medium',
      metadata: { reference: topGolden.reference, unitPrice },
    });
  }

  return { insights, volumeUpsell, creditRisk };
}

/**
 * 2. Commercial Field Rep Decision Support
 * Ranks clients by cash recovery urgency and sales replenishment potential.
 */
export function generateRepTourRecommendations(
  clients: ClientAccount[],
  repName?: string
): Array<
  ClientAccount & {
    tourScore: number;
    recommendedAction: string;
    priorityReason: string;
    targetCashDa: number;
  }
> {
  const filtered = repName
    ? clients.filter((c) => !c.assignedRep || c.assignedRep.toLowerCase() === repName.toLowerCase())
    : clients;

  const scored = filtered.map((client) => {
    let score = 0;
    let priorityReason = 'Visite de courtoisie et réassort';
    let recommendedAction = 'Présenter les nouveautés';
    let targetCashDa = 0;

    // A. Unpaid Credit Balance (Most money at stake)
    if (client.currentBalance > client.creditLimit) {
      score += 100;
      priorityReason = 'URGENT : Plafond de crédit dépassé';
      recommendedAction = `Encaisser impérativement ${client.currentBalance.toLocaleString('fr-DZ')} DA (espèces ou chèque)`;
      targetCashDa = client.currentBalance;
    } else if (client.currentBalance > 200000) {
      score += 60;
      priorityReason = 'Créance importante à recouvrer';
      recommendedAction = `Récupérer au moins ${(client.currentBalance * 0.5).toLocaleString('fr-DZ')} DA d'acompte`;
      targetCashDa = Math.round(client.currentBalance * 0.5);
    }

    // B. High-Volume Wholesaler Type
    if (client.clientType === 'grossiste') {
      score += 30;
    } else if (client.clientType === 'librairie') {
      score += 20;
    }

    // C. Reorder Inactivity
    if (!client.lastOrderDate) {
      score += 15;
    } else {
      const daysSinceOrder = Math.round(
        (Date.now() - new Date(client.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceOrder > 14) {
        score += 25;
        if (score < 80) {
          priorityReason = `Inactif depuis ${daysSinceOrder} jours (Risque perte client)`;
          recommendedAction = 'Proposer commande réassort rentrée';
        }
      }
    }

    return {
      ...client,
      tourScore: score,
      recommendedAction,
      priorityReason,
      targetCashDa,
    };
  });

  return scored.sort((a, b) => b.tourScore - a.tourScore);
}

/**
 * 3. Commercial Margin Simulation Engine
 * Computes live revenue, purchase costs, net margin in DA and %, with color-coded safety indicators.
 */
export function simulateOrderMargin(
  items: OrderItem[],
  discountPercent: number
): {
  subtotalDa: number;
  discountDa: number;
  finalRevenueDa: number;
  totalCostDa: number;
  netProfitDa: number;
  marginPercent: number;
  marginHealth: 'excellent' | 'healthy' | 'tight' | 'loss';
} {
  const subtotalDa = items.reduce((sum, it) => sum + it.totalPrice, 0);
  const discountDa = Math.round(subtotalDa * (discountPercent / 100));
  const finalRevenueDa = Math.max(0, subtotalDa - discountDa);

  // If cost price is not provided, estimate default supplier wholesale cost as 72% of list price
  const totalCostDa = items.reduce((sum, it) => {
    const unitCost = it.costPrice !== undefined && it.costPrice !== null ? it.costPrice : it.unitPrice * 0.72;
    return sum + unitCost * it.quantity;
  }, 0);

  const netProfitDa = Math.round(finalRevenueDa - totalCostDa);
  const marginPercent = finalRevenueDa > 0 ? Math.round((netProfitDa / finalRevenueDa) * 100) : 0;

  let marginHealth: 'excellent' | 'healthy' | 'tight' | 'loss' = 'healthy';
  if (netProfitDa <= 0) {
    marginHealth = 'loss';
  } else if (marginPercent >= 22) {
    marginHealth = 'excellent';
  } else if (marginPercent >= 12) {
    marginHealth = 'healthy';
  } else {
    marginHealth = 'tight';
  }

  return {
    subtotalDa,
    discountDa,
    finalRevenueDa,
    totalCostDa,
    netProfitDa,
    marginPercent,
    marginHealth,
  };
}

/**
 * 4. Retail B2C Consumer School Supply Bundles
 * Generates high-basket kits for parents and students with bundled savings.
 */
export interface RetailBundle {
  id: string;
  name: string;
  targetAudience: string;
  description: string;
  priceDa: number;
  originalPriceDa: number;
  savingsDa: number;
  items: OrderItem[];
}

export const PRESET_RETAIL_BUNDLES: RetailBundle[] = [
  {
    id: 'pack_college_complet',
    name: 'Pack Rentrée Collège Complet',
    targetAudience: '1ère à 4ème Année CEM',
    description: '10 cahiers 96p, 4 stylos bille, trousse double zip, règle 30cm, compas métal et calculatrice scientifique.',
    priceDa: 3850,
    originalPriceDa: 4600,
    savingsDa: 750,
    items: [
      { reference: 'CAH-96P-01', designation: 'Cahier 96 Pages Seyès', unitPrice: 85, quantity: 10, totalPrice: 850 },
      { reference: 'STY-BLU-04', designation: 'Lot 4 Stylos Roller 0.7mm', unitPrice: 320, quantity: 1, totalPrice: 320 },
      { reference: 'TROU-OXF-01', designation: 'Trousse Oxford Double Zip', unitPrice: 390, quantity: 1, totalPrice: 390 },
      { reference: 'COMP-MET-01', designation: 'Compas Métallique Précision', unitPrice: 450, quantity: 1, totalPrice: 450 },
      { reference: 'CALC-SCI-82', designation: 'Calculatrice Scientifique FX', unitPrice: 1840, quantity: 1, totalPrice: 1840 },
    ],
  },
  {
    id: 'pack_primaire_essentiel',
    name: 'Pack Primaire Essentiel',
    targetAudience: '1ère à 5ème Année Primaire',
    description: 'Ardoise magique, craies/feutres effaçables, 6 cahiers 64p, crayons de couleur 12 pcs, gomme et taille-crayon réservoir.',
    priceDa: 2150,
    originalPriceDa: 2590,
    savingsDa: 440,
    items: [
      { reference: 'ARD-EFF-01', designation: 'Ardoise Blanche Effaçable', unitPrice: 280, quantity: 1, totalPrice: 280 },
      { reference: 'CAH-64P-01', designation: 'Cahier 64 Pages Seyès', unitPrice: 65, quantity: 6, totalPrice: 390 },
      { reference: 'CRAY-COL-12', designation: 'Boite 12 Crayons de Couleur', unitPrice: 420, quantity: 1, totalPrice: 420 },
      { reference: 'GOMM-DUO-01', designation: 'Gomme Blanche Sans Phtalates', unitPrice: 90, quantity: 2, totalPrice: 180 },
      { reference: 'TROU-SCO-01', designation: 'Trousse Souple Motif Enfant', unitPrice: 350, quantity: 1, totalPrice: 350 },
      { reference: 'FEUT-ARD-04', designation: 'Set 4 Feutres Ardoise', unitPrice: 530, quantity: 1, totalPrice: 530 },
    ],
  },
  {
    id: 'pack_bureau_entreprise',
    name: 'Pack Bureautique & Comptabilité',
    targetAudience: 'PME, Cabinets, Secrétariat',
    description: '3 ramettes papier 80g, boite 50 stylos bille, classeurs dos 80mm, surligneurs fluo et dégrafeuse métal.',
    priceDa: 5400,
    originalPriceDa: 6250,
    savingsDa: 850,
    items: [
      { reference: 'PAP-A4-80G', designation: 'Ramette Papier Repro A4 80g', unitPrice: 720, quantity: 3, totalPrice: 2160 },
      { reference: 'STY-BOX-50', designation: 'Boite 50 Stylos Bille Bleus', unitPrice: 1650, quantity: 1, totalPrice: 1650 },
      { reference: 'CLAS-DOS-80', designation: 'Classeur Dos 80mm Renforcé', unitPrice: 420, quantity: 3, totalPrice: 1260 },
      { reference: 'SURL-SET-04', designation: 'Set 4 Surligneurs Pastel', unitPrice: 330, quantity: 1, totalPrice: 330 },
    ],
  },
];

/**
 * 5. Warehouse Management Financial Cockpit
 * Aggregates operational inventory states into working capital and unfulfilled shortage losses.
 */
export function calculateWarehouseValuation(params: {
  bills: Array<{ totalUnits?: number; status?: string }>;
  productCatalog: ProductProfile[];
  receptionSessionsCount?: number;
}): {
  activeDispatchedValueDa: number;
  preparationValueDa: number;
  dormantStockValueDa: number;
  deadStockSuggestions: Array<{
    reference: string;
    designation: string;
    stockQty: number;
    standardWholesalePriceDa: number;
    suggestedPromoPriceDa: number;
    potentialCashRecoveryDa: number;
  }>;
} {
  const { bills, productCatalog } = params;

  // Estimate average bill value (stationery average ~ 85,000 DA per BL)
  const activeDispatchedValueDa = bills.filter((b) => b.status === 'done').length * 115000;
  const preparationValueDa = bills.filter((b) => b.status === 'in_progress').length * 82000;

  // Stagnant inventory liquidation suggestions
  const deadStockSuggestions = productCatalog
    .filter((p) => (p.stockQty || 0) > 100 && !p.isGoldenProduct)
    .map((p) => {
      const stock = p.stockQty || 120;
      const wholesale = p.wholesalePrice || 900;
      const promoPrice = Math.round(wholesale * 0.82); // -18% liquidation promo
      const potentialCash = stock * promoPrice;
      return {
        reference: p.reference,
        designation: p.designation || 'Article Dormant',
        stockQty: stock,
        standardWholesalePriceDa: wholesale,
        suggestedPromoPriceDa: promoPrice,
        potentialCashRecoveryDa: potentialCash,
      };
    });

  const dormantStockValueDa = deadStockSuggestions.reduce(
    (sum, d) => sum + d.potentialCashRecoveryDa,
    0
  );

  return {
    activeDispatchedValueDa,
    preparationValueDa,
    dormantStockValueDa,
    deadStockSuggestions,
  };
}
