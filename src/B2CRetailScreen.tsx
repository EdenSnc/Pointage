// ============================================================
// POINTAGE — UI 3: Clients Ordering in Details (B2C Retail Store)
// Unit School & Office Supplies, Curated Rentrée Bundles & Pickup
// ============================================================

import React, { useState, useMemo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveOrderDraft } from './db';
import type { OrderDraft, OrderItem } from './types';
import { PRESET_RETAIL_BUNDLES, RetailBundle } from './decisionEngine';
import { AppModuleSwitcher } from './AppModuleSwitcher';
import {
  IconBag,
  IconSearch,
  IconCheck,
  IconPlus,
  IconSparkles,
  IconClipboardCheck,
  IconArrowLeft,
  IconStore,
  IconTag,
} from './icons';
import { playSuccessChime, playWarningBeep, hapticTap } from './audio';

interface RetailProduct {
  reference: string;
  designation: string;
  category: 'cahiers' | 'ecriture' | 'trousses' | 'calculatrices' | 'autre';
  unitRetailPrice: number; // DA
  inStock: boolean;
}

const RETAIL_CATALOG: RetailProduct[] = [
  { reference: 'CAH-96P-01', designation: 'Cahier 96 Pages Seyès 24x32', category: 'cahiers', unitRetailPrice: 85, inStock: true },
  { reference: 'CAH-192P-01', designation: 'Cahier 192 Pages Seyès Grand Format', category: 'cahiers', unitRetailPrice: 160, inStock: true },
  { reference: 'CAH-288P-01', designation: 'Cahier 288 Pages Seyès Registre', category: 'cahiers', unitRetailPrice: 240, inStock: true },
  { reference: 'STY-BLU-01', designation: 'Stylo Roller Gel Bleu 0.7mm SBM', category: 'ecriture', unitRetailPrice: 90, inStock: true },
  { reference: 'STY-BLU-04', designation: 'Set 4 Stylos Roller (Bleu, Noir, Rouge, Vert)', category: 'ecriture', unitRetailPrice: 320, inStock: true },
  { reference: 'SURL-SET-04', designation: 'Set 4 Surligneurs Fluo Pastel', category: 'ecriture', unitRetailPrice: 330, inStock: true },
  { reference: 'TROU-OXF-01', designation: 'Trousse Oxford Double Compartiment Bleu', category: 'trousses', unitRetailPrice: 390, inStock: true },
  { reference: 'TROU-SCO-01', designation: 'Trousse Souple Peluche Motif Enfant', category: 'trousses', unitRetailPrice: 350, inStock: true },
  { reference: 'CALC-SCI-82', designation: 'Calculatrice Scientifique FX-82 (Collège & Lycée)', category: 'calculatrices', unitRetailPrice: 1840, inStock: true },
  { reference: 'COMP-MET-01', designation: 'Compas Métallique de Précision avec Bague', category: 'calculatrices', unitRetailPrice: 450, inStock: true },
  { reference: 'ARD-EFF-01', designation: 'Ardoise Blanche Double Face Effaçable', category: 'autre', unitRetailPrice: 280, inStock: true },
  { reference: 'CRAY-COL-12', designation: 'Boite 12 Crayons de Couleur Bois de Cèdre', category: 'ecriture', unitRetailPrice: 420, inStock: true },
];

interface B2CRetailScreenProps {
  setToast: (msg: string) => void;
}

export const B2CRetailScreen: React.FC<B2CRetailScreenProps> = ({ setToast }) => {
  const navigate = useNavigate();

  // State
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showCartDrawer, setShowCartDrawer] = useState(false);

  // Customer Checkout Info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<'showroom_pickup' | 'delivery'>('showroom_pickup');
  const [customerCommune, setCustomerCommune] = useState('Oran');

  // Cart totals
  const cartTotals = useMemo(() => {
    const totalItems = cart.reduce((sum, it) => sum + it.quantity, 0);
    const totalAmountDa = cart.reduce((sum, it) => sum + it.totalPrice, 0);
    return { totalItems, totalAmountDa };
  }, [cart]);

  // Add individual item to retail cart
  const handleAddToCart = (product: RetailProduct, qty = 1) => {
    hapticTap('light');
    playSuccessChime();
    setCart((prev) => {
      const existing = prev.find((it) => it.reference === product.reference);
      if (existing) {
        return prev.map((it) =>
          it.reference === product.reference
            ? { ...it, quantity: it.quantity + qty, totalPrice: (it.quantity + qty) * it.unitPrice }
            : it
        );
      }
      return [
        ...prev,
        {
          reference: product.reference,
          designation: product.designation,
          unitPrice: product.unitRetailPrice,
          quantity: qty,
          totalPrice: product.unitRetailPrice * qty,
        },
      ];
    });
    setToast(`+${qty} ${product.reference} ajouté au panier.`);
  };

  // Add entire bundled kit to cart
  const handleAddBundleToCart = (bundle: RetailBundle) => {
    hapticTap('heavy');
    playSuccessChime();
    setCart((prev) => {
      let nextCart = [...prev];
      for (const bItem of bundle.items) {
        const existing = nextCart.find((it) => it.reference === bItem.reference);
        if (existing) {
          nextCart = nextCart.map((it) =>
            it.reference === bItem.reference
              ? { ...it, quantity: it.quantity + bItem.quantity, totalPrice: (it.quantity + bItem.quantity) * it.unitPrice }
              : it
          );
        } else {
          nextCart.push({ ...bItem });
        }
      }
      return nextCart;
    });
    setToast(`${bundle.name} ajouté ! Économie réalisée : ${bundle.savingsDa.toLocaleString('fr-DZ')} DA`);
  };

  // Update item quantity
  const handleUpdateQty = (reference: string, delta: number) => {
    hapticTap('selection');
    setCart((prev) =>
      prev
        .map((it) => {
          if (it.reference !== reference) return it;
          const next = it.quantity + delta;
          if (next <= 0) return null;
          return { ...it, quantity: next, totalPrice: next * it.unitPrice };
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  // Filtered catalog
  const filteredCatalog = useMemo(() => {
    let list = RETAIL_CATALOG;
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      list = list.filter(
        (p) => p.reference.toLowerCase().includes(q) || p.designation.toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedCategory, deferredSearch]);

  // Transmit Retail Order
  const handleCheckoutOrder = async () => {
    if (cart.length === 0) {
      playWarningBeep();
      setToast('Votre panier est vide.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      playWarningBeep();
      setToast('Veuillez renseigner votre nom et numéro de téléphone.');
      return;
    }

    const orderNumber = `DET-${Date.now().toString().slice(-5)}`;
    const orderData: Omit<OrderDraft, 'id' | 'createdAt' | 'updatedAt'> = {
      orderNumber,
      channel: 'detail',
      clientName: customerName.trim(),
      clientPhone: customerPhone.trim(),
      clientWilaya: customerCommune.trim(),
      items: cart,
      totalUnits: cartTotals.totalItems,
      subtotalAmount: cartTotals.totalAmountDa,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: cartTotals.totalAmountDa,
      status: 'transmitted_to_warehouse',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      notes: `Commande détail client (${deliveryType === 'showroom_pickup' ? 'Retrait Showroom Dépôt' : 'Livraison à domicile'})`,
    };

    await saveOrderDraft(orderData);
    playSuccessChime();
    hapticTap('heavy');
    setToast(`Commande ${orderNumber} confirmée ! Préparation immédiate.`);
    setCart([]);
    setShowCartDrawer(false);
  };

  // WhatsApp order share
  const handleCopyWhatsAppOrder = () => {
    const lines = [
      '========================================',
      'COMMANDE FOURNITURES SCOLAIRES (DETAIL)',
      `CLIENT : ${customerName || 'Client Particulier'}`,
      `TEL : ${customerPhone || 'Non spécifié'}`,
      `MODE : ${deliveryType === 'showroom_pickup' ? 'Retrait Showroom' : `Livraison ${customerCommune}`}`,
      `DATE : ${new Date().toLocaleDateString('fr-DZ')}`,
      '========================================',
      '',
      'ARTICLES CHOISIS :',
    ];

    cart.forEach((it, idx) => {
      lines.push(`${idx + 1}. [${it.reference}] ${it.designation}`);
      lines.push(`   ${it.quantity} pc(s) x ${it.unitPrice} DA = ${it.totalPrice.toLocaleString('fr-DZ')} DA`);
    });

    lines.push('');
    lines.push('----------------------------------------');
    lines.push(`TOTAL A PAYER : ${cartTotals.totalAmountDa.toLocaleString('fr-DZ')} DA`);
    lines.push('========================================');

    navigator.clipboard.writeText(lines.join('\n'));
    playSuccessChime();
    hapticTap('medium');
    setToast('Commande copiée pour envoi sur WhatsApp.');
  };

  return (
    <div
      className="b2c-retail-screen min-h-screen pb-24 text-white"
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
                <IconBag size={16} className="text-amber-400" />
                <span>Boutique Fournitures & Rentrée (Détail)</span>
              </div>
              <div className="text-[11px] text-muted">
                Vente au détail • Packs scolaires économiques • Retrait Showroom ou Livraison
              </div>
            </div>
          </div>

          {/* Cart Trigger */}
          <button
            type="button"
            className="btn btn-sm btn-primary flex items-center gap-2"
            style={{ borderRadius: 14, fontWeight: 800, padding: '6px 14px' }}
            onClick={() => setShowCartDrawer(!showCartDrawer)}
          >
            <IconBag size={15} />
            <span>Panier ({cartTotals.totalItems})</span>
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
                {cartTotals.totalAmountDa.toLocaleString('fr-DZ')} DA
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-3 flex flex-col gap-4">
        {/* Bundles / Packs Rentrée Scolaire Économiques */}
        <div>
          <div className="text-xs font-extrabold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <IconSparkles size={14} className="text-amber-400" />
            <span>Packs Rentrée Économiques (Tout-en-un avec Remise)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PRESET_RETAIL_BUNDLES.map((bundle) => (
              <div
                key={bundle.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 18,
                  backgroundColor: 'rgba(245, 158, 11, 0.04)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <div className="flex items-center justify-between">
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
                      {bundle.targetAudience}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-bold">
                      Économisez {bundle.savingsDa} DA
                    </span>
                  </div>
                  <div className="font-extrabold text-sm text-white mt-1.5">{bundle.name}</div>
                  <div className="text-[11px] text-muted mt-1 leading-snug">{bundle.description}</div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div>
                    <span className="text-xs text-muted line-through mr-1 font-mono">
                      {bundle.originalPriceDa} DA
                    </span>
                    <span className="font-mono font-extrabold text-sm text-accent">
                      {bundle.priceDa.toLocaleString('fr-DZ')} DA
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-xs btn-primary flex items-center gap-1"
                    style={{ borderRadius: 10, fontWeight: 700 }}
                    onClick={() => handleAddBundleToCart(bundle)}
                  >
                    <IconPlus size={12} />
                    <span>Ajouter Pack</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search & Categories */}
        <div className="flex flex-col md:flex-row gap-2 mt-1">
          <div className="relative flex-1">
            <IconSearch size={14} className="absolute left-3 top-3 text-muted" />
            <input
              type="text"
              className="input input-sm w-full pl-9 text-xs"
              placeholder="Rechercher stylos, cahiers, trousses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' }}
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'Tout' },
              { id: 'cahiers', label: 'Cahiers' },
              { id: 'ecriture', label: 'Stylos & Dessin' },
              { id: 'trousses', label: 'Trousses' },
              { id: 'calculatrices', label: 'Calculatrices' },
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

        {/* Retail Items Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {filteredCatalog.map((prod) => {
            const inCart = cart.find((it) => it.reference === prod.reference);
            return (
              <div
                key={prod.reference}
                style={{
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div>
                  <div className="font-mono text-[10px] text-muted font-bold">{prod.reference}</div>
                  <div className="text-xs font-semibold text-white/90 line-clamp-2 mt-0.5">
                    {prod.designation}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                  <div className="font-mono font-extrabold text-xs text-accent">
                    {prod.unitRetailPrice} DA
                  </div>

                  {inCart ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-xs btn-circle btn-ghost"
                        onClick={() => handleUpdateQty(prod.reference, -1)}
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-bold">{inCart.quantity}</span>
                      <button
                        type="button"
                        className="btn btn-xs btn-circle btn-primary"
                        onClick={() => handleUpdateQty(prod.reference, 1)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-xs btn-primary flex items-center gap-1"
                      style={{ borderRadius: 8, fontWeight: 700 }}
                      onClick={() => handleAddToCart(prod, 1)}
                    >
                      <IconPlus size={11} />
                      <span>Ajouter</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cart & Checkout Drawer */}
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
                <IconBag size={16} className="text-amber-400" />
                <span>Panier Détail ({cartTotals.totalItems} articles)</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setShowCartDrawer(false)}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-2">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-muted text-xs">
                  Votre panier est vide.
                </div>
              ) : (
                cart.map((it) => (
                  <div
                    key={it.reference}
                    className="p-2 rounded-xl bg-white/[0.03] border border-white/5 flex justify-between items-center text-xs"
                  >
                    <div>
                      <div className="font-bold text-white truncate max-w-[200px]">{it.designation}</div>
                      <div className="text-[10px] text-muted">
                        {it.quantity} x {it.unitPrice} DA
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-accent">{it.totalPrice} DA</span>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost btn-circle"
                        onClick={() => handleUpdateQty(it.reference, -1)}
                      >
                        -
                      </button>
                      <span className="font-mono font-bold">{it.quantity}</span>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost btn-circle"
                        onClick={() => handleUpdateQty(it.reference, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Customer Delivery Form */}
            {cart.length > 0 && (
              <div className="pt-3 border-t border-white/10 flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="input input-xs text-xs"
                    placeholder="Votre Nom *"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    style={{ borderRadius: 8 }}
                  />
                  <input
                    type="tel"
                    className="input input-xs text-xs font-mono"
                    placeholder="Téléphone (ex: 0550...)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    style={{ borderRadius: 8 }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`btn btn-xs ${deliveryType === 'showroom_pickup' ? 'btn-primary' : 'btn-ghost border border-white/10'}`}
                    onClick={() => setDeliveryType('showroom_pickup')}
                    style={{ borderRadius: 8 }}
                  >
                    Retrait Showroom (Gratuit)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${deliveryType === 'delivery' ? 'btn-primary' : 'btn-ghost border border-white/10'}`}
                    onClick={() => setDeliveryType('delivery')}
                    style={{ borderRadius: 8 }}
                  >
                    Livraison Domicile
                  </button>
                </div>

                <div className="flex justify-between items-center text-sm font-extrabold text-white pt-2 border-t border-white/5">
                  <span>Total Net :</span>
                  <span className="font-mono text-accent">{cartTotals.totalAmountDa.toLocaleString('fr-DZ')} DA</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline flex items-center justify-center gap-1"
                    style={{ borderRadius: 10, fontWeight: 700 }}
                    onClick={handleCopyWhatsAppOrder}
                  >
                    <IconClipboardCheck size={14} />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary flex items-center justify-center gap-1"
                    style={{ borderRadius: 10, fontWeight: 800 }}
                    onClick={handleCheckoutOrder}
                  >
                    <IconCheck size={14} />
                    <span>Valider Commande</span>
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
