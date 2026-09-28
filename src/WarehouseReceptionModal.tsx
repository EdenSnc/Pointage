// ============================================================
// POINTAGE — Inbound Container Reception & Mismatch Reconciliation
// Réception Conteneurs & Fournitures Scolaires / Bureautique
// Fast Input for New & Existing Products, Discrepancy Tracking
// ============================================================

import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import {
  db,
  saveReceptionSession,
  getAllReceptionSessions,
  saveReceptionItem,
  getReceptionItemsBySession,
  deleteReceptionItem,
} from './db';
import { saveProductProfile, findProductProfileMatch } from './hooks';
import type { ReceptionSession, ReceptionItem, ProductProfile, WarehouseZone } from './types';
import {
  LOCATION_NOTE_PRESETS,
  DEFAULT_WAREHOUSE_SITES,
  formatLocationWithNote,
  getZoneShortLabel,
} from './warehouseZones';
import { LiveProductOcrModal } from './LiveProductOcrModal';
import {
  IconTruck,
  IconBox,
  IconCheck,
  IconWarning,
  IconPlus,
  IconSearch,
  IconX,
  IconTrash,
  IconPencil,
  IconMapPin,
  IconBuilding,
  IconClipboard,
  IconCamera,
  IconRefresh,
  IconBag,
  IconSparkles,
} from './icons';
import { AgentTourneeModal } from './AgentTourneeModal';
import { playSuccessChime, playWarningBeep, hapticTap } from './audio';

interface WarehouseReceptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOperator: string;
  onToast: (msg: string) => void;
  onOpenProductIntake?: () => void;
}

export const WarehouseReceptionModal: React.FC<WarehouseReceptionModalProps> = ({
  isOpen,
  onClose,
  activeOperator,
  onToast,
  onOpenProductIntake,
}) => {
  const [sessions, setSessions] = useState<ReceptionSession[]>([]);
  const [activeSession, setActiveSession] = useState<ReceptionSession | null>(null);
  const [items, setItems] = useState<ReceptionItem[]>([]);
  const [activeTab, setActiveTab] = useState<'console' | 'new_session' | 'history'>('console');
  const [filterMode, setFilterMode] = useState<'all' | 'discrepancies' | 'new_products' | 'conforming'>('all');

  // New session creation state
  const [sessionTitle, setSessionTitle] = useState('');
  const [containerNumber, setContainerNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [warehouseSite, setWarehouseSite] = useState('oran_surface');

  // Fast item input states
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [editingItem, setEditingItem] = useState<ReceptionItem | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);

  // Form item inputs
  const [itemRef, setItemRef] = useState('');
  const [itemEan, setItemEan] = useState('');
  const [itemDesignation, setItemDesignation] = useState('');
  const [itemExpectedQty, setItemExpectedQty] = useState<number>(0);
  const [itemOuterPack, setItemOuterPack] = useState<number>(24);
  const [itemInnerPack, setItemInnerPack] = useState<number>(1);
  const [itemCartons, setItemCartons] = useState<number>(0);
  const [itemLooseUnits, setItemLooseUnits] = useState<number>(0);
  const [itemDamagedQty, setItemDamagedQty] = useState<number>(0);
  const [itemZone, setItemZone] = useState<string>('CH_NW');
  const [itemLocationNote, setItemLocationNote] = useState<string>('');
  const [itemCategory, setItemCategory] = useState<'scolaire' | 'bureautique' | 'autre'>('scolaire');
  const [isNewCatalogProduct, setIsNewCatalogProduct] = useState(false);
  const [showLiveOcrModal, setShowLiveOcrModal] = useState(false);
  const [showAgentTourneeModal, setShowAgentTourneeModal] = useState(false);

  const refInputRef = useRef<HTMLInputElement>(null);

  // Load existing sessions
  const refreshSessions = async () => {
    try {
      const all = await getAllReceptionSessions();
      setSessions(all);
      const ongoing = all.find((s) => s.status === 'in_progress');
      if (ongoing) {
        setActiveSession(ongoing);
        loadItems(ongoing.id!);
      } else if (all.length > 0) {
        setActiveSession(all[0]);
        loadItems(all[0].id!);
      } else {
        setActiveTab('new_session');
      }
    } catch (e) {
      console.error('Failed to load reception sessions', e);
    }
  };

  const loadItems = async (sessionId: number) => {
    try {
      const sessionItems = await getReceptionItemsBySession(sessionId);
      setItems(sessionItems);
    } catch (e) {
      console.error('Failed to load reception items', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshSessions();
    }
  }, [isOpen]);

  // Total received units calculation from cartons + loose
  const calculatedReceivedUnits = useMemo(() => {
    const pack = Number(itemOuterPack) || 1;
    const ctns = Number(itemCartons) || 0;
    const loose = Number(itemLooseUnits) || 0;
    return ctns * pack + loose;
  }, [itemOuterPack, itemCartons, itemLooseUnits]);

  // Handle barcode / reference lookup for fast product auto-fill
  const handleLookupReference = async (refOrEan: string) => {
    const query = refOrEan.trim();
    if (!query) return;

    try {
      const match = await findProductProfileMatch(query, null);
      if (match) {
        hapticTap('light');
        setItemRef(match.reference);
        setItemDesignation(match.designation || '');
        if (match.outerPackSize) setItemOuterPack(match.outerPackSize);
        if (match.innerPackSize) setItemInnerPack(match.innerPackSize);
        if (match.warehouseZone) setItemZone(match.warehouseZone);
        if (match.locationNote) setItemLocationNote(match.locationNote);
        setIsNewCatalogProduct(false);
        onToast(`Article reconnu : ${match.reference}`);
      } else {
        setIsNewCatalogProduct(true);
      }
    } catch (err) {
      console.warn('Lookup failed', err);
    }
  };

  // Start new reception session
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTitle.trim()) return;

    hapticTap('medium');
    playSuccessChime();

    const id = await saveReceptionSession({
      title: sessionTitle.trim(),
      containerNumber: containerNumber.trim() || null,
      supplierName: supplierName.trim() || null,
      billNumber: billNumber.trim() || null,
      dockZone: 'Quai 1 (Principal)',
      warehouseSite: warehouseSite || 'oran_surface',
      status: 'in_progress',
      operator: activeOperator,
      startedAt: new Date().toISOString(),
    });

    const newSession = await db.receptionSessions.get(id);
    if (newSession) {
      setActiveSession(newSession);
      setItems([]);
      setActiveTab('console');
      onToast(`Session de réception créée : ${newSession.title}`);
    }
  };

  // Save received item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession?.id || !itemRef.trim()) return;

    hapticTap('medium');
    playSuccessChime();

    const totalReceived = calculatedReceivedUnits;

    const savedId = await saveReceptionItem({
      id: editingItem?.id,
      sessionId: activeSession.id,
      reference: itemRef.trim().toUpperCase(),
      ean: itemEan.trim() || null,
      designation: itemDesignation.trim() || `Article ${itemRef.trim()}`,
      expectedQty: Number(itemExpectedQty) || 0,
      receivedQty: totalReceived,
      damagedQty: Number(itemDamagedQty) || 0,
      outerPackSize: Number(itemOuterPack) || null,
      innerPackSize: Number(itemInnerPack) || null,
      receivedCartons: Number(itemCartons) || 0,
      receivedLooseUnits: Number(itemLooseUnits) || 0,
      warehouseZone: itemZone || null,
      locationNote: itemLocationNote.trim() || null,
      isNewProduct: isNewCatalogProduct,
      category: itemCategory,
      notes: null,
    });

    // Auto-integrate / update Master ProductProfile catalog!
    await saveProductProfile(itemRef.trim().toUpperCase(), {
      designation: itemDesignation.trim(),
      outerPackSize: Number(itemOuterPack) || null,
      innerPackSize: Number(itemInnerPack) || null,
      warehouseZone: (itemZone as WarehouseZone) || null,
      locationNote: itemLocationNote.trim() || null,
    });

    await loadItems(activeSession.id);
    resetItemForm();
    setShowItemForm(false);
    onToast(`Article ${itemRef.trim().toUpperCase()} enregistré et synchronisé au catalogue`);
  };

  const resetItemForm = () => {
    setEditingItem(null);
    setItemRef('');
    setItemEan('');
    setItemDesignation('');
    setItemExpectedQty(0);
    setItemOuterPack(24);
    setItemInnerPack(1);
    setItemCartons(0);
    setItemLooseUnits(0);
    setItemDamagedQty(0);
    setItemZone('CH_NW');
    setItemLocationNote('');
    setItemCategory('scolaire');
    setIsNewCatalogProduct(false);
  };

  const handleEditItem = (item: ReceptionItem) => {
    setEditingItem(item);
    setItemRef(item.reference);
    setItemEan(item.ean || '');
    setItemDesignation(item.designation);
    setItemExpectedQty(item.expectedQty);
    setItemOuterPack(item.outerPackSize || 24);
    setItemInnerPack(item.innerPackSize || 1);
    setItemCartons(item.receivedCartons || Math.floor(item.receivedQty / (item.outerPackSize || 24)));
    setItemLooseUnits(item.receivedLooseUnits || item.receivedQty % (item.outerPackSize || 24));
    setItemDamagedQty(item.damagedQty || 0);
    setItemZone(item.warehouseZone || 'CH_NW');
    setItemLocationNote(item.locationNote || '');
    setItemCategory(item.category || 'scolaire');
    setIsNewCatalogProduct(Boolean(item.isNewProduct));
    setShowItemForm(true);
  };

  const handleDeleteItem = async (id: number) => {
    hapticTap('heavy');
    await deleteReceptionItem(id);
    if (activeSession?.id) {
      await loadItems(activeSession.id);
    }
    onToast('Ligne supprimée');
  };

  // Discrepancy helper
  const getItemDiscrepancy = (item: ReceptionItem) => {
    if (item.expectedQty <= 0) return 'unexpected';
    if (item.receivedQty === item.expectedQty) return 'exact';
    if (item.receivedQty < item.expectedQty) return 'short';
    return 'over';
  };

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalExpected = 0;
    let totalReceived = 0;
    let totalDamaged = 0;
    let exactCount = 0;
    let shortCount = 0;
    let overCount = 0;
    let unexpectedCount = 0;
    let newProductsCount = 0;

    for (const it of items) {
      totalExpected += it.expectedQty || 0;
      totalReceived += it.receivedQty || 0;
      totalDamaged += it.damagedQty || 0;
      if (it.isNewProduct) newProductsCount++;

      const disc = getItemDiscrepancy(it);
      if (disc === 'exact') exactCount++;
      else if (disc === 'short') shortCount++;
      else if (disc === 'over') overCount++;
      else if (disc === 'unexpected') unexpectedCount++;
    }

    const totalLines = items.length;
    const conformityRate = totalLines > 0 ? Math.round((exactCount / totalLines) * 100) : 100;

    return {
      totalLines,
      totalExpected,
      totalReceived,
      totalDamaged,
      exactCount,
      shortCount,
      overCount,
      unexpectedCount,
      newProductsCount,
      conformityRate,
    };
  }, [items]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const q = deferredSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        it.reference.toLowerCase().includes(q) ||
        it.designation.toLowerCase().includes(q) ||
        (it.ean && it.ean.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      const disc = getItemDiscrepancy(it);
      if (filterMode === 'discrepancies') return disc === 'short' || disc === 'over' || disc === 'unexpected';
      if (filterMode === 'new_products') return Boolean(it.isNewProduct);
      if (filterMode === 'conforming') return disc === 'exact';
      return true;
    });
  }, [items, deferredSearch, filterMode]);

  // Generate WhatsApp / text reconciliation report
  const handleExportWhatsApp = () => {
    if (!activeSession) return;
    hapticTap('medium');

    const linesText = items
      .map((it) => {
        const disc = getItemDiscrepancy(it);
        const delta = it.receivedQty - it.expectedQty;
        const deltaText =
          disc === 'exact'
            ? 'CONFORME'
            : disc === 'short'
            ? `MANQUANT (${delta} pcs)`
            : disc === 'over'
            ? `EXCEDENT (+${delta} pcs)`
            : 'NON PREVU SUR FACTURE';
        return `* [${it.reference}] ${it.designation}\n   Attendu: ${it.expectedQty} | Reçu: ${it.receivedQty} (${deltaText})`;
      })
      .join('\n\n');

    const msg = `RAPPORT RECEPTION CONTENEURS — ${activeSession.title}
Conteneur(s): ${activeSession.containerNumber || 'N/A'}
Fournisseur: ${activeSession.supplierName || 'Non spécifié'}
BL/Manifeste: ${activeSession.billNumber || 'N/A'}
Date: ${new Date(activeSession.createdAt).toLocaleDateString('fr-FR')}
Responsable Quai: ${activeSession.operator}

BILAN PHYSIQUE VS FACTURE :
* Total Articles: ${metrics.totalLines}
* Total Pièces Attendues: ${metrics.totalExpected}
* Total Pièces Reçues: ${metrics.totalReceived} (Écart: ${metrics.totalReceived - metrics.totalExpected})
* Taux de Conformité: ${metrics.conformityRate}%
* Articles avec Manquants: ${metrics.shortCount}
* Articles en Excédent: ${metrics.overCount}
* Nouveaux Produits Intégrés: ${metrics.newProductsCount}
* Cartons/Pièces Avariés: ${metrics.totalDamaged}

DETAIL DES ARTICLES :
${linesText}

Procès-Verbal généré depuis Pointage Surface Entrepôt.`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        zIndex: 960,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 24,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
          padding: '16px 18px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-2.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                background: 'rgba(16, 185, 129, 0.18)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}
            >
              <IconTruck size={22} />
            </div>
            <div>
              <div className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
                Réception Conteneurs & Mismatch
              </div>
              <div className="text-[11px] text-muted flex items-center gap-2">
                <span>Fournitures Scolaires & Bureautique</span>
                <span>•</span>
                <span>Opérateur : {activeOperator}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-icon"
              style={{ borderRadius: 9999 }}
              onClick={onClose}
              aria-label="Fermer"
            >
              <IconX size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 my-2.5 shrink-0">
          <button
            type="button"
            className="btn btn-xs flex-1 flex items-center justify-center gap-1.5"
            style={{
              minHeight: 36,
              borderRadius: 12,
              fontWeight: 700,
              background: activeTab === 'console' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)',
              color: activeTab === 'console' ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            onClick={() => setActiveTab('console')}
          >
            <IconClipboard size={14} />
            <span>Console Pointage ({items.length})</span>
          </button>
          <button
            type="button"
            className="btn btn-xs flex items-center justify-center gap-1.5 px-3"
            style={{
              minHeight: 36,
              borderRadius: 12,
              fontWeight: 700,
              background: activeTab === 'new_session' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)',
              color: activeTab === 'new_session' ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            onClick={() => setActiveTab('new_session')}
          >
            <IconPlus size={14} />
            <span>Nouvel Arrivage</span>
          </button>
        </div>

        {/* TAB 1: CONSOLE */}
        {activeTab === 'console' && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1">
            {activeSession ? (
              <>
                {/* Active Session Info Bar */}
                <div
                  className="p-3"
                  style={{
                    borderRadius: 16,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-extrabold text-sm text-accent">
                        {activeSession.title}
                      </div>
                      <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                        <IconBox size={11} className="text-accent" />
                        <span>Conteneur(s) : {activeSession.containerNumber || 'Non spécifié'}</span>
                        {activeSession.supplierName && (
                          <>
                            <span>•</span>
                            <span>{activeSession.supplierName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="btn btn-xs btn-outline flex items-center gap-1"
                        style={{ borderRadius: 10, fontSize: '0.72rem', padding: '4px 10px', fontWeight: 700 }}
                        onClick={() => setShowAgentTourneeModal(true)}
                        title="Échantillons Showroom, Librairie El Feth & Agents à tourner"
                      >
                        <IconBag size={12} />
                        <span>Échantillons</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-primary flex items-center gap-1"
                        style={{ borderRadius: 10, fontSize: '0.72rem', padding: '4px 10px', fontWeight: 700 }}
                        onClick={handleExportWhatsApp}
                        title="Partager le rapport des écarts"
                      >
                        <IconClipboard size={12} />
                        <span>Rapport Écarts</span>
                      </button>
                    </div>
                  </div>

                  {/* Metrics Bar */}
                  <div className="grid grid-cols-4 gap-2 mt-2.5 pt-2.5 border-t border-white/10 text-center">
                    <div>
                      <div className="text-[10px] text-muted uppercase font-bold">Attendues</div>
                      <div className="font-mono font-extrabold text-xs text-white">
                        {metrics.totalExpected} pcs
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted uppercase font-bold">Reçues</div>
                      <div
                        className="font-mono font-extrabold text-xs"
                        style={{
                          color:
                            metrics.totalReceived === metrics.totalExpected
                              ? 'var(--accent)'
                              : metrics.totalReceived < metrics.totalExpected
                              ? 'var(--danger)'
                              : '#a855f7',
                        }}
                      >
                        {metrics.totalReceived} pcs
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted uppercase font-bold">Conformité</div>
                      <div className="font-mono font-extrabold text-xs text-accent">
                        {metrics.conformityRate}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted uppercase font-bold">Écarts</div>
                      <div className="font-mono font-extrabold text-xs text-warning">
                        {metrics.shortCount + metrics.overCount + metrics.unexpectedCount}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Primary Action Button: Input / Scan Product */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                    style={{
                      minHeight: 48,
                      borderRadius: 16,
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      boxShadow: '0 4px 16px rgba(16, 185, 129, 0.28)',
                    }}
                    onClick={() => {
                      resetItemForm();
                      setShowItemForm(true);
                      setTimeout(() => refInputRef.current?.focus(), 100);
                    }}
                  >
                    <IconPlus size={18} />
                    <span>Saisie Manuelle</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
                    style={{
                      minHeight: 48,
                      borderRadius: 16,
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      background: 'rgba(16, 185, 129, 0.16)',
                      border: '1px solid rgba(16, 185, 129, 0.45)',
                      color: '#34d399',
                    }}
                    onClick={() => setShowLiveOcrModal(true)}
                  >
                    <IconCamera size={18} />
                    <span>Photo OCR Carton</span>
                  </button>
                </div>

                {/* Search & Filter Chips */}
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      className="input w-full pl-8"
                      placeholder="Filtrer réf, EAN, désignation..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        height: 38,
                        borderRadius: 12,
                        fontSize: '0.8rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                      }}
                    />
                    <IconSearch
                      size={14}
                      className="absolute left-2.5 top-3 text-muted pointer-events-none"
                    />
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px] font-bold">
                  <button
                    type="button"
                    className="btn btn-xs px-2.5"
                    style={{
                      borderRadius: 9999,
                      background: filterMode === 'all' ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                      color: filterMode === 'all' ? '#fff' : 'var(--text-muted)',
                    }}
                    onClick={() => setFilterMode('all')}
                  >
                    Tous ({items.length})
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs px-2.5"
                    style={{
                      borderRadius: 9999,
                      background: filterMode === 'discrepancies' ? '#ef4444' : 'rgba(255,255,255,0.06)',
                      color: filterMode === 'discrepancies' ? '#fff' : 'var(--text-muted)',
                    }}
                    onClick={() => setFilterMode('discrepancies')}
                  >
                    Écarts ({metrics.shortCount + metrics.overCount + metrics.unexpectedCount})
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs px-2.5"
                    style={{
                      borderRadius: 9999,
                      background: filterMode === 'new_products' ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                      color: filterMode === 'new_products' ? '#fff' : 'var(--text-muted)',
                    }}
                    onClick={() => setFilterMode('new_products')}
                  >
                    Nouveaux ({metrics.newProductsCount})
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs px-2.5"
                    style={{
                      borderRadius: 9999,
                      background: filterMode === 'conforming' ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                      color: filterMode === 'conforming' ? '#fff' : 'var(--text-muted)',
                    }}
                    onClick={() => setFilterMode('conforming')}
                  >
                    Conformes ({metrics.exactCount})
                  </button>
                </div>

                {/* Items List */}
                <div className="flex flex-col gap-2">
                  {filteredItems.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted">
                      Aucun article dans cette vue. Cliquez sur « Saisir / Scanner » pour commencer.
                    </div>
                  ) : (
                    filteredItems.map((item) => {
                      const disc = getItemDiscrepancy(item);
                      const delta = item.receivedQty - item.expectedQty;

                      return (
                        <div
                          key={item.id}
                          className="p-3 flex items-start justify-between gap-2"
                          style={{
                            borderRadius: 16,
                            background: 'var(--bg-card)',
                            border:
                              disc === 'exact'
                                ? '1px solid rgba(16, 185, 129, 0.3)'
                                : disc === 'short'
                                ? '1px solid rgba(239, 68, 68, 0.4)'
                                : disc === 'over'
                                ? '1px solid rgba(168, 85, 247, 0.4)'
                                : '1px solid rgba(245, 158, 11, 0.4)',
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-extrabold text-xs text-white">
                                {item.reference}
                              </span>
                              {item.ean && (
                                <span className="font-mono text-[10px] text-muted">
                                  ({item.ean})
                                </span>
                              )}
                              {item.isNewProduct && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}
                                >
                                  Nouveau
                                </span>
                              )}
                              {item.category && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                                  style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}
                                >
                                  {item.category}
                                </span>
                              )}
                            </div>

                            <div className="font-bold text-xs text-white mt-1 truncate">
                              {item.designation}
                            </div>

                            {/* Location Badge */}
                            {(item.warehouseZone || item.locationNote) && (
                              <div className="text-[11px] text-muted flex items-center gap-1 mt-1">
                                <IconMapPin size={11} className="text-accent shrink-0" />
                                <span>
                                  {formatLocationWithNote(
                                    getZoneShortLabel(item.warehouseZone),
                                    item.locationNote
                                  )}
                                </span>
                              </div>
                            )}

                            {/* Packaging Breakdown */}
                            <div className="text-[11px] text-muted mt-1">
                              Colisage : {item.outerPackSize || '?'} pcs/ctn • Reçu :{' '}
                              <span className="font-bold text-white">
                                {item.receivedCartons || Math.floor(item.receivedQty / (item.outerPackSize || 1))} ctns
                              </span>
                              {item.receivedLooseUnits ? ` + ${item.receivedLooseUnits} vrac` : ''}
                              {item.damagedQty ? (
                                <span className="text-danger ml-2 font-bold">
                                  ({item.damagedQty} avariés)
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {/* Right: Quantities & Discrepancy Badge */}
                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            <div className="text-xs">
                              <span className="font-mono text-muted">{item.expectedQty} att.</span>
                              <span className="mx-1">→</span>
                              <span className="font-mono font-extrabold text-sm text-white">
                                {item.receivedQty} pcs
                              </span>
                            </div>

                            <span
                              className="text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1"
                              style={{
                                background:
                                  disc === 'exact'
                                    ? 'rgba(16, 185, 129, 0.2)'
                                    : disc === 'short'
                                    ? 'rgba(239, 68, 68, 0.2)'
                                    : disc === 'over'
                                    ? 'rgba(168, 85, 247, 0.2)'
                                    : 'rgba(245, 158, 11, 0.2)',
                                color:
                                  disc === 'exact'
                                    ? 'var(--accent)'
                                    : disc === 'short'
                                    ? 'var(--danger)'
                                    : disc === 'over'
                                    ? '#c084fc'
                                    : 'var(--warning)',
                              }}
                            >
                              {disc === 'exact' ? (
                                <>
                                  <IconCheck size={11} /> Conforme
                                </>
                              ) : disc === 'short' ? (
                                <>
                                  <IconWarning size={11} /> Manquant ({delta})
                                </>
                              ) : disc === 'over' ? (
                                <>
                                  <IconPlus size={11} /> Excédent (+{delta})
                                </>
                              ) : (
                                <>
                                  <IconWarning size={11} /> Inattendu (+{item.receivedQty})
                                </>
                              )}
                            </span>

                            <div className="flex items-center gap-1 mt-1">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs btn-icon"
                                onClick={() => handleEditItem(item)}
                                title="Modifier"
                              >
                                <IconPencil size={12} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs btn-icon text-danger"
                                onClick={() => item.id && handleDeleteItem(item.id)}
                                title="Supprimer"
                              >
                                <IconTrash size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-10">
                <IconTruck size={36} className="mx-auto text-muted mb-2 opacity-50" />
                <div className="font-bold text-sm text-white">Aucun arrivage actif</div>
                <button
                  type="button"
                  className="btn btn-primary mt-3"
                  onClick={() => setActiveTab('new_session')}
                >
                  Créer un Arrivage Conteneur
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: NEW SESSION FORM */}
        {activeTab === 'new_session' && (
          <form onSubmit={handleCreateSession} className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Nouvel Arrivage Marchandise / Conteneurs
            </div>

            <div>
              <label className="text-[11px] text-muted font-bold block mb-1">
                Titre de l'Arrivage * :
              </label>
              <input
                type="text"
                required
                className="input w-full"
                placeholder="Ex: Arrivage 3 Conteneurs Rentrée Scolaire 2026..."
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted font-bold block mb-1">
                  N° Conteneur(s) :
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Ex: MSKU983421, CMAU771239"
                  value={containerNumber}
                  onChange={(e) => setContainerNumber(e.target.value)}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>

              <div>
                <label className="text-[11px] text-muted font-bold block mb-1">
                  Fournisseur / Usine :
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Ex: SBM, Maped, Usine Oran..."
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted font-bold block mb-1">
                  N° Facture / BL Fournisseur :
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Ex: INV-2026-9921"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>

              <div>
                <label className="text-[11px] text-muted font-bold block mb-1">
                  Dépôt de Déchargement :
                </label>
                <select
                  className="input w-full"
                  value={warehouseSite}
                  onChange={(e) => setWarehouseSite(e.target.value)}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                    color: '#fff',
                  }}
                >
                  {DEFAULT_WAREHOUSE_SITES.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} ({site.wilaya})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full mt-4"
              style={{ minHeight: 48, borderRadius: 14, fontWeight: 800 }}
              disabled={!sessionTitle.trim()}
            >
              Lancer la Réception
            </button>
          </form>
        )}

        {/* MODAL: INPUT / EDIT ITEM DRAWER */}
        {showItemForm && (
          <div
            className="modal-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.88)',
              backdropFilter: 'blur(8px)',
              zIndex: 990,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
            }}
          >
            <div
              className="card"
              style={{
                width: '100%',
                maxWidth: 480,
                maxHeight: '92vh',
                overflowY: 'auto',
                borderRadius: 20,
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                padding: 18,
              }}
            >
              <div className="flex justify-between items-center mb-3">
                <div className="font-extrabold text-sm text-white">
                  {editingItem ? 'Modifier Article Reçu' : 'Saisir un Article Reçu'}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-icon"
                  onClick={() => setShowItemForm(false)}
                >
                  <IconX size={16} />
                </button>
              </div>

              {onOpenProductIntake && !editingItem && (
                <button
                  type="button"
                  className="btn btn-xs mb-2 flex items-center justify-center gap-1.5 w-full"
                  style={{
                    backgroundColor: 'rgba(168, 85, 247, 0.15)',
                    color: '#c084fc',
                    border: '1px dashed rgba(168, 85, 247, 0.4)',
                    borderRadius: 12,
                    padding: '8px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                  onClick={() => {
                    setShowItemForm(false);
                    onOpenProductIntake();
                  }}
                >
                  <IconSparkles size={14} />
                  <span>Article non catalogué ? Enregistrer avec IA (Zéro Erreur)</span>
                </button>
              )}

              <form onSubmit={handleSaveItem} className="flex flex-col gap-2.5">
                {/* Reference & Fast Lookup */}
                <div>
                  <label className="text-[11px] text-muted font-bold block mb-1">
                    Référence Produit * :
                  </label>
                  <div className="flex gap-2">
                    <input
                      ref={refInputRef}
                      type="text"
                      required
                      className="input flex-1 font-mono uppercase"
                      placeholder="Ex: 71662, ART-1012, CAHIER-96P..."
                      value={itemRef}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItemRef(val);
                      }}
                      onBlur={() => handleLookupReference(itemRef)}
                      style={{
                        height: 42,
                        borderRadius: 12,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        fontWeight: 700,
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost px-2.5"
                      onClick={() => handleLookupReference(itemRef)}
                      title="Rechercher dans le catalogue"
                    >
                      <IconSearch size={16} />
                    </button>
                  </div>
                </div>

                {/* EAN & Category */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted font-bold block mb-1">
                      Code-barres / EAN :
                    </label>
                    <input
                      type="text"
                      className="input w-full font-mono"
                      placeholder="Ex: 6941782115831"
                      value={itemEan}
                      onChange={(e) => setItemEan(e.target.value)}
                      onBlur={() => itemEan && handleLookupReference(itemEan)}
                      style={{
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted font-bold block mb-1">Catégorie :</label>
                    <select
                      className="input w-full"
                      value={itemCategory}
                      onChange={(e) => setItemCategory(e.target.value as any)}
                      style={{
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        color: '#fff',
                      }}
                    >
                      <option value="scolaire">Scolaire (Cahiers, Trousses...)</option>
                      <option value="bureautique">Bureautique (Papier, Classeurs...)</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                </div>

                {/* Designation */}
                <div>
                  <label className="text-[11px] text-muted font-bold block mb-1">
                    Désignation Article :
                  </label>
                  <input
                    type="text"
                    required
                    className="input w-full"
                    placeholder="Ex: CAHIER 96P GRAND FORMAT 24x32 SEYES"
                    value={itemDesignation}
                    onChange={(e) => setItemDesignation(e.target.value)}
                    style={{
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border)',
                    }}
                  />
                </div>

                {/* Packaging (Colisage) */}
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[11px] font-bold text-accent mb-2">
                    Colisage & Conditionnement
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted font-bold block mb-1">
                        Pièces / Carton (Outer) :
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="input w-full font-mono"
                        value={itemOuterPack}
                        onChange={(e) => setItemOuterPack(Math.max(1, Number(e.target.value) || 1))}
                        style={{
                          height: 38,
                          borderRadius: 10,
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted font-bold block mb-1">
                        Pièces / Paquet (Inner) :
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="input w-full font-mono"
                        value={itemInnerPack}
                        onChange={(e) => setItemInnerPack(Math.max(1, Number(e.target.value) || 1))}
                        style={{
                          height: 38,
                          borderRadius: 10,
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quantities & Discrepancy Input */}
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[11px] font-bold text-accent">
                      Quantités Facture vs Déchargées
                    </span>
                    <span className="font-mono text-xs font-bold text-white">
                      Total reçu : {calculatedReceivedUnits} pcs
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted font-bold block mb-1">
                        Attendu Facture :
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input w-full font-mono font-bold"
                        value={itemExpectedQty}
                        onChange={(e) => setItemExpectedQty(Number(e.target.value) || 0)}
                        style={{
                          height: 38,
                          borderRadius: 10,
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                        }}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-muted font-bold block mb-1">
                        Cartons Reçus :
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input w-full font-mono font-bold text-accent"
                        value={itemCartons}
                        onChange={(e) => setItemCartons(Number(e.target.value) || 0)}
                        style={{
                          height: 38,
                          borderRadius: 10,
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-muted font-bold block mb-1">
                        Pièces Vrac :
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input w-full font-mono font-bold"
                        value={itemLooseUnits}
                        onChange={(e) => setItemLooseUnits(Number(e.target.value) || 0)}
                        style={{
                          height: 38,
                          borderRadius: 10,
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Quick Carton Stepper Buttons */}
                  <div className="flex gap-1.5 mt-2">
                    {[1, 5, 10, 20].map((step) => (
                      <button
                        key={step}
                        type="button"
                        className="btn btn-xs flex-1"
                        style={{
                          borderRadius: 8,
                          background: 'rgba(255, 255, 255, 0.08)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                        onClick={() => {
                          hapticTap('light');
                          setItemCartons((prev) => prev + step);
                        }}
                      >
                        +{step} ctn
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn btn-xs text-danger"
                      style={{
                        borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.1)',
                        fontSize: '0.72rem',
                      }}
                      onClick={() => {
                        hapticTap('light');
                        setItemCartons(0);
                        setItemLooseUnits(0);
                      }}
                    >
                      Zéro
                    </button>
                  </div>
                </div>

                {/* Warehouse Location Zone & 1-Tap Note */}
                <div>
                  <label className="text-[11px] text-muted font-bold block mb-1">
                    Emplacement & Note de Terrain :
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-1.5">
                    <select
                      className="input w-full"
                      value={itemZone}
                      onChange={(e) => setItemZone(e.target.value)}
                      style={{
                        height: 38,
                        borderRadius: 10,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        color: '#fff',
                        fontSize: '0.8rem',
                      }}
                    >
                      <option value="CH_NW">CH • Nord-Ouest</option>
                      <option value="CH_N">CH • Nord</option>
                      <option value="CH_NE">CH • Nord-Est</option>
                      <option value="CH_CTR">CH • Centre</option>
                      <option value="CH_W">CH • Ouest</option>
                      <option value="CH_E">CH • Est</option>
                      <option value="CH_SW">CH • Sud-Ouest</option>
                      <option value="CH_S">CH • Sud</option>
                      <option value="CH_SE">CH • Sud-Est</option>
                      <option value="CO_R1">Couloir • Salle 1</option>
                      <option value="CO_R2">Couloir • Salle 2</option>
                      <option value="CO_R3">Couloir • Salle 3</option>
                      <option value="CO_R4">Couloir • Salle 4</option>
                    </select>

                    <input
                      type="text"
                      className="input w-full"
                      placeholder="Précision libre..."
                      value={itemLocationNote}
                      onChange={(e) => setItemLocationNote(e.target.value)}
                      style={{
                        height: 38,
                        borderRadius: 10,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        fontSize: '0.8rem',
                      }}
                    />
                  </div>

                  {/* 1-Tap Location Note Preset Chips */}
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {LOCATION_NOTE_PRESETS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="btn btn-xs px-2 shrink-0"
                        style={{
                          borderRadius: 8,
                          fontSize: '0.68rem',
                          background:
                            itemLocationNote === chip ? 'var(--accent)' : 'rgba(255, 255, 255, 0.06)',
                          color: itemLocationNote === chip ? '#fff' : 'var(--text-muted)',
                        }}
                        onClick={() => {
                          hapticTap('light');
                          setItemLocationNote(chip);
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full mt-2"
                  style={{ minHeight: 46, borderRadius: 12, fontWeight: 800 }}
                >
                  {editingItem ? 'Mettre à jour la ligne' : 'Enregistrer au Conteneur'}
                </button>
              </form>
            </div>
          </div>
        )}

        {showLiveOcrModal && (
          <LiveProductOcrModal
            isOpen={showLiveOcrModal}
            onClose={() => setShowLiveOcrModal(false)}
            onProductAction={async (action, product, qty) => {
              setShowLiveOcrModal(false);
              if (!activeSession) {
                onToast('Veuillez d’abord lancer ou sélectionner un arrivage');
                return;
              }

              // Check if item already exists in this session
              const existing = items.find(
                (i) =>
                  (product.reference && i.reference.toUpperCase() === product.reference.toUpperCase()) ||
                  (product.ean && i.ean === product.ean)
              );

              if (existing) {
                const pack = product.packSize || existing.outerPackSize || 24;
                const addedCartons = qty ? Math.max(1, Math.round(qty / pack)) : 1;
                const newCartons = (existing.receivedCartons || 0) + addedCartons;
                const newTotal = newCartons * pack + (existing.receivedLooseUnits || 0);
                await saveReceptionItem({
                  ...existing,
                  outerPackSize: pack,
                  receivedCartons: newCartons,
                  receivedQty: newTotal,
                });
                playSuccessChime();
                onToast(`+${addedCartons} carton(s) (${addedCartons * pack} pcs) ajouté sur ${existing.reference}`);
                loadItems(activeSession.id!);
              } else {
                // Pre-fill form
                resetItemForm();
                setItemRef(product.reference || '');
                setItemEan(product.ean || '');
                setItemDesignation(product.designation || '');
                if (product.packSize) setItemOuterPack(product.packSize);
                if (product.innerPackSize) setItemInnerPack(product.innerPackSize);
                setItemCartons(1);
                setShowItemForm(true);
                playSuccessChime();
                onToast(`Carton détecté : ${product.reference || product.designation}`);
              }
            }}
          />
        )}

        {showAgentTourneeModal && (
          <AgentTourneeModal
            isOpen={showAgentTourneeModal}
            onClose={() => setShowAgentTourneeModal(false)}
            activeOperator={activeOperator}
            onToast={onToast}
            initialReceptionSessionId={activeSession?.id}
          />
        )}
      </div>
    </div>
  );
};
