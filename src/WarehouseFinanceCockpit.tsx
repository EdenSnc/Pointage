// ============================================================
// POINTAGE — UI 4: Warehouse Management & Financial Cockpit
// Inventory Valuation, Cash in Transit, Rupture Loss & Dead Stock
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from './db';
import type { Bill, ProductProfile } from './types';
import { calculateWarehouseValuation } from './decisionEngine';
import { AppModuleSwitcher } from './AppModuleSwitcher';
import {
  IconStore,
  IconCoins,
  IconTrendingUp,
  IconWarning,
  IconCheck,
  IconBox,
  IconTruck,
  IconArrowLeft,
  IconClipboardCheck,
} from './icons';
import { hapticTap, playSuccessChime } from './audio';

interface WarehouseFinanceCockpitProps {
  setToast: (msg: string) => void;
}

export const WarehouseFinanceCockpit: React.FC<WarehouseFinanceCockpitProps> = ({ setToast }) => {
  const navigate = useNavigate();

  const [bills, setBills] = useState<Bill[]>([]);
  const [profiles, setProfiles] = useState<ProductProfile[]>([]);

  useEffect(() => {
    async function loadData() {
      const allBills = await db.bills.toArray();
      setBills(allBills);
      const allProfiles = await db.productProfiles.toArray();
      setProfiles(allProfiles);
    }
    loadData();
  }, []);

  const valuation = useMemo(() => {
    return calculateWarehouseValuation({
      bills,
      productCatalog: profiles,
    });
  }, [bills, profiles]);

  const activeBillsCount = useMemo(() => {
    return bills.filter((b) => b.status === 'active' || (b.status as any) === 'in_progress').length;
  }, [bills]);

  const completedBillsCount = useMemo(() => {
    return bills.filter((b) => b.status === 'completed' || (b.status as any) === 'done').length;
  }, [bills]);

  const handleCopyDeadStockManifest = () => {
    const lines = [
      '========================================',
      'OPÉRATION DÉSTOCKAGE FLASH - COMMERCIAL',
      `DATE : ${new Date().toLocaleDateString('fr-DZ')}`,
      `POTENTIEL LIQUIDITÉS : ${valuation.dormantStockValueDa.toLocaleString('fr-DZ')} DA`,
      '========================================',
      '',
      'ARTICLES DORMANTS EN PROMO LIQUIDATION :',
    ];

    valuation.deadStockSuggestions.forEach((it, idx) => {
      lines.push(`${idx + 1}. [${it.reference}] ${it.designation}`);
      lines.push(`   Stock : ${it.stockQty} pcs`);
      lines.push(`   Prix Gros Normal : ${it.standardWholesalePriceDa} DA`);
      lines.push(`   PRIX PROMO DÉSTOCKAGE : ${it.suggestedPromoPriceDa} DA (-18%)`);
      lines.push(`   Cash Récupérable : ${it.potentialCashRecoveryDa.toLocaleString('fr-DZ')} DA`);
      lines.push('');
    });

    lines.push('========================================');
    lines.push('Consigne : Proposer aux grossistes pour déstockage immédiat.');

    navigator.clipboard.writeText(lines.join('\n'));
    playSuccessChime();
    hapticTap('medium');
    setToast('Offre de déstockage copiée pour les commerciaux.');
  };

  return (
    <div
      className="warehouse-finance-cockpit min-h-screen pb-24 text-white"
      style={{ backgroundColor: '#0c0d10' }}
    >
      {/* Top Header */}
      <div
        className="sticky top-0 z-40 px-4 py-3 border-b border-white/10"
        style={{
          background: 'rgba(12, 13, 16, 0.92)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-circle"
              onClick={() => navigate('/')}
            >
              <IconArrowLeft size={16} />
            </button>
            <div>
              <div className="text-sm font-extrabold text-white flex items-center gap-1.5">
                <IconStore size={16} className="text-purple-400" />
                <span>Cockpit Financier & Trésorerie Dépôt</span>
              </div>
              <div className="text-[11px] text-muted">
                Valorisation stock • Marchandises en transit • Aide à la décision déstockage
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-3 flex flex-col gap-4">
        {/* KPI Financial Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div
            style={{
              padding: 16,
              borderRadius: 18,
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div className="text-[11px] text-muted uppercase font-bold flex items-center gap-1.5">
              <IconBox size={14} className="text-blue-400" />
              <span>Valeur en Cours Préparation</span>
            </div>
            <div className="font-mono font-extrabold text-xl text-white mt-1">
              {valuation.preparationValueDa.toLocaleString('fr-DZ')} DA
            </div>
            <div className="text-[11px] text-muted">{activeBillsCount} bon(s) actif(s) sur les quais</div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 18,
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div className="text-[11px] text-muted uppercase font-bold flex items-center gap-1.5">
              <IconTruck size={14} className="text-emerald-400" />
              <span>Valeur Expédiée / Livrée</span>
            </div>
            <div className="font-mono font-extrabold text-xl text-accent mt-1">
              {valuation.activeDispatchedValueDa.toLocaleString('fr-DZ')} DA
            </div>
            <div className="text-[11px] text-muted">{completedBillsCount} bon(s) finalisé(s)</div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 18,
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div className="text-[11px] text-muted uppercase font-bold flex items-center gap-1.5">
              <IconCoins size={14} className="text-amber-400" />
              <span>Trésorerie Récupérable (Déstockage)</span>
            </div>
            <div className="font-mono font-extrabold text-xl text-amber-300 mt-1">
              {valuation.dormantStockValueDa.toLocaleString('fr-DZ')} DA
            </div>
            <div className="text-[11px] text-muted">Sur articles à rotation lente</div>
          </div>
        </div>

        {/* Decision Support: Dead Stock Liquidation Proposal */}
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-extrabold text-sm text-white flex items-center gap-2">
                <IconTrendingUp size={16} className="text-amber-400" />
                <span>Recommandation d'Aide à la Décision : Déstockage Flash</span>
              </div>
              <div className="text-xs text-muted mt-0.5">
                Proposez ces références dormantes à prix préférentiel (-18%) aux commerciaux pour libérer immédiatement du cash.
              </div>
            </div>

            {valuation.deadStockSuggestions.length > 0 && (
              <button
                type="button"
                className="btn btn-xs btn-primary flex items-center gap-1"
                style={{ borderRadius: 10, fontWeight: 700 }}
                onClick={handleCopyDeadStockManifest}
              >
                <IconClipboardCheck size={12} />
                <span>Diffuser aux Commerciaux</span>
              </button>
            )}
          </div>

          {valuation.deadStockSuggestions.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted">
              Aucun stock dormant critique détecté. Tous les articles actifs ont un taux de rotation sain.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {valuation.deadStockSuggestions.map((item) => (
                <div
                  key={item.reference}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-white">{item.reference}</span>
                      <span className="text-[10px] text-muted">Stock : {item.stockQty} pcs</span>
                    </div>
                    <div className="text-xs text-white/90 font-semibold mt-0.5">{item.designation}</div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-muted line-through font-mono">
                      {item.standardWholesalePriceDa} DA
                    </div>
                    <div className="font-mono font-extrabold text-xs text-amber-300">
                      Promo : {item.suggestedPromoPriceDa} DA
                    </div>
                    <div className="text-[10px] text-emerald-400 font-bold">
                      +{item.potentialCashRecoveryDa.toLocaleString('fr-DZ')} DA
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Executive Switcher */}
      <AppModuleSwitcher />
    </div>
  );
};
