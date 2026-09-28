// ============================================================
// POINTAGE — UI 2: Commercial & Vente Itinérante (Field Reps)
// Cash Recovery, Debt Collection, On-site Orders & Margin Simulation
// Decision Support: Tour Priority Ranked by Money Potential
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  db,
  getAllClientAccounts,
  recordPaymentCollection,
  getAllPaymentCollections,
  saveOrderDraft,
  seedInitialBusinessDataIfEmpty,
} from './db';
import type {
  ClientAccount,
  OrderItem,
  CommercialPaymentCollection,
  OrderDraft,
  ProductProfile,
} from './types';
import {
  generateRepTourRecommendations,
  simulateOrderMargin,
} from './decisionEngine';
import { AppModuleSwitcher } from './AppModuleSwitcher';
import { loadDriverRoster } from './driverLogistics';
import {
  IconTruck,
  IconCheck,
  IconWarning,
  IconPlus,
  IconTrash,
  IconSparkles,
  IconClipboardCheck,
  IconUser,
  IconTag,
  IconTrendingUp,
  IconShield,
  IconArrowLeft,
  IconCoins,
  IconStore,
} from './icons';
import { playSuccessChime, playWarningBeep, hapticTap } from './audio';

const QUICK_FIELD_PRODUCTS: ProductProfile[] = [
  {
    reference: 'CAH-96P-SBM',
    designation: 'Cahier 96P Seyès (Carton 80 pcs)',
    wholesalePrice: 6800,
    purchasePrice: 5100,
    outerPackSize: 80,
    innerPackSize: 10,
    warehouseZone: null,
    stockQty: 450,
    updatedAt: new Date().toISOString(),
  },
  {
    reference: 'STY-BOX-50',
    designation: 'Boite 50 Stylos Gel Bleu 0.7mm',
    wholesalePrice: 4800,
    purchasePrice: 3400,
    outerPackSize: 20,
    innerPackSize: 1,
    warehouseZone: null,
    stockQty: 600,
    updatedAt: new Date().toISOString(),
  },
  {
    reference: 'TROU-OXF-01',
    designation: 'Trousse Oxford Double Compartiment (Carton 24 pcs)',
    wholesalePrice: 6240,
    purchasePrice: 4400,
    outerPackSize: 24,
    innerPackSize: 6,
    warehouseZone: null,
    stockQty: 210,
    updatedAt: new Date().toISOString(),
  },
  {
    reference: 'CALC-SCI-82',
    designation: 'Calculatrice Scientifique FX (Carton 20 pcs)',
    wholesalePrice: 29000,
    purchasePrice: 22000,
    outerPackSize: 20,
    innerPackSize: 5,
    warehouseZone: null,
    stockQty: 95,
    updatedAt: new Date().toISOString(),
  },
];

interface CommercialFieldScreenProps {
  setToast: (msg: string) => void;
}

export const CommercialFieldScreen: React.FC<CommercialFieldScreenProps> = ({ setToast }) => {
  const navigate = useNavigate();

  // State
  const [reps, setReps] = useState<string[]>(() => loadDriverRoster());
  const [activeRep, setActiveRep] = useState<string>('Yassine');
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [collections, setCollections] = useState<CommercialPaymentCollection[]>([]);
  const [activeTab, setActiveTab] = useState<'tour_planner' | 'new_order' | 'collections_history'>('tour_planner');

  // Cash collection modal state
  const [selectedClientForCash, setSelectedClientForCash] = useState<ClientAccount | null>(null);
  const [cashAmount, setCashAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'especes' | 'cheque'>('especes');
  const [checkNumber, setCheckNumber] = useState<string>('');

  // On-site order taking state
  const [selectedClientForOrder, setSelectedClientForOrder] = useState<ClientAccount | null>(null);
  const [fieldCart, setFieldCart] = useState<OrderItem[]>([]);
  const [fieldDiscountPercent, setFieldDiscountPercent] = useState<number>(5);

  const refreshData = async () => {
    await seedInitialBusinessDataIfEmpty();
    const accounts = await getAllClientAccounts();
    setClients(accounts);
    const colList = await getAllPaymentCollections();
    setCollections(colList);
    const loadedReps = loadDriverRoster();
    setReps(loadedReps);
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Today's total cash collected by this rep
  const todayCashCollectedDa = useMemo(() => {
    return collections
      .filter((c) => c.repName.toLowerCase() === activeRep.toLowerCase())
      .reduce((sum, c) => sum + c.amount, 0);
  }, [collections, activeRep]);

  // Decision Support: Tour Planner Ranked by Cash & Recovery Priority
  const rankedTourClients = useMemo(() => {
    return generateRepTourRecommendations(clients, activeRep);
  }, [clients, activeRep]);

  // Commercial Margin Simulation for current on-site cart
  const marginSimulation = useMemo(() => {
    return simulateOrderMargin(fieldCart, fieldDiscountPercent);
  }, [fieldCart, fieldDiscountPercent]);

  // Record Cash / Check payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientForCash) return;
    const amount = parseFloat(cashAmount);
    if (!amount || amount <= 0) {
      playWarningBeep();
      setToast('Veuillez saisir un montant valide.');
      return;
    }

    await recordPaymentCollection({
      clientName: selectedClientForCash.name,
      repName: activeRep,
      amount,
      paymentMethod,
      checkNumber: paymentMethod === 'cheque' ? checkNumber.trim() || null : null,
      notes: `Encaissement terrain par ${activeRep}`,
    });

    playSuccessChime();
    hapticTap('heavy');
    setToast(
      `Encaissement de ${amount.toLocaleString('fr-DZ')} DA (${paymentMethod}) validé pour ${selectedClientForCash.name} !`
    );
    setSelectedClientForCash(null);
    setCashAmount('');
    setCheckNumber('');
    await refreshData();
  };

  // Add product to on-site cart
  const handleAddToFieldCart = (prod: ProductProfile, qty = 1) => {
    hapticTap('light');
    playSuccessChime();
    setFieldCart((prev) => {
      const existing = prev.find((it) => it.reference === prod.reference);
      if (existing) {
        return prev.map((it) =>
          it.reference === prod.reference
            ? { ...it, quantity: it.quantity + qty, totalPrice: (it.quantity + qty) * it.unitPrice }
            : it
        );
      }
      return [
        ...prev,
        {
          reference: prod.reference,
          designation: prod.designation || prod.reference,
          unitPrice: prod.wholesalePrice || 5000,
          quantity: qty,
          packSize: prod.outerPackSize || 20,
          totalPrice: (prod.wholesalePrice || 5000) * qty,
          costPrice: prod.purchasePrice || 3500,
        },
      ];
    });
  };

  // Transmit on-site field order
  const handleTransmitFieldOrder = async () => {
    if (!selectedClientForOrder || fieldCart.length === 0) {
      playWarningBeep();
      setToast('Panier vide ou client non sélectionné.');
      return;
    }

    const orderNumber = `BC-TERRAIN-${Date.now().toString().slice(-5)}`;
    const orderData: Omit<OrderDraft, 'id' | 'createdAt' | 'updatedAt'> = {
      orderNumber,
      channel: 'commercial',
      clientName: selectedClientForOrder.name,
      clientPhone: selectedClientForOrder.phone || null,
      clientWilaya: selectedClientForOrder.wilaya || 'Oran',
      repName: activeRep,
      items: fieldCart,
      totalUnits: fieldCart.reduce((sum, it) => sum + it.quantity, 0),
      subtotalAmount: marginSimulation.subtotalDa,
      discountPercent: fieldDiscountPercent,
      discountAmount: marginSimulation.discountDa,
      finalAmount: marginSimulation.finalRevenueDa,
      estimatedMarginDa: marginSimulation.netProfitDa,
      estimatedMarginPercent: marginSimulation.marginPercent,
      status: 'transmitted_to_warehouse',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      notes: `Commande terrain prise par ${activeRep} sur place`,
    };

    await saveOrderDraft(orderData);
    playSuccessChime();
    hapticTap('heavy');
    setToast(`Commande ${orderNumber} (${marginSimulation.finalRevenueDa.toLocaleString('fr-DZ')} DA) transmise au quai !`);
    setFieldCart([]);
    setSelectedClientForOrder(null);
    setActiveTab('tour_planner');
  };

  return (
    <div
      className="commercial-field-screen min-h-screen pb-24 text-white"
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
                <IconTruck size={16} className="text-emerald-400" />
                <span>Commercial & Vente Itinérante</span>
              </div>
              <div className="text-[11px] text-muted">
                Visites librairies • Recouvrement créances • Prise de commande terrain
              </div>
            </div>
          </div>

          {/* Rep Selector */}
          <div className="flex items-center gap-1.5">
            <IconUser size={13} className="text-muted" />
            <select
              className="select select-xs font-bold text-xs"
              value={activeRep}
              onChange={(e) => setActiveRep(e.target.value)}
              style={{ borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }}
            >
              {reps.map((r) => (
                <option key={r} value={r}>
                  {r} (Commercial)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Daily Cash Counter & Navigation Tabs */}
        <div className="max-w-4xl mx-auto mt-2.5 pt-2.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 10,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <IconCoins size={14} className="text-emerald-400" />
              <span className="text-[11px] text-muted uppercase font-bold">Encaissé Aujourd'hui :</span>
              <span className="font-mono font-extrabold text-xs text-emerald-300">
                {todayCashCollectedDa.toLocaleString('fr-DZ')} DA
              </span>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1">
            <button
              type="button"
              className={`btn btn-xs ${activeTab === 'tour_planner' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('tour_planner')}
              style={{ borderRadius: 8, fontWeight: 700 }}
            >
              Tournée Recommandée ({rankedTourClients.length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${activeTab === 'new_order' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('new_order')}
              style={{ borderRadius: 8, fontWeight: 700 }}
            >
              Prise de Commande ({fieldCart.length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${activeTab === 'collections_history' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('collections_history')}
              style={{ borderRadius: 8, fontWeight: 700 }}
            >
              Historique Encaissements
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-3 flex flex-col gap-3">
        {/* TAB 1: TOUR PLANNER & CASH RECOVERY RANKING */}
        {activeTab === 'tour_planner' && (
          <div className="flex flex-col gap-3">
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                backgroundColor: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div className="text-xs">
                <span className="font-bold text-emerald-300">Aide à la Décision : </span>
                <span className="text-muted">
                  Clients classés par urgence de trésorerie (recouvrement créances & risque de rupture).
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {rankedTourClients.map((client, idx) => {
                const isOverdue = client.currentBalance > client.creditLimit;
                return (
                  <div
                    key={client.id || client.name}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 18,
                      backgroundColor: isOverdue ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.03)',
                      border: isOverdue
                        ? '1px solid rgba(239, 68, 68, 0.3)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-muted">#{idx + 1}</span>
                          <span className="font-extrabold text-sm text-white">{client.name}</span>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '2px 6px',
                              borderRadius: 9999,
                              backgroundColor: 'rgba(255,255,255,0.06)',
                              color: 'var(--muted)',
                              textTransform: 'uppercase',
                              fontWeight: 700,
                            }}
                          >
                            {client.wilaya || 'Algérie'}
                          </span>
                        </div>
                        <div className="text-xs font-bold mt-1" style={{ color: isOverdue ? 'var(--danger)' : '#60a5fa' }}>
                          {client.priorityReason}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5">{client.recommendedAction}</div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-muted uppercase font-bold">Solde Dû</div>
                        <div
                          className="font-mono font-extrabold text-sm"
                          style={{ color: isOverdue ? 'var(--danger)' : 'var(--accent)' }}
                        >
                          {client.currentBalance.toLocaleString('fr-DZ')} DA
                        </div>
                        <div className="text-[10px] text-muted">
                          Plafond : {client.creditLimit.toLocaleString('fr-DZ')} DA
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                      <button
                        type="button"
                        className="btn btn-xs btn-outline flex items-center gap-1"
                        style={{ borderRadius: 10, fontWeight: 700 }}
                        onClick={() => {
                          setSelectedClientForCash(client);
                          setCashAmount(String(client.currentBalance));
                        }}
                      >
                        <IconCoins size={12} />
                        <span>Encaisser Règlement</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-xs btn-primary flex items-center gap-1"
                        style={{ borderRadius: 10, fontWeight: 700 }}
                        onClick={() => {
                          setSelectedClientForOrder(client);
                          setFieldDiscountPercent(client.tierDiscountPercent || 5);
                          setActiveTab('new_order');
                        }}
                      >
                        <IconPlus size={12} />
                        <span>Prendre Commande</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: ON-SITE ORDER TAKING & MARGIN SIMULATOR */}
        {activeTab === 'new_order' && (
          <div className="flex flex-col gap-3">
            {/* Selected Client Card */}
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="text-xs font-bold text-blue-300">
                  Client : {selectedClientForOrder ? selectedClientForOrder.name : 'Veuillez sélectionner un client'}
                </div>
                {selectedClientForOrder && (
                  <div className="text-[11px] text-muted">
                    Solde actuel : {selectedClientForOrder.currentBalance.toLocaleString('fr-DZ')} DA • Remise habituelle : {selectedClientForOrder.tierDiscountPercent}%
                  </div>
                )}
              </div>

              {!selectedClientForOrder && (
                <select
                  className="select select-xs text-xs font-bold"
                  onChange={(e) => {
                    const c = clients.find((x) => x.name === e.target.value);
                    if (c) {
                      setSelectedClientForOrder(c);
                      setFieldDiscountPercent(c.tierDiscountPercent || 5);
                    }
                  }}
                  style={{ borderRadius: 8 }}
                >
                  <option value="">Sélectionner un client...</option>
                  {clients.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Quick Catalog for On-site Order */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {QUICK_FIELD_PRODUCTS.map((prod) => (
                <div
                  key={prod.reference}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div className="font-mono font-bold text-xs text-white">{prod.reference}</div>
                    <div className="text-[11px] text-muted truncate max-w-[180px]">{prod.designation}</div>
                    <div className="font-mono text-xs font-bold text-accent mt-0.5">
                      {prod.wholesalePrice?.toLocaleString('fr-DZ')} DA
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-xs btn-primary flex items-center gap-1"
                    style={{ borderRadius: 8, fontWeight: 700 }}
                    onClick={() => handleAddToFieldCart(prod, 1)}
                  >
                    <IconPlus size={11} />
                    <span>+1 Carton</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Live Cart & Margin Health Cockpit */}
            {fieldCart.length > 0 && (
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-white">Articles en cours ({fieldCart.length})</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted font-bold">Remise accordée :</span>
                    <input
                      type="number"
                      className="input input-xs font-mono font-bold"
                      style={{ width: 60, borderRadius: 6 }}
                      value={fieldDiscountPercent}
                      onChange={(e) => setFieldDiscountPercent(Number(e.target.value))}
                    />
                    <span className="text-xs text-muted">%</span>
                  </div>
                </div>

                {/* Items in field cart */}
                <div className="flex flex-col gap-1.5">
                  {fieldCart.map((it) => (
                    <div key={it.reference} className="flex justify-between items-center text-xs py-1 border-b border-white/5">
                      <div>
                        <span className="font-mono font-bold">{it.reference}</span> x {it.quantity} ctn
                      </div>
                      <span className="font-mono font-bold text-accent">{it.totalPrice.toLocaleString('fr-DZ')} DA</span>
                    </div>
                  ))}
                </div>

                {/* Live Margin Safety Gauge */}
                <div
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    backgroundColor:
                      marginSimulation.marginHealth === 'excellent'
                        ? 'rgba(16, 185, 129, 0.1)'
                        : marginSimulation.marginHealth === 'healthy'
                        ? 'rgba(59, 130, 246, 0.1)'
                        : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${
                      marginSimulation.marginHealth === 'excellent'
                        ? 'rgba(16, 185, 129, 0.3)'
                        : marginSimulation.marginHealth === 'healthy'
                        ? 'rgba(59, 130, 246, 0.3)'
                        : 'rgba(239, 68, 68, 0.4)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div className="text-[10px] text-muted uppercase font-bold">Simulateur Marge Nette</div>
                    <div className="text-xs font-extrabold text-white">
                      Bénéfice Net : {marginSimulation.netProfitDa.toLocaleString('fr-DZ')} DA ({marginSimulation.marginPercent}%)
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '3px 8px',
                      borderRadius: 9999,
                      fontWeight: 800,
                      backgroundColor:
                        marginSimulation.marginHealth === 'excellent'
                          ? 'var(--accent)'
                          : marginSimulation.marginHealth === 'healthy'
                          ? '#3b82f6'
                          : 'var(--danger)',
                      color: '#000',
                    }}
                  >
                    {marginSimulation.marginHealth === 'excellent'
                      ? 'Excellente Marge'
                      : marginSimulation.marginHealth === 'healthy'
                      ? 'Marge Conforme'
                      : 'Marge Trop Serrée'}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <div className="text-sm font-extrabold text-white font-mono">
                    Total : {marginSimulation.finalRevenueDa.toLocaleString('fr-DZ')} DA
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary flex items-center gap-1.5"
                    style={{ borderRadius: 12, fontWeight: 800 }}
                    onClick={handleTransmitFieldOrder}
                  >
                    <IconCheck size={14} />
                    <span>Valider & Transmettre Quai</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COLLECTIONS HISTORY */}
        {activeTab === 'collections_history' && (
          <div className="flex flex-col gap-2.5">
            {collections.length === 0 ? (
              <div className="text-center py-12 text-muted text-xs">
                Aucun encaissement enregistré pour le moment.
              </div>
            ) : (
              collections.map((col, idx) => (
                <div
                  key={col.id || idx}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div className="font-extrabold text-xs text-white">{col.clientName}</div>
                    <div className="text-[11px] text-muted">
                      Par {col.repName} • {new Date(col.collectedAt).toLocaleDateString('fr-DZ')} {col.checkNumber ? `(Chèque N° ${col.checkNumber})` : '(Espèces)'}
                    </div>
                  </div>
                  <div className="font-mono font-extrabold text-xs text-emerald-400">
                    +{col.amount.toLocaleString('fr-DZ')} DA
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Cash Collection Modal */}
      {selectedClientForCash && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
        >
          <div
            className="w-full max-w-sm p-4 rounded-2xl flex flex-col gap-3"
            style={{ backgroundColor: '#16171b', border: '1px solid rgba(16, 185, 129, 0.3)' }}
          >
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <div className="font-extrabold text-sm text-white flex items-center gap-1.5">
                <IconCoins size={16} className="text-emerald-400" />
                <span>Encaisser Règlement</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setSelectedClientForCash(null)}
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-muted">
              Client : <span className="font-bold text-white">{selectedClientForCash.name}</span>
              <br />
              Créance actuelle : <span className="font-mono font-bold text-rose-400">{selectedClientForCash.currentBalance.toLocaleString('fr-DZ')} DA</span>
            </div>

            <form onSubmit={handleSavePayment} className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-muted uppercase font-bold block mb-1">Montant Encaissé (DA)</label>
                <input
                  type="number"
                  className="input input-sm w-full font-mono font-bold text-sm"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="Ex: 150000"
                  required
                  style={{ borderRadius: 10 }}
                />
              </div>

              <div>
                <label className="text-[10px] text-muted uppercase font-bold block mb-1">Mode de Règlement</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`btn btn-sm ${paymentMethod === 'especes' ? 'btn-primary' : 'btn-ghost border border-white/10'}`}
                    onClick={() => setPaymentMethod('especes')}
                    style={{ borderRadius: 10 }}
                  >
                    Espèces
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${paymentMethod === 'cheque' ? 'btn-primary' : 'btn-ghost border border-white/10'}`}
                    onClick={() => setPaymentMethod('cheque')}
                    style={{ borderRadius: 10 }}
                  >
                    Chèque
                  </button>
                </div>
              </div>

              {paymentMethod === 'cheque' && (
                <div>
                  <label className="text-[10px] text-muted uppercase font-bold block mb-1">N° de Chèque</label>
                  <input
                    type="text"
                    className="input input-sm w-full font-mono text-xs"
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                    placeholder="Ex: CHQ-992144"
                    style={{ borderRadius: 10 }}
                  />
                </div>
              )}

              <button
                type="submit"
                className="btn btn-sm btn-primary w-full flex items-center justify-center gap-1.5 mt-2"
                style={{ borderRadius: 12, fontWeight: 800, minHeight: 44 }}
              >
                <IconCheck size={14} />
                <span>Confirmer Encaissement & Réduire Créance</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Executive Switcher */}
      <AppModuleSwitcher />
    </div>
  );
};
