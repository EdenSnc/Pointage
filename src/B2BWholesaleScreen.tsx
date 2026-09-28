// ============================================================
// POINTAGE — UI 1: Clients Ordering in Gros (B2B Wholesale Portal)
// High-Value Carton/Colis Ordering, Volume Discount Tiers & Reassort
// Built-in Financial Decision Support (Aide à la Décision)
// ============================================================

import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  db,
  getAllClientAccounts,
  saveOrderDraft,
  seedInitialBusinessDataIfEmpty,
} from './db';
import type {
  ClientAccount,
  OrderItem,
  ProductProfile,
  OrderDraft,
} from './types';
import { analyzeB2BOrderOpportunities } from './decisionEngine';
import { AppModuleSwitcher } from './AppModuleSwitcher';
import {
  IconBox,
  IconSearch,
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
} from './icons';
import { playSuccessChime, playWarningBeep, hapticTap } from './audio';

// Mock high-volume wholesale catalog for stationery
const INITIAL_B2B_CATALOG: ProductProfile[] = [
  {
    reference: 'CAH-96P-SBM',
    designation: 'Cahier 96 Pages Seyès SBM (Carton de 80 pcs)',
    category: 'scolaire',
    outerPackSize: 80,
    innerPackSize: 10,
    wholesalePrice: 6800, // 85 DA/pc * 80 pcs
    retailPrice: 9600, // 120 DA/pc * 80 pcs
    purchasePrice: 5100,
    isGoldenProduct: true,
    warehouseZone: null,
    stockQty: 450,
    updatedAt: new Date().toISOString(),
  },
  {
    reference: 'CAH-192P-SBM',
    designation: 'Cahier 192 Pages Seyès Grand Format (Carton de 40 pcs)',
    category: 'scolaire',
    outerPackSize: 40,
    innerPackSize: 5,
    wholesalePrice: 6200,
    retailPrice: 8400,
    purchasePrice: 4700,
    isGoldenProduct: false,
    warehouseZone: null,
    stockQty: 320,
    updatedAt: new Date().toISOString(),
  },
  {
    reference: 'STY-BOX-50',
    designation: 'Boite 50 Stylos Roller Gel Bleu 0.7mm',
    category: 'scolaire',
    outerPackSize: 20, // 20 boites par carton
    innerPackSize: 1,
    wholesalePrice: 4800,
    retailPrice: 7000,
    purchasePrice: 3400,
    isGoldenProduct: true,
    warehouseZone: null,
    stockQty: 600,
    updatedAt: new Date().toISOString(),
  },
  {
    reference: 'PAP-A4-80G',
    designation: 'Carton 5 Ramettes Papier Repro A4 80g (2500 feuilles)',
    category: 'bureautique',
    outerPackSize: 5,
    innerPackSize: 1,
    wholesalePrice: 3550,
    retailPrice: 4500,
    purchasePrice: 2850,
    isGoldenProduct: false,
    warehouseZone: null,
    stockQty: 800,
    updatedAt: new Date().toISOString(),
  },
  {
    reference: 'TROU-OXF-01',
    designation: 'Carton 24 Trousses Oxford Double Compartiment',
    category: 'scolaire',
    outerPackSize: 24,
    innerPackSize: 6,
    wholesalePrice: 6240, // 260 DA/pc
    retailPrice: 9360, // 390 DA/pc
    purchasePrice: 4400,
    isGoldenProduct: true,
    warehouseZone: null,
    stockQty: 210,
    updatedAt: new Date().toISOString(),
  },
  {
    reference: 'CALC-SCI-82',
    designation: 'Carton 20 Calculatrices Scientifiques FX-82',
    category: 'scolaire',
    outerPackSize: 20,
    innerPackSize: 5,
    wholesalePrice: 29000,
    retailPrice: 39000,
    purchasePrice: 22000,
    isGoldenProduct: true,
    warehouseZone: null,
    stockQty: 95,
    updatedAt: new Date().toISOString(),
  },
  {
    reference: 'CLAS-DOS-80',
    designation: 'Carton 15 Classeurs Dos 80mm Plastifiés Renforcés',
    category: 'bureautique',
    outerPackSize: 15,
    innerPackSize: 1,
    wholesalePrice: 4950,
    retailPrice: 6750,
    purchasePrice: 3700,
    isGoldenProduct: false,
    warehouseZone: null,
    stockQty: 180,
    updatedAt: new Date().toISOString(),
  },
];

interface B2BWholesaleScreenProps {
  setToast: (msg: string) => void;
}

export const B2BWholesaleScreen: React.FC<B2BWholesaleScreenProps> = ({ setToast }) => {
  const navigate = useNavigate();

  // State
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [selectedClientName, setSelectedClientName] = useState<string>('Benali Grossiste Maraval');
  const [catalog, setCatalog] = useState<ProductProfile[]>(INITIAL_B2B_CATALOG);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showCartDrawer, setShowCartDrawer] = useState(false);

  // Initialize DB & Seed Data
  useEffect(() => {
    async function loadData() {
      await seedInitialBusinessDataIfEmpty();
      const accounts = await getAllClientAccounts();
      setClients(accounts);
      if (accounts.length > 0 && !accounts.some((a) => a.name === selectedClientName)) {
        setSelectedClientName(accounts[0].name);
      }
    }
    loadData();
  }, []);

  const selectedClient = useMemo(() => {
    return clients.find((c) => c.name === selectedClientName) || clients[0];
  }, [clients, selectedClientName]);

  // Decision Support Engine calculations
  const decisionAnalysis = useMemo(() => {
    return analyzeB2BOrderOpportunities({
      items: cart,
      client: selectedClient,
      productCatalog: catalog,
    });
  }, [cart, selectedClient, catalog]);

  // Totals & Discount Calculations
  const cartTotals = useMemo(() => {
    const totalCartons = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotalDa = cart.reduce((sum, item) => sum + item.totalPrice, 0);

    // Tier discount from client profile + volume discount tier
    let discountPercent = selectedClient?.tierDiscountPercent || 0;
    if (decisionAnalysis.volumeUpsell && totalCartons >= 20) {
      discountPercent += decisionAnalysis.volumeUpsell.extraDiscountPercent;
    } else if (totalCartons >= 50) {
      discountPercent += 5;
    } else if (totalCartons >= 20) {
      discountPercent += 3;
    }

    const discountDa = Math.round(subtotalDa * (discountPercent / 100));
    const finalAmountDa = Math.max(0, subtotalDa - discountDa);

    return {
      totalCartons,
      subtotalDa,
      discountPercent,
      discountDa,
      finalAmountDa,
    };
  }, [cart, selectedClient, decisionAnalysis]);

  // Add item to wholesale cart
  const handleAddToCart = (product: ProductProfile, qtyToAdd = 1) => {
    hapticTap('light');
    playSuccessChime();
    setCart((prev) => {
      const existing = prev.find((it) => it.reference === product.reference);
      if (existing) {
        return prev.map((it) =>
          it.reference === product.reference
            ? {
                ...it,
                quantity: it.quantity + qtyToAdd,
                totalPrice: (it.quantity + qtyToAdd) * it.unitPrice,
              }
            : it
        );
      }
      return [
        ...prev,
        {
          reference: product.reference,
          designation: product.designation || product.reference,
          unitPrice: product.wholesalePrice || 5000,
          quantity: qtyToAdd,
          packSize: product.outerPackSize || 20,
          totalPrice: (product.wholesalePrice || 5000) * qtyToAdd,
          costPrice: product.purchasePrice || 3500,
        },
      ];
    });
    setToast(`+${qtyToAdd} carton(s) de ${product.reference} ajouté.`);
  };

  // Remove or update cart item
  const handleUpdateCartQty = (reference: string, delta: number) => {
    hapticTap('selection');
    setCart((prev) =>
      prev
        .map((it) => {
          if (it.reference !== reference) return it;
          const nextQty = it.quantity + delta;
          if (nextQty <= 0) return null;
          return {
            ...it,
            quantity: nextQty,
            totalPrice: nextQty * it.unitPrice,
          };
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  // Apply volume upsell recommendation directly in 1 tap
  const handleApplyVolumeUpsell = () => {
    if (!decisionAnalysis.volumeUpsell) return;
    const { neededCartons } = decisionAnalysis.volumeUpsell;
    // Add to the first item in cart
    if (cart.length > 0) {
      handleUpdateCartQty(cart[0].reference, neededCartons);
      playSuccessChime();
      hapticTap('heavy');
      setToast(`Palier débloqué : +${decisionAnalysis.volumeUpsell.extraDiscountPercent}% de remise appliquée !`);
    }
  };

  // Filtered catalog
  const filteredCatalog = useMemo(() => {
    let list = catalog;
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'golden') {
        list = list.filter((p) => p.isGoldenProduct);
      } else {
        list = list.filter((p) => p.category === selectedCategory);
      }
    }
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.reference.toLowerCase().includes(q) ||
          (p.designation && p.designation.toLowerCase().includes(q))
      );
    }
    return list;
  }, [catalog, selectedCategory, deferredSearch]);

  // Transmit order to warehouse & create draft
  const handleTransmitOrder = async () => {
    if (cart.length === 0) {
      playWarningBeep();
      setToast('Le panier est vide.');
      return;
    }

    const orderNumber = `BC-GROS-${Date.now().toString().slice(-5)}`;
    const orderData: Omit<OrderDraft, 'id' | 'createdAt' | 'updatedAt'> = {
      orderNumber,
      channel: 'gros',
      clientName: selectedClient?.name || 'Client Grossiste',
      clientPhone: selectedClient?.phone || null,
      clientWilaya: selectedClient?.wilaya || 'Oran',
      repName: selectedClient?.assignedRep || 'Dépôt Central',
      items: cart,
      totalUnits: cartTotals.totalCartons,
      subtotalAmount: cartTotals.subtotalDa,
      discountPercent: cartTotals.discountPercent,
      discountAmount: cartTotals.discountDa,
      finalAmount: cartTotals.finalAmountDa,
      status: 'transmitted_to_warehouse',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      notes: `Commande Gros B2B passée le ${new Date().toLocaleDateString('fr-DZ')}`,
    };

    await saveOrderDraft(orderData);
    playSuccessChime();
    hapticTap('heavy');
    setToast(`Commande Gros ${orderNumber} enregistrée & transmise au quai de préparation !`);
    setCart([]);
    setShowCartDrawer(false);
  };

  // WhatsApp formatted B2B order manifest (Zero emojis)
  const handleCopyWhatsAppBC = () => {
    const lines = [
      '========================================',
      'BON DE COMMANDE GROS - RECEPTION DEPOT',
      `CLIENT : ${selectedClient?.name.toUpperCase()}`,
      `DATE : ${new Date().toLocaleDateString('fr-DZ')}`,
      `TOTAL CARTONS : ${cartTotals.totalCartons}`,
      '========================================',
      '',
      'ARTICLES COMMANDES :',
    ];

    cart.forEach((it, idx) => {
      lines.push(`${idx + 1}. [${it.reference}] ${it.quantity} carton(s) x ${it.unitPrice.toLocaleString('fr-DZ')} DA`);
      lines.push(`   Sous-total : ${it.totalPrice.toLocaleString('fr-DZ')} DA`);
    });

    lines.push('');
    lines.push('----------------------------------------');
    lines.push(`Sous-total Brut : ${cartTotals.subtotalDa.toLocaleString('fr-DZ')} DA`);
    lines.push(`Remise Accordee (${cartTotals.discountPercent}%) : -${cartTotals.discountDa.toLocaleString('fr-DZ')} DA`);
    lines.push(`NET A PAYER : ${cartTotals.finalAmountDa.toLocaleString('fr-DZ')} DA`);
    lines.push('========================================');
    lines.push('Transmission directe quai preparation.');

    navigator.clipboard.writeText(lines.join('\n'));
    playSuccessChime();
    hapticTap('medium');
    setToast('Bon de Commande copié pour envoi WhatsApp.');
  };

  return (
    <div
      className="b2b-wholesale-screen min-h-screen pb-24 text-white"
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
                <IconBox size={16} className="text-blue-400" />
                <span>Espace Commandes Gros (B2B)</span>
              </div>
              <div className="text-[11px] text-muted">
                Conditionnement carton • Paliers volume • Approvisionnement dépôt
              </div>
            </div>
          </div>

          {/* Cart Counter Trigger */}
          <button
            type="button"
            className="btn btn-sm btn-primary flex items-center gap-2 relative"
            style={{ borderRadius: 14, fontWeight: 800, padding: '6px 14px' }}
            onClick={() => setShowCartDrawer(!showCartDrawer)}
          >
            <IconBox size={15} />
            <span>Panier ({cartTotals.totalCartons})</span>
            {cart.length > 0 && (
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '1px 6px',
                  borderRadius: 9999,
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  fontWeight: 900,
                }}
              >
                {cartTotals.finalAmountDa.toLocaleString('fr-DZ')} DA
              </span>
            )}
          </button>
        </div>

        {/* Client Account Selector & Credit Health Pill */}
        <div className="max-w-4xl mx-auto mt-2.5 pt-2.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <span className="text-[11px] text-muted font-bold uppercase shrink-0">Client B2B :</span>
            <select
              className="select select-xs flex-1 font-bold text-xs"
              value={selectedClientName}
              onChange={(e) => setSelectedClientName(e.target.value)}
              style={{ borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', color: '#ffffff' }}
            >
              {clients.map((c) => (
                <option key={c.id || c.name} value={c.name}>
                  {c.name} ({c.wilaya || 'Algérie'}) — Solde : {c.currentBalance.toLocaleString('fr-DZ')} DA
                </option>
              ))}
            </select>
          </div>

          {selectedClient && (
            <div className="flex items-center gap-2 text-xs">
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '3px 8px',
                  borderRadius: 9999,
                  backgroundColor:
                    selectedClient.currentBalance > selectedClient.creditLimit
                      ? 'rgba(239, 68, 68, 0.2)'
                      : 'rgba(16, 185, 129, 0.15)',
                  color:
                    selectedClient.currentBalance > selectedClient.creditLimit
                      ? 'var(--danger)'
                      : 'var(--accent)',
                  border: `1px solid ${
                    selectedClient.currentBalance > selectedClient.creditLimit
                      ? 'rgba(239, 68, 68, 0.4)'
                      : 'rgba(16, 185, 129, 0.3)'
                  }`,
                  fontWeight: 700,
                }}
              >
                Encours : {selectedClient.currentBalance.toLocaleString('fr-DZ')} / {selectedClient.creditLimit.toLocaleString('fr-DZ')} DA
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '3px 8px',
                  borderRadius: 9999,
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  fontWeight: 700,
                }}
              >
                Remise client : {selectedClient.tierDiscountPercent}%
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-3 flex flex-col gap-3">
        {/* Decision Support Banner: Financial Risk / Overdue Alert */}
        {decisionAnalysis.creditRisk && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 16,
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--danger)',
                flexShrink: 0,
              }}
            >
              <IconWarning size={20} />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-rose-400">
                {decisionAnalysis.creditRisk.title}
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                {decisionAnalysis.creditRisk.description}
              </div>
            </div>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '4px 10px',
                borderRadius: 8,
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#fff',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              Exiger Espèces
            </span>
          </div>
        )}

        {/* Decision Support Banner: Volume Discount Tier Upsell */}
        {decisionAnalysis.volumeUpsell && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 16,
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#3b82f6',
                  flexShrink: 0,
                }}
              >
                <IconTrendingUp size={20} />
              </div>
              <div>
                <div className="text-xs font-extrabold text-blue-300">
                  Palier Volume : +{decisionAnalysis.volumeUpsell.extraDiscountPercent}% de remise
                </div>
                <div className="text-[11px] text-muted">
                  Plus que {decisionAnalysis.volumeUpsell.neededCartons} carton(s) pour économiser +{decisionAnalysis.volumeUpsell.potentialGainDa.toLocaleString('fr-DZ')} DA sur tout le bon.
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-xs btn-primary flex items-center gap-1"
              style={{ borderRadius: 10, fontWeight: 700 }}
              onClick={handleApplyVolumeUpsell}
            >
              <IconSparkles size={12} />
              <span>Ajouter {decisionAnalysis.volumeUpsell.neededCartons} carton(s) (+{decisionAnalysis.volumeUpsell.extraDiscountPercent}%)</span>
            </button>
          </div>
        )}

        {/* Search Bar & Category Filters */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <IconSearch size={14} className="absolute left-3 top-3 text-muted" />
            <input
              type="text"
              className="input input-sm w-full pl-9 text-xs"
              placeholder="Rechercher par référence, désignation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' }}
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'Tout' },
              { id: 'scolaire', label: 'Scolaire' },
              { id: 'bureautique', label: 'Bureautique' },
              { id: 'golden', label: 'Articles Stars (Marge)' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`btn btn-xs ${selectedCategory === cat.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  hapticTap('selection');
                }}
                style={{ borderRadius: 9999, fontWeight: 700 }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Wholesale Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredCatalog.map((product) => {
            const inCart = cart.find((it) => it.reference === product.reference);
            return (
              <div
                key={product.reference}
                style={{
                  padding: '14px 16px',
                  borderRadius: 18,
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: product.isGoldenProduct
                    ? '1px solid rgba(245, 158, 11, 0.35)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-extrabold text-sm text-white">
                        {product.reference}
                      </span>
                      {product.isGoldenProduct && (
                        <span
                          style={{
                            fontSize: '0.62rem',
                            padding: '2px 6px',
                            borderRadius: 9999,
                            backgroundColor: 'rgba(245, 158, 11, 0.2)',
                            color: '#fbbf24',
                            fontWeight: 800,
                          }}
                        >
                          Produit Star
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-white/90 mt-0.5">
                      {product.designation}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-extrabold text-sm text-accent">
                      {product.wholesalePrice?.toLocaleString('fr-DZ')} DA
                    </div>
                    <div className="text-[10px] text-muted">
                      / carton ({product.outerPackSize} pcs)
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div className="text-[11px] text-muted">
                    Stock dépôt : <span className="font-mono font-bold text-white">{product.stockQty} ctn</span>
                  </div>

                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-xs btn-circle btn-ghost border border-white/10"
                        onClick={() => handleUpdateCartQty(product.reference, -1)}
                      >
                        -
                      </button>
                      <span className="font-mono font-extrabold text-xs text-white">
                        {inCart.quantity} ctn
                      </span>
                      <button
                        type="button"
                        className="btn btn-xs btn-circle btn-primary"
                        onClick={() => handleUpdateCartQty(product.reference, 1)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-xs btn-outline flex items-center gap-1"
                      style={{ borderRadius: 10, fontWeight: 700 }}
                      onClick={() => handleAddToCart(product, 1)}
                    >
                      <IconPlus size={12} />
                      <span>Ajouter Carton</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cart Drawer / Slide-Over Modal */}
      {showCartDrawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCartDrawer(false);
          }}
        >
          <div
            className="w-full max-w-md h-full flex flex-col p-4"
            style={{ backgroundColor: '#12141a', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="font-extrabold text-sm text-white flex items-center gap-2">
                <IconBox size={16} className="text-blue-400" />
                <span>Panier Gros — {selectedClient?.name}</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setShowCartDrawer(false)}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-2.5">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-muted text-xs">
                  Le panier est vide. Ajoutez des cartons depuis le catalogue.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.reference}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-mono font-bold text-xs text-white">{item.reference}</div>
                        <div className="text-[11px] text-muted truncate max-w-[200px]">{item.designation}</div>
                      </div>
                      <div className="font-mono font-bold text-xs text-accent">
                        {item.totalPrice.toLocaleString('fr-DZ')} DA
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
                      <div className="text-[10px] text-muted">
                        {item.quantity} carton(s) x {item.unitPrice.toLocaleString('fr-DZ')} DA
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost btn-circle"
                          onClick={() => handleUpdateCartQty(item.reference, -1)}
                        >
                          -
                        </button>
                        <span className="font-mono text-xs font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost btn-circle"
                          onClick={() => handleUpdateCartQty(item.reference, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Financial Summary */}
            {cart.length > 0 && (
              <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                <div className="flex justify-between text-xs text-muted">
                  <span>Sous-total Brut :</span>
                  <span className="font-mono">{cartTotals.subtotalDa.toLocaleString('fr-DZ')} DA</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-400">
                  <span>Remise ({cartTotals.discountPercent}%) :</span>
                  <span className="font-mono">-{cartTotals.discountDa.toLocaleString('fr-DZ')} DA</span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-white pt-1 border-t border-white/5">
                  <span>Net à Payer :</span>
                  <span className="font-mono text-accent">{cartTotals.finalAmountDa.toLocaleString('fr-DZ')} DA</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline flex items-center justify-center gap-1"
                    style={{ borderRadius: 12, fontWeight: 700 }}
                    onClick={handleCopyWhatsAppBC}
                  >
                    <IconClipboardCheck size={14} />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary flex items-center justify-center gap-1"
                    style={{ borderRadius: 12, fontWeight: 800 }}
                    onClick={handleTransmitOrder}
                  >
                    <IconCheck size={14} />
                    <span>Transmettre Quai</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Executive Switcher */}
      <AppModuleSwitcher />
    </div>
  );
};
