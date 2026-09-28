// ============================================================
// POINTAGE — Rentree Returns & Multi-Voyage Pointage Engine
// Traitement des Reliquats & Surplus de Fin de Rentrée Scolaire
// Multi-Voyages Camions, Multi-Dépôts (Oran, Kral Béchar, Bleu Blanc)
// Réintégration Stock, Chiffrage Financier & Avoirs Clients
// ============================================================

import {
  db,
  saveRentreeVoyage,
  saveRentreeCampaign,
  saveRentreeItem,
  getClientAccountByName,
  saveClientAccount,
} from './db';
import type {
  RentreeReturnCampaign,
  RentreeReturnVoyage,
  RentreeReturnItem,
  WarehouseZone,
} from './types';

export interface CampaignSummaryKPIs {
  totalExpectedCartons: number;
  totalReturnedCartons: number;
  totalAvarieCartons: number;
  totalReturnedUnits: number;
  totalAvarieUnits: number;
  totalSalableValueDa: number;
  totalLossAvarieDa: number;
  completionPercent: number;
  conformityRatePercent: number;
}

/**
 * Calculates consolidated KPIs across a campaign and its voyages
 */
export function calculateCampaignKPIs(
  voyages: RentreeReturnVoyage[],
  items: RentreeReturnItem[]
): CampaignSummaryKPIs {
  const totalExpectedCartons = items.reduce((acc, it) => acc + (it.expectedCartons || 0), 0);
  const totalReturnedCartons = items.reduce((acc, it) => acc + (it.returnedCartons || 0), 0);
  const totalAvarieCartons = items.reduce((acc, it) => acc + (it.damagedCartons || 0), 0);

  const totalReturnedUnits = items.reduce(
    (acc, it) => acc + it.returnedCartons * it.outerPackSize + (it.returnedLooseUnits || 0),
    0
  );
  const totalAvarieUnits = items.reduce(
    (acc, it) => acc + (it.damagedUnits || it.damagedCartons * it.outerPackSize),
    0
  );

  const totalSalableValueDa = items.reduce(
    (acc, it) =>
      acc + (it.returnedCartons * it.outerPackSize + (it.returnedLooseUnits || 0)) * (it.unitPriceDa || 0),
    0
  );

  const totalLossAvarieDa = items.reduce(
    (acc, it) =>
      acc + (it.damagedUnits || it.damagedCartons * it.outerPackSize) * (it.unitPriceDa || 0),
    0
  );

  const completionPercent =
    totalExpectedCartons > 0
      ? Math.min(100, Math.round(((totalReturnedCartons + totalAvarieCartons) / totalExpectedCartons) * 100))
      : 0;

  const totalProcessed = totalReturnedCartons + totalAvarieCartons;
  const conformityRatePercent =
    totalProcessed > 0 ? Math.round((totalReturnedCartons / totalProcessed) * 100) : 100;

  return {
    totalExpectedCartons,
    totalReturnedCartons,
    totalAvarieCartons,
    totalReturnedUnits,
    totalAvarieUnits,
    totalSalableValueDa,
    totalLossAvarieDa,
    completionPercent,
    conformityRatePercent,
  };
}

/**
 * Calculates totals for an individual voyage
 */
export function calculateVoyageKPIs(items: RentreeReturnItem[]) {
  const expectedCartons = items.reduce((acc, it) => acc + (it.expectedCartons || 0), 0);
  const returnedCartons = items.reduce((acc, it) => acc + (it.returnedCartons || 0), 0);
  const damagedCartons = items.reduce((acc, it) => acc + (it.damagedCartons || 0), 0);

  const salableValueDa = items.reduce(
    (acc, it) =>
      acc + (it.returnedCartons * it.outerPackSize + (it.returnedLooseUnits || 0)) * (it.unitPriceDa || 0),
    0
  );

  const lossAvarieDa = items.reduce(
    (acc, it) =>
      acc + (it.damagedUnits || it.damagedCartons * it.outerPackSize) * (it.unitPriceDa || 0),
    0
  );

  return {
    expectedCartons,
    returnedCartons,
    damagedCartons,
    salableValueDa,
    lossAvarieDa,
  };
}

/**
 * Re-evaluates item discrepancy status based on counts
 */
export function evaluateItemStatus(item: RentreeReturnItem): RentreeReturnItem['status'] {
  const totalPointedCartons = item.returnedCartons + item.damagedCartons;
  if (totalPointedCartons === 0 && item.returnedLooseUnits === 0) return 'pending';
  if (item.returnedCartons === 0 && item.damagedCartons > 0) return 'damaged_only';
  if (item.returnedCartons === item.expectedCartons && item.damagedCartons === 0) return 'conforme';
  if (totalPointedCartons > item.expectedCartons) return 'surplus';
  if (totalPointedCartons < item.expectedCartons) return 'shortage';
  return 'conforme';
}

/**
 * Direct deduction of return credit note from client debt
 */
export async function applyCreditNoteToClientAccount(
  clientName: string,
  amountDa: number
): Promise<{ success: boolean; newBalance: number; message: string }> {
  if (!clientName || amountDa <= 0) {
    return { success: false, newBalance: 0, message: 'Montant ou client invalide' };
  }

  const account = await getClientAccountByName(clientName);
  if (!account || !account.id) {
    return {
      success: false,
      newBalance: 0,
      message: `Compte client introuvable pour "${clientName}".`,
    };
  }

  const prevBalance = account.currentBalance || 0;
  const newBalance = Math.max(0, prevBalance - amountDa);

  await saveClientAccount({
    ...account,
    id: account.id,
    currentBalance: newBalance,
    notes: `${account.notes ? account.notes + ' | ' : ''}Décharge Retour Rentrée : -${amountDa.toLocaleString('fr-DZ')} DA le ${new Date().toLocaleDateString('fr-DZ')}`,
  });

  return {
    success: true,
    previousBalance: prevBalance,
    creditAmount: amountDa,
    newBalance,
    message: `Créance client réduite de ${amountDa.toLocaleString('fr-DZ')} DA. Nouveau solde : ${newBalance.toLocaleString('fr-DZ')} DA.`,
  };
}

/**
 * Generates formatted text manifest for drivers, quai, and WhatsApp dispatch
 */
export function generateWhatsAppReturnManifest(params: {
  campaign: RentreeReturnCampaign;
  voyage: RentreeReturnVoyage;
  items: RentreeReturnItem[];
}): string {
  const { campaign, voyage, items } = params;
  const kpis = calculateVoyageKPIs(items);

  const lines = [
    '========================================',
    'MANIFESTE DE RETOUR — FIN DE RENTREE',
    `CAMPAGNE : ${campaign.title.toUpperCase()}`,
    `ORIGINE / CLIENT : ${campaign.clientOrOrigin}`,
    `VOYAGE : N° ${voyage.voyageNumber} (${voyage.voyageCode})`,
    `VEHICULE : ${voyage.vehiclePlate}`,
    `CHAUFFEUR : ${voyage.driverName}`,
    `SITE RECEPTION / POINTAGE : ${voyage.arrivalSite.toUpperCase()}`,
    `DATE ARRIVEE : ${voyage.arrivalDate}`,
    '========================================',
    '',
    'ARTICLES POINTES AU QUAI :',
  ];

  items.forEach((it, idx) => {
    const totalPcs = it.returnedCartons * it.outerPackSize + (it.returnedLooseUnits || 0);
    const subtotal = totalPcs * it.unitPriceDa;
    const avarieText = it.damagedCartons > 0 ? ` (Avaries : ${it.damagedCartons} ctn)` : '';
    const zoneText = it.reintegratedZone ? ` -> Zone [${it.reintegratedZone}]` : '';

    lines.push(
      `${idx + 1}. [${it.reference}] ${it.designation}`
    );
    lines.push(
      `   Pointé : ${it.returnedCartons}/${it.expectedCartons} ctns (${totalPcs.toLocaleString('fr-DZ')} pcs)${avarieText}${zoneText}`
    );
    lines.push(
      `   Valorisation nette : ${subtotal.toLocaleString('fr-DZ')} DA`
    );
  });

  lines.push('');
  lines.push('----------------------------------------');
  lines.push(`TOTAL CARTONS RETOURNES : ${kpis.returnedCartons} ctns`);
  lines.push(`TOTAL CARTONS AVARIES : ${kpis.damagedCartons} ctns`);
  lines.push(`VALORISATION BON ETAT : ${kpis.salableValueDa.toLocaleString('fr-DZ')} DA`);
  if (kpis.lossAvarieDa > 0) {
    lines.push(`PERTE ESTIMEE AVARIES : ${kpis.lossAvarieDa.toLocaleString('fr-DZ')} DA`);
  }
  lines.push('========================================');
  lines.push('Décharge générée par Système Pointage Surface.');

  return lines.join('\n');
}
