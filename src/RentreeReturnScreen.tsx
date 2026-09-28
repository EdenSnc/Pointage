// ============================================================
// POINTAGE — UI 5: Retours de Fin de Rentrée Scolaire
// Multi-Voyages Camions, Multi-Dépôts (Oran, Kral Béchar, Bleu Blanc)
// Pointage Quai, Tri Avaries, Réintégration Stock & Avoirs Financiers
// ============================================================

import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAllRentreeCampaigns,
  getRentreeVoyagesByCampaign,
  getRentreeItemsByVoyage,
  saveRentreeVoyage,
  saveRentreeItem,
  seedInitialRentreeDataIfEmpty,
  getAllClientAccounts,
} from './db';
import type {
  RentreeReturnCampaign,
  RentreeReturnVoyage,
  RentreeReturnItem,
  ClientAccount,
} from './types';
import {
  calculateCampaignKPIs,
  calculateVoyageKPIs,
  evaluateItemStatus,
  applyCreditNoteToClientAccount,
  generateWhatsAppReturnManifest,
} from './rentreeReturnsEngine';
import { DEFAULT_WAREHOUSE_SITES, WAREHOUSE_ZONES, getZoneShortLabel } from './warehouseZones';
import { AppModuleSwitcher } from './AppModuleSwitcher';
import { loadDriverRoster } from './driverLogistics';
import {
  IconRotateCcw,
  IconTruck,
  IconStore,
  IconBox,
  IconCheck,
  IconWarning,
  IconPlus,
  IconTrash,
  IconSparkles,
  IconClipboardCheck,
  IconCoins,
  IconMapPin,
  IconScan,
  IconArrowLeft,
  IconX,
  IconTrendingUp,
  IconShield,
  IconPencil,
} from './icons';
import { playSuccessChime, playWarningBeep, hapticTap } from './audio';

export const RentreeReturnScreen: React.FC<{ setToast: (msg: string) => void }> = ({
  setToast,
}) => {
  const navigate = useNavigate();

  // Campaign & Multi-Voyages State
  const [campaigns, setCampaigns] = useState<RentreeReturnCampaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<RentreeReturnCampaign | null>(null);
  const [voyages, setVoyages] = useState<RentreeReturnVoyage[]>([]);
  const [selectedVoyageId, setSelectedVoyageId] = useState<number | null>(null);
  const [items, setItems] = useState<RentreeReturnItem[]>([]);
  const [clientAccounts, setClientAccounts] = useState<ClientAccount[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'conforme' | 'anomalie'>('all');

  // Modals
  const [showNewVoyageModal, setShowNewVoyageModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [isApplyingCredit, setIsApplyingCredit] = useState(false);

  // New Voyage Form
  const [newVoyagePlate, setNewVoyagePlate] = useState('');
  const [newVoyageDriver, setNewVoyageDriver] = useState('Karim');
  const [newVoyageSite, setNewVoyageSite] = useState('kral_bechar');
  const [newVoyageDate, setNewVoyageDate] = useState(() => new Date().toISOString().slice(0, 10));

  // New Item Form
  const [newItemRef, setNewItemRef] = useState('');
  const [newItemDesignation, setNewItemDesignation] = useState('');
  const [newItemPackSize, setNewItemPackSize] = useState(80);
  const [newItemExpectedCartons, setNewItemExpectedCartons] = useState(50);
  const [newItemUnitPrice, setNewItemUnitPrice] = useState(85);

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Load Data
  const reloadData = async () => {
    await seedInitialRentreeDataIfEmpty();
    const campList = await getAllRentreeCampaigns();
    setCampaigns(campList);

    const currentCamp = campList[0] || null;
    setActiveCampaign(currentCamp);

    if (currentCamp?.id) {
      const voyList = await getRentreeVoyagesByCampaign(currentCamp.id);
      setVoyages(voyList);

      const targetVoyageId = selectedVoyageId || voyList[0]?.id || null;
      setSelectedVoyageId(targetVoyageId);

      if (targetVoyageId) {
        const itemList = await getRentreeItemsByVoyage(targetVoyageId);
        setItems(itemList);
      }
    }

    const accounts = await getAllClientAccounts();
    setClientAccounts(accounts);
  };

  useEffect(() => {
    reloadData();
  }, []);

  // When voyage selection changes
  const handleSelectVoyage = async (voyageId: number) => {
    setSelectedVoyageId(voyageId);
    hapticTap('selection');
    const itemList = await getRentreeItemsByVoyage(voyageId);
    setItems(itemList);
  };

  const selectedVoyage = useMemo(() => {
    return voyages.find((v) => v.id === selectedVoyageId) || voyages[0] || null;
  }, [voyages, selectedVoyageId]);

  // Campaign & Voyage KPIs
  const campaignKpis = useMemo(() => {
    return calculateCampaignKPIs(voyages, items);
  }, [voyages, items]);

  const voyageKpis = useMemo(() => {
    return calculateVoyageKPIs(items);
  }, [items]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const q = deferredSearch.trim().toLowerCase();
      if (q) {
        const matchRef = it.reference.toLowerCase().includes(q);
        const matchDes = it.designation.toLowerCase().includes(q);
        const matchEan = it.ean ? it.ean.includes(q) : false;
        if (!matchRef && !matchDes && !matchEan) return false;
      }
      if (filterStatus === 'pending') return it.status === 'pending';
      if (filterStatus === 'conforme') return it.status === 'conforme';
      if (filterStatus === 'anomalie') return it.status === 'surplus' || it.status === 'shortage' || it.status === 'damaged_only' || it.damagedCartons > 0;
      return true;
    });
  }, [items, deferredSearch, filterStatus]);

  // Pointage: Step quantity in cartons
  const handleUpdateItemCartons = async (itemId: number, deltaCartons: number) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const nextReturned = Math.max(0, item.returnedCartons + deltaCartons);
    const updated: RentreeReturnItem = {
      ...item,
      returnedCartons: nextReturned,
      status: evaluateItemStatus({ ...item, returnedCartons: nextReturned }),
      pointedBy: 'Mourad',
      pointedAt: new Date().toISOString(),
    };

    hapticTap(deltaCartons > 0 ? 'medium' : 'light');
    playSuccessChime();

    await saveRentreeItem(updated);
    setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
  };

  // Pointage: Step avaries (damaged)
  const handleUpdateItemDamaged = async (itemId: number, deltaAvarie: number) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const nextDamaged = Math.max(0, item.damagedCartons + deltaAvarie);
    const updated: RentreeReturnItem = {
      ...item,
      damagedCartons: nextDamaged,
      damagedUnits: nextDamaged * item.outerPackSize,
      status: evaluateItemStatus({ ...item, damagedCartons: nextDamaged }),
      pointedBy: 'Mourad',
      pointedAt: new Date().toISOString(),
    };

    hapticTap('heavy');
    if (deltaAvarie > 0) playWarningBeep();

    await saveRentreeItem(updated);
    setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
  };

  // Reintegrate: Quick Zone Reallocation
  const handleAssignZone = async (itemId: number, zone: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const updated: RentreeReturnItem = {
      ...item,
      reintegratedZone: zone,
      pointedAt: new Date().toISOString(),
    };

    hapticTap('selection');
    playSuccessChime();
    await saveRentreeItem(updated);
    setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
    setToast(`Article ${item.reference} assigné à l'emplacement [${zone}]`);
  };

  // Create New Voyage (Multi-Voyages)
  const handleCreateVoyage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCampaign?.id) return;

    const voyageNum = voyages.length + 1;
    const voyageCode = `VOY-RENTREE-0${voyageNum}`;

    const newId = await saveRentreeVoyage({
      campaignId: activeCampaign.id,
      voyageNumber: voyageNum,
      voyageCode,
      vehiclePlate: newVoyagePlate || `Camion ${voyageNum}`,
      driverName: newVoyageDriver,
      arrivalSite: newVoyageSite,
      arrivalDate: newVoyageDate,
      status: 'unloading',
      totalExpectedCartons: 100,
      totalReturnedCartons: 0,
      totalAvarieCartons: 0,
      totalFinancialValueDa: 0,
      notes: `Voyage ${voyageNum} enregistré le ${new Date().toLocaleDateString('fr-DZ')}`,
    });

    setShowNewVoyageModal(false);
    setNewVoyagePlate('');
    playSuccessChime();
    hapticTap('heavy');
    setToast(`Voyage N° ${voyageNum} (${voyageCode}) créé avec succès !`);
    await reloadData();
    handleSelectVoyage(newId);
  };

  // Add Item to Current Voyage
  const handleAddItemToVoyage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCampaign?.id || !selectedVoyageId) return;

    const cleanRef = newItemRef.trim().toUpperCase();
    if (!cleanRef) return;

    await saveRentreeItem({
      campaignId: activeCampaign.id,
      voyageId: selectedVoyageId,
      reference: cleanRef,
      ean: null,
      designation: newItemDesignation.trim() || cleanRef,
      category: 'scolaire',
      outerPackSize: Number(newItemPackSize) || 80,
      innerPackSize: 10,
      expectedCartons: Number(newItemExpectedCartons) || 10,
      expectedUnits: (Number(newItemExpectedCartons) || 10) * (Number(newItemPackSize) || 80),
      returnedCartons: 0,
      returnedLooseUnits: 0,
      damagedCartons: 0,
      damagedUnits: 0,
      unitPriceDa: Number(newItemUnitPrice) || 85,
      reintegratedZone: 'CH_CTR',
      status: 'pending',
    });

    setShowAddItemModal(false);
    setNewItemRef('');
    setNewItemDesignation('');
    playSuccessChime();
    setToast(`Article ${cleanRef} ajouté au voyage.`);
    const reloaded = await getRentreeItemsByVoyage(selectedVoyageId);
    setItems(reloaded);
  };

  // Switch Arrival Site for Current Voyage ("maybe pointé at kral or bleu blanc too")
  const handleUpdateVoyageSite = async (newSiteId: string) => {
    if (!selectedVoyage?.id) return;
    const updated: RentreeReturnVoyage = {
      ...selectedVoyage,
      arrivalSite: newSiteId,
    };
    await saveRentreeVoyage(updated);
    setVoyages((prev) => prev.map((v) => (v.id === selectedVoyage.id ? updated : v)));
    hapticTap('selection');
    playSuccessChime();
    setToast(`Site de pointage mis à jour : ${DEFAULT_WAREHOUSE_SITES.find((s) => s.id === newSiteId)?.name || newSiteId}`);
  };

  // Copy WhatsApp Return Manifest
  const handleCopyManifest = () => {
    if (!activeCampaign || !selectedVoyage) return;
    const text = generateWhatsAppReturnManifest({
      campaign: activeCampaign,
      voyage: selectedVoyage,
      items,
    });
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    playSuccessChime();
    hapticTap('medium');
    setToast('Manifeste Décharge WhatsApp copié dans le presse-papier !');
  };

  // Apply Credit Note directly to Client Account (Money Priority #1)
  const handleApplyClientCredit = async () => {
    if (!activeCampaign || voyageKpis.salableValueDa <= 0) return;
    setIsApplyingCredit(true);
    try {
      const res = await applyCreditNoteToClientAccount(
        activeCampaign.clientOrOrigin,
        voyageKpis.salableValueDa
      );
      if (res.success) {
        playSuccessChime();
        hapticTap('heavy');
        setToast(res.message);
        setShowCreditModal(false);
        const accounts = await getAllClientAccounts();
        setClientAccounts(accounts);
      } else {
        playWarningBeep();
        setToast(res.message);
      }
    } finally {
      setIsApplyingCredit(false);
    }
  };

  return (
    <div
      className="rentree-return-screen min-h-screen pb-28 text-white"
      style={{ backgroundColor: '#0c0d10' }}
    >
      {/* Top Header */}
      <div
        className="sticky top-0 z-40 px-4 py-3 border-b border-white/10"
        style={{ background: 'rgba(12, 13, 16, 0.94)', backdropFilter: 'blur(16px)' }}
      >
        <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-circle"
              onClick={() => navigate('/')}
            >
              <IconArrowLeft size={16} />
            </button>
            <div>
              <div className="text-sm font-extrabold text-white flex items-center gap-2">
                <IconRotateCcw size={16} className="text-amber-400" />
                <span>Retours Fin de Rentrée Scolaire</span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    fontWeight: 800,
                  }}
                >
                  Multi-Voyages & Dépôts
                </span>
              </div>
              <div className="text-[11px] text-muted">
                {activeCampaign?.clientOrOrigin || 'Surplus & reliquats de rentrée'}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline flex items-center gap-1.5"
              style={{ borderRadius: 14, fontWeight: 700 }}
              onClick={handleCopyManifest}
              title="Copier Décharge Quai WhatsApp"
            >
              <IconClipboardCheck size={15} />
              <span className="hidden sm:inline">Décharge WhatsApp</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-primary flex items-center gap-1.5"
              style={{ borderRadius: 14, fontWeight: 800 }}
              onClick={() => setShowNewVoyageModal(true)}
            >
              <IconPlus size={15} />
              <span>Nouveau Voyage</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-4">
        {/* EXECUTIVE FINANCIAL & CONSOLIDATION SUMMARY CARD */}
        <div
          style={{
            padding: 18,
            borderRadius: 22,
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxShadow: '0 20px 40px -15px rgba(0,0,0,0.6)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-wider">
                Bilan Consolidé de Rentrée (3 Voyages)
              </div>
              <div className="text-xl font-extrabold text-white mt-0.5 flex items-center gap-2">
                <span className="font-mono text-emerald-400">
                  {campaignKpis.totalSalableValueDa.toLocaleString('fr-DZ')} DA
                </span>
                <span className="text-xs text-muted font-normal">valeur réintégrée</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-xs btn-outline flex items-center gap-1.5"
                style={{ borderRadius: 12, fontWeight: 700 }}
                onClick={() => setShowCreditModal(true)}
              >
                <IconCoins size={14} className="text-amber-400" />
                <span>Générer Avoir / Réduire Créance</span>
              </button>
            </div>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 14,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div className="text-[10px] text-muted uppercase font-bold">Cartons Conformes</div>
              <div className="font-mono font-extrabold text-base text-accent">
                {campaignKpis.totalReturnedCartons} ctn
              </div>
              <div className="text-[10px] text-muted">
                {campaignKpis.totalReturnedUnits.toLocaleString('fr-DZ')} pièces
              </div>
            </div>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: 14,
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              <div className="text-[10px] text-rose-300 uppercase font-bold">Avaries & Casses</div>
              <div className="font-mono font-extrabold text-base text-rose-400">
                {campaignKpis.totalAvarieCartons} ctn
              </div>
              <div className="text-[10px] text-rose-300/80">
                Perte : {campaignKpis.totalLossAvarieDa.toLocaleString('fr-DZ')} DA
              </div>
            </div>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: 14,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div className="text-[10px] text-muted uppercase font-bold">Taux de Conformité</div>
              <div className="font-mono font-extrabold text-base text-blue-400">
                {campaignKpis.conformityRatePercent}%
              </div>
              <div className="text-[10px] text-muted">Sur marchandise reçue</div>
            </div>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: 14,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div className="text-[10px] text-muted uppercase font-bold">Progression Pointage</div>
              <div className="font-mono font-extrabold text-base text-amber-300">
                {campaignKpis.completionPercent}%
              </div>
              <div className="text-[10px] text-muted">
                {campaignKpis.totalReturnedCartons}/{campaignKpis.totalExpectedCartons} ctns
              </div>
            </div>
          </div>
        </div>

        {/* MULTI-VOYAGES SEGMENTED BAR */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-extrabold text-muted uppercase tracking-wider flex items-center justify-between">
            <span>Voyages de Retour Camions ({voyages.length})</span>
            <span className="text-[11px] text-accent font-normal">
              Sélectionnez un voyage pour pointer
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {voyages.map((voy) => {
              const isSelected = voy.id === selectedVoyageId;
              const isDone = voy.status === 'reconciled';
              const isUnloading = voy.status === 'unloading';
              return (
                <button
                  key={voy.id}
                  type="button"
                  onClick={() => handleSelectVoyage(voy.id!)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 16,
                    backgroundColor: isSelected
                      ? '#3b82f6'
                      : isDone
                      ? 'rgba(16, 185, 129, 0.12)'
                      : 'rgba(255, 255, 255, 0.04)',
                    border: isSelected
                      ? '1.5px solid #60a5fa'
                      : isDone
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isSelected ? '#ffffff' : '#e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    minWidth: 160,
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="font-mono font-extrabold text-xs">
                      Voyage {voy.voyageNumber}
                    </span>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        padding: '1px 6px',
                        borderRadius: 9999,
                        backgroundColor: isSelected
                          ? 'rgba(0,0,0,0.3)'
                          : isDone
                          ? 'rgba(16, 185, 129, 0.25)'
                          : 'rgba(245, 158, 11, 0.2)',
                        color: isSelected ? '#ffffff' : isDone ? '#34d399' : '#fbbf24',
                        fontWeight: 800,
                      }}
                    >
                      {isDone ? 'Pointé ✓' : isUnloading ? 'Au Quai' : 'En Route'}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold w-full overflow-hidden text-ellipsis whitespace-nowrap">
                    {DEFAULT_WAREHOUSE_SITES.find((s) => s.id === voy.arrivalSite)?.name || voy.arrivalSite}
                  </div>
                  <div className="text-[10px] text-muted w-full overflow-hidden text-ellipsis whitespace-nowrap">
                    {voy.driverName} • {voy.vehiclePlate}
                  </div>
                </button>
              );
            })}

            <button
              type="button"
              className="btn btn-sm btn-ghost border border-dashed border-white/20 flex items-center gap-1 shrink-0"
              style={{ borderRadius: 16, height: 60, padding: '0 16px' }}
              onClick={() => setShowNewVoyageModal(true)}
            >
              <IconPlus size={16} />
              <span className="text-xs font-bold">+ Voyage</span>
            </button>
          </div>
        </div>

        {/* ACTIVE VOYAGE DETAILS & SITE SWITCHER */}
        {selectedVoyage && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 18,
              backgroundColor: 'rgba(59, 130, 246, 0.05)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60a5fa',
                  }}
                >
                  <IconTruck size={20} />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-white flex items-center gap-2">
                    <span>{selectedVoyage.voyageCode} — Voyage N° {selectedVoyage.voyageNumber}</span>
                    <span className="text-xs text-muted font-normal font-mono">({selectedVoyage.vehiclePlate})</span>
                  </div>
                  <div className="text-[11px] text-muted">
                    Chauffeur : <strong className="text-white">{selectedVoyage.driverName}</strong> • Date : {selectedVoyage.arrivalDate}
                  </div>
                </div>
              </div>

              {/* Multi-Site Selector: Pointé à Kral Markt, Bleu Blanc, ou Oran Central */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-300 flex items-center gap-1">
                  <IconMapPin size={13} />
                  <span>Site de Pointage :</span>
                </span>
                <select
                  className="select select-xs font-bold text-xs"
                  value={selectedVoyage.arrivalSite}
                  onChange={(e) => handleUpdateVoyageSite(e.target.value)}
                  style={{
                    borderRadius: 10,
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                  }}
                >
                  {DEFAULT_WAREHOUSE_SITES.map((site) => (
                    <option key={site.id} value={site.id} style={{ backgroundColor: '#16171b', color: '#fff' }}>
                      {site.name} ({site.wilaya})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Voyage Financial Badge */}
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-white/5 text-xs text-muted">
              <div>
                Valorisation Bon État : <span className="font-mono font-bold text-emerald-400">{voyageKpis.salableValueDa.toLocaleString('fr-DZ')} DA</span>
              </div>
              <div>
                Total Cartons Reçus : <span className="font-mono font-bold text-white">{voyageKpis.returnedCartons}/{voyageKpis.expectedCartons} ctns</span>
              </div>
              {voyageKpis.damagedCartons > 0 && (
                <div className="text-rose-400 font-bold">
                  Avaries : {voyageKpis.damagedCartons} ctns (-{voyageKpis.lossAvarieDa.toLocaleString('fr-DZ')} DA)
                </div>
              )}
            </div>
          </div>
        )}

        {/* SEARCH BAR & STATUS PILLS */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <IconScan size={16} className="absolute left-3.5 top-3.5 text-muted" />
            <input
              ref={scanInputRef}
              type="text"
              className="input input-sm w-full pl-10 text-xs font-semibold"
              placeholder="Scanner code-barres EAN ou rechercher par référence (ex: CAH-96P)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)' }}
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: `Tout (${items.length})` },
              { id: 'pending', label: 'À pointer' },
              { id: 'conforme', label: 'Conformes' },
              { id: 'anomalie', label: 'Anomalies / Avaries' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`btn btn-xs ${filterStatus === f.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 10, fontWeight: 700 }}
                onClick={() => {
                  setFilterStatus(f.id as any);
                  hapticTap('selection');
                }}
              >
                {f.label}
              </button>
            ))}

            <button
              type="button"
              className="btn btn-xs btn-outline flex items-center gap-1 shrink-0"
              style={{ borderRadius: 10, fontWeight: 700 }}
              onClick={() => setShowAddItemModal(true)}
            >
              <IconPlus size={12} />
              <span>+ Article</span>
            </button>
          </div>
        </div>

        {/* POINTAGE ITEMS LIST */}
        <div className="flex flex-col gap-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted text-xs card p-6">
              Aucun article trouvé dans ce voyage.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isConforme = item.status === 'conforme';
              const hasDamage = item.damagedCartons > 0;
              const hasSurplus = item.status === 'surplus';
              const hasShortage = item.status === 'shortage';
              const subtotalDa =
                (item.returnedCartons * item.outerPackSize + (item.returnedLooseUnits || 0)) * item.unitPriceDa;

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 18,
                    backgroundColor: isConforme
                      ? 'rgba(16, 185, 129, 0.04)'
                      : hasDamage
                      ? 'rgba(239, 68, 68, 0.05)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: isConforme
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : hasDamage
                      ? '1px solid rgba(239, 68, 68, 0.3)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {/* Item Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-sm text-white">
                          {item.reference}
                        </span>
                        {item.ean && (
                          <span className="font-mono text-[10px] text-muted">
                            [{item.ean}]
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '1px 6px',
                            borderRadius: 9999,
                            backgroundColor: isConforme
                              ? 'rgba(16, 185, 129, 0.2)'
                              : hasDamage
                              ? 'rgba(239, 68, 68, 0.2)'
                              : hasSurplus
                              ? 'rgba(168, 85, 247, 0.2)'
                              : 'rgba(255, 255, 255, 0.08)',
                            color: isConforme
                              ? 'var(--accent)'
                              : hasDamage
                              ? 'var(--danger)'
                              : hasSurplus
                              ? '#c084fc'
                              : 'var(--muted)',
                            fontWeight: 800,
                          }}
                        >
                          {isConforme
                            ? 'Conforme ✓'
                            : hasDamage
                            ? `Avarie (${item.damagedCartons} ctn)`
                            : hasSurplus
                            ? 'Surplus +'
                            : hasShortage
                            ? 'Manquant -'
                            : 'À pointer'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white/90 mt-0.5">
                        {item.designation}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        Colisage : <strong className="text-white">{item.outerPackSize} pcs/ctn</strong> • Attendu : <strong className="text-white">{item.expectedCartons} cartons</strong> ({item.expectedUnits.toLocaleString('fr-DZ')} pcs)
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-muted uppercase font-bold">Valeur Récupérée</div>
                      <div className="font-mono font-extrabold text-sm text-accent">
                        +{subtotalDa.toLocaleString('fr-DZ')} DA
                      </div>
                      <div className="text-[10px] text-muted">
                        @{item.unitPriceDa} DA/pc
                      </div>
                    </div>
                  </div>

                  {/* Pointage Controls & Zone Reintegration */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
                    {/* Zone Assignment Picker */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted font-bold flex items-center gap-1">
                        <IconMapPin size={12} className="text-blue-400" />
                        <span>Zone Dépôt :</span>
                      </span>
                      <select
                        className="select select-xs text-xs font-mono font-bold"
                        value={item.reintegratedZone || ''}
                        onChange={(e) => handleAssignZone(item.id!, e.target.value)}
                        style={{ borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }}
                      >
                        <option value="">Non assigné</option>
                        {WAREHOUSE_ZONES.map((z) => (
                          <option key={z.code} value={z.code}>
                            {z.code} ({z.shortLabel})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Steppers: Good Cartons & Damaged Cartons */}
                    <div className="flex items-center gap-3">
                      {/* Good condition counter */}
                      <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/5">
                        <span className="text-[11px] text-emerald-400 font-bold pl-1.5">Bon État :</span>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost btn-circle"
                          onClick={() => handleUpdateItemCartons(item.id!, -1)}
                          title="Retirer 1 carton"
                        >
                          -
                        </button>
                        <span className="font-mono font-extrabold text-xs text-white px-1">
                          {item.returnedCartons} ctn
                        </span>
                        <button
                          type="button"
                          className="btn btn-xs btn-primary btn-circle"
                          onClick={() => handleUpdateItemCartons(item.id!, 1)}
                          title="Ajouter 1 carton conforme"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost text-xs font-bold text-accent"
                          style={{ padding: '0 6px' }}
                          onClick={() => handleUpdateItemCartons(item.id!, 5)}
                          title="Ajouter 5 cartons"
                        >
                          +5
                        </button>
                      </div>

                      {/* Damaged counter */}
                      <div className="flex items-center gap-1 bg-rose-500/10 p-1 rounded-xl border border-rose-500/20">
                        <span className="text-[11px] text-rose-300 font-bold pl-1.5">Avarie :</span>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost btn-circle text-rose-300"
                          onClick={() => handleUpdateItemDamaged(item.id!, -1)}
                        >
                          -
                        </button>
                        <span className="font-mono font-bold text-xs text-rose-400 px-1">
                          {item.damagedCartons}
                        </span>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost text-rose-300 font-extrabold"
                          style={{ padding: '0 6px' }}
                          onClick={() => handleUpdateItemDamaged(item.id!, 1)}
                          title="Signaler 1 carton avarié"
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* NEW VOYAGE MODAL */}
      {showNewVoyageModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
        >
          <div
            className="w-full max-w-md p-5 rounded-2xl flex flex-col gap-4"
            style={{ backgroundColor: '#16171b', border: '1px solid rgba(59, 130, 246, 0.4)' }}
          >
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <div className="font-extrabold text-base text-white flex items-center gap-2">
                <IconTruck size={18} className="text-blue-400" />
                <span>Nouveau Voyage de Retour Camion</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setShowNewVoyageModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVoyage} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] text-muted font-bold uppercase block mb-1">
                  Véhicule / Immatriculation *
                </label>
                <input
                  type="text"
                  className="input input-sm w-full text-xs font-bold"
                  placeholder="Ex: Semi Sonacome 08-30129 ou Isuzu 31-88412"
                  value={newVoyagePlate}
                  onChange={(e) => setNewVoyagePlate(e.target.value)}
                  required
                  style={{ borderRadius: 10 }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted font-bold uppercase block mb-1">
                    Chauffeur
                  </label>
                  <select
                    className="select select-sm w-full text-xs font-bold"
                    value={newVoyageDriver}
                    onChange={(e) => setNewVoyageDriver(e.target.value)}
                    style={{ borderRadius: 10 }}
                  >
                    {['Karim', 'Mourad', 'Yassine', 'Djaber', 'Amine'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-muted font-bold uppercase block mb-1">
                    Date d'arrivée
                  </label>
                  <input
                    type="date"
                    className="input input-sm w-full text-xs"
                    value={newVoyageDate}
                    onChange={(e) => setNewVoyageDate(e.target.value)}
                    style={{ borderRadius: 10 }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-muted font-bold uppercase block mb-1">
                  Site Réception & Pointage (Dépôt) *
                </label>
                <select
                  className="select select-sm w-full text-xs font-bold"
                  value={newVoyageSite}
                  onChange={(e) => setNewVoyageSite(e.target.value)}
                  style={{ borderRadius: 10 }}
                >
                  {DEFAULT_WAREHOUSE_SITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.wilaya})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="btn btn-sm btn-primary w-full flex items-center justify-center gap-1.5 mt-2"
                style={{ borderRadius: 12, fontWeight: 800, minHeight: 44 }}
              >
                <IconCheck size={16} />
                <span>Créer le Voyage & Démarrer le Pointage</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ADD ITEM MODAL */}
      {showAddItemModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
        >
          <div
            className="w-full max-w-md p-5 rounded-2xl flex flex-col gap-4"
            style={{ backgroundColor: '#16171b', border: '1px solid rgba(168, 85, 247, 0.4)' }}
          >
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <div className="font-extrabold text-base text-white flex items-center gap-2">
                <IconBox size={18} className="text-purple-400" />
                <span>Ajouter un Article au Voyage</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setShowAddItemModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddItemToVoyage} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] text-muted font-bold uppercase block mb-1">
                  Référence Article *
                </label>
                <input
                  type="text"
                  className="input input-sm w-full font-mono text-xs uppercase font-bold"
                  placeholder="Ex: CAH-96P-SBM"
                  value={newItemRef}
                  onChange={(e) => setNewItemRef(e.target.value.toUpperCase())}
                  required
                  style={{ borderRadius: 10 }}
                />
              </div>

              <div>
                <label className="text-[11px] text-muted font-bold uppercase block mb-1">
                  Désignation
                </label>
                <input
                  type="text"
                  className="input input-sm w-full text-xs font-semibold"
                  placeholder="Ex: Cahier 96 Pages Seyès SBM"
                  value={newItemDesignation}
                  onChange={(e) => setNewItemDesignation(e.target.value)}
                  style={{ borderRadius: 10 }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted font-bold uppercase block mb-1">
                    Pcs / Carton
                  </label>
                  <input
                    type="number"
                    className="input input-sm w-full font-mono text-xs"
                    value={newItemPackSize}
                    onChange={(e) => setNewItemPackSize(Number(e.target.value))}
                    style={{ borderRadius: 10 }}
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted font-bold uppercase block mb-1">
                    Cartons Attendus
                  </label>
                  <input
                    type="number"
                    className="input input-sm w-full font-mono text-xs"
                    value={newItemExpectedCartons}
                    onChange={(e) => setNewItemExpectedCartons(Number(e.target.value))}
                    style={{ borderRadius: 10 }}
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted font-bold uppercase block mb-1">
                    Prix Unitaire (DA)
                  </label>
                  <input
                    type="number"
                    className="input input-sm w-full font-mono text-xs"
                    value={newItemUnitPrice}
                    onChange={(e) => setNewItemUnitPrice(Number(e.target.value))}
                    style={{ borderRadius: 10 }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-sm btn-primary w-full flex items-center justify-center gap-1.5 mt-2"
                style={{ borderRadius: 12, fontWeight: 800, minHeight: 44 }}
              >
                <IconCheck size={16} />
                <span>Enregistrer l'Article dans le Manifeste</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* AVOIR & FINANCIAL RECONCILIATION MODAL */}
      {showCreditModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
        >
          <div
            className="w-full max-w-md p-5 rounded-2xl flex flex-col gap-4"
            style={{ backgroundColor: '#16171b', border: '1px solid rgba(16, 185, 129, 0.4)' }}
          >
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <div className="font-extrabold text-base text-white flex items-center gap-2">
                <IconCoins size={18} className="text-emerald-400" />
                <span>Génération d'Avoir & Décharge Financière</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() => setShowCreditModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-muted leading-relaxed">
              Client émetteur des retours :{' '}
              <strong className="text-white">{activeCampaign?.clientOrOrigin}</strong>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div className="flex justify-between text-xs text-muted">
                <span>Valeur Conforme Pointée (Voyage {selectedVoyage?.voyageNumber}) :</span>
                <span className="font-mono font-bold text-white">
                  +{voyageKpis.salableValueDa.toLocaleString('fr-DZ')} DA
                </span>
              </div>
              <div className="flex justify-between text-xs text-rose-300">
                <span>Pertes Avaries & Dégradations :</span>
                <span className="font-mono font-bold">
                  -{voyageKpis.lossAvarieDa.toLocaleString('fr-DZ')} DA
                </span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-white pt-2 border-t border-white/10">
                <span>Montant Net de l'Avoir :</span>
                <span className="font-mono text-emerald-400">
                  {voyageKpis.salableValueDa.toLocaleString('fr-DZ')} DA
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <button
                type="button"
                disabled={isApplyingCredit || voyageKpis.salableValueDa <= 0}
                className="btn btn-sm btn-primary w-full flex items-center justify-center gap-1.5"
                style={{ borderRadius: 12, fontWeight: 800, minHeight: 44 }}
                onClick={handleApplyClientCredit}
              >
                <IconCheck size={16} />
                <span>
                  {isApplyingCredit
                    ? 'Déduction en cours...'
                    : 'Valider Avoir & Réduire la Créance Client'}
                </span>
              </button>

              <button
                type="button"
                className="btn btn-sm btn-outline w-full flex items-center justify-center gap-1.5"
                style={{ borderRadius: 12, fontWeight: 700 }}
                onClick={handleCopyManifest}
              >
                <IconClipboardCheck size={14} />
                <span>Copier Décharge pour Comptabilité</span>
              </button>

              <button
                type="button"
                className="btn btn-sm btn-ghost w-full"
                style={{ borderRadius: 12, color: 'var(--muted)' }}
                onClick={() => setShowCreditModal(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Executive Switcher - only rendered when no modal is active */}
      {!showNewVoyageModal && !showAddItemModal && !showCreditModal && (
        <AppModuleSwitcher />
      )}
    </div>
  );
};
