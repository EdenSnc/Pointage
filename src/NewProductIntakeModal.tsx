// ============================================================
// POINTAGE — Modal Saisie des Nouveaux Produits
// Zero-Mistake Product Intake with AI Vision Acceleration
// Modulo-10 EAN Checksum, Duplicate SKU Guard & Margin Safety
// ============================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from './db';
import type { ProductProfile, WarehouseZone } from './types';
import {
  validateEanBarcode,
  checkProductCollision,
  validateIntakePackaging,
  validateIntakePricing,
  analyzeProductPhotoWithAi,
  saveNewProductProfile,
  type ExtractedProductAiPayload,
} from './productIntakeEngine';
import { WAREHOUSE_ZONES as DEFAULT_WAREHOUSE_ZONES, getZoneShortLabel } from './warehouseZones';
import { buildArrivalSamplePlan, commitArrivalSamplePlan } from './sampleLogistics';
import { loadDriverRoster } from './driverLogistics';
import { providerRegistry } from './ai/providerRegistry';
import {
  IconBox,
  IconCamera,
  IconSparkles,
  IconCheck,
  IconWarning,
  IconX,
  IconScan,
  IconTag,
  IconTrendingUp,
  IconShield,
  IconMapPin,
  IconPlus,
  IconTrash,
  IconPencil,
  IconStore,
} from './icons';
import { playSuccessChime, playWarningBeep, hapticTap } from './audio';

interface NewProductIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOperator?: string;
  onToast: (msg: string) => void;
  onProductCreated?: (product: ProductProfile) => void;
}

export const NewProductIntakeModal: React.FC<NewProductIntakeModalProps> = ({
  isOpen,
  onClose,
  activeOperator = 'Opérateur',
  onToast,
  onProductCreated,
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'form' | 'ai_vision' | 'recent_catalog'>('form');

  // Product Form Fields
  const [reference, setReference] = useState('');
  const [ean, setEan] = useState('');
  const [designation, setDesignation] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<'scolaire' | 'bureautique' | 'autre'>('scolaire');
  const [outerPackSize, setOuterPackSize] = useState<number>(24);
  const [innerPackSize, setInnerPackSize] = useState<number>(1);
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [wholesalePrice, setWholesalePrice] = useState<string>('');
  const [retailPrice, setRetailPrice] = useState<string>('');
  const [isGoldenProduct, setIsGoldenProduct] = useState(false);
  const [warehouseZone, setWarehouseZone] = useState<WarehouseZone | null>('CH_NW');
  const [locationNote, setLocationNote] = useState('');
  const [transportability, setTransportability] = useState<'easily_transportable' | 'bulky_refused'>('easily_transportable');
  const [autoGenerateSamples, setAutoGenerateSamples] = useState(true);

  // Validation States
  const [collisionWarning, setCollisionWarning] = useState<string | null>(null);
  const [recentProfiles, setRecentProfiles] = useState<ProductProfile[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // AI Vision Extraction States
  const [aiImageBase64, setAiImageBase64] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiExtractedData, setAiExtractedData] = useState<ExtractedProductAiPayload | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if Gemini API key exists
  const hasAiKey = useMemo(() => Boolean(providerRegistry.getApiKey('gemini')), []);

  // Load recent products
  const loadRecentProducts = async () => {
    try {
      const all = await db.productProfiles.toArray();
      setRecentProfiles(all.slice(-15).reverse());
    } catch (e) {
      console.error('Failed to load product profiles', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRecentProducts();
    }
  }, [isOpen]);

  // Real-time EAN Checksum Validation
  const eanValidation = useMemo(() => {
    if (!ean.trim()) return null;
    return validateEanBarcode(ean.trim());
  }, [ean]);

  // Real-time Packaging Validation
  const packagingValidation = useMemo(() => {
    return validateIntakePackaging(outerPackSize, innerPackSize);
  }, [outerPackSize, innerPackSize]);

  // Real-time Financial Margin Validation
  const marginValidation = useMemo(() => {
    return validateIntakePricing({
      purchasePrice,
      wholesalePrice,
      retailPrice,
    });
  }, [purchasePrice, wholesalePrice, retailPrice]);

  // Real-time SKU Duplicate Collision Check
  useEffect(() => {
    let isCancelled = false;
    async function checkConflict() {
      if (!reference.trim()) {
        setCollisionWarning(null);
        return;
      }
      const check = await checkProductCollision(reference, ean);
      if (!isCancelled) {
        if (check.hasConflict) {
          setCollisionWarning(check.message || 'Conflit de référence détecté.');
        } else {
          setCollisionWarning(null);
        }
      }
    }
    const timer = setTimeout(checkConflict, 200);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [reference, ean]);

  // Is Form Submit Ready (Zero Mistakes Guarantee)
  const isFormValid = useMemo(() => {
    if (!reference.trim() || !designation.trim()) return false;
    if (collisionWarning) return false;
    if (!packagingValidation.isValid) return false;
    if (!marginValidation.isValid) return false;
    if (ean.trim() && eanValidation && !eanValidation.isValid) return false;
    return true;
  }, [reference, designation, collisionWarning, packagingValidation, marginValidation, ean, eanValidation]);

  // Handle Photo File Upload for AI Extraction
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setAiImageBase64(base64);
      setAiExtractedData(null);
      setAiError(null);
    };
    reader.readAsDataURL(file);
  };

  // Run AI Vision Extraction
  const handleRunAiAnalysis = async () => {
    if (!aiImageBase64) return;
    setIsAiAnalyzing(true);
    setAiError(null);
    hapticTap('medium');

    try {
      const result = await analyzeProductPhotoWithAi(aiImageBase64);
      setAiExtractedData(result);
      playSuccessChime();
      hapticTap('heavy');
      onToast(`IA : Article détecté avec indice de confiance ${Math.round(result.confidenceScore * 100)}% !`);
    } catch (err: any) {
      console.error('AI Analysis failed', err);
      setAiError(err.message || 'Échec de l’analyse IA');
      playWarningBeep();
      onToast('Échec de l’analyse IA. Vérifiez votre clé API dans les Paramètres.');
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // Transfer AI Data into the Form
  const handleApplyAiDataToForm = () => {
    if (!aiExtractedData) return;
    hapticTap('selection');

    if (aiExtractedData.reference) setReference(aiExtractedData.reference);
    if (aiExtractedData.ean) setEan(aiExtractedData.ean);
    if (aiExtractedData.designation) setDesignation(aiExtractedData.designation);
    if (aiExtractedData.brand) setBrand(aiExtractedData.brand);
    if (aiExtractedData.category) setCategory(aiExtractedData.category);
    if (aiExtractedData.outerPackSize) setOuterPackSize(aiExtractedData.outerPackSize);
    if (aiExtractedData.innerPackSize) setInnerPackSize(aiExtractedData.innerPackSize);
    if (aiExtractedData.purchasePrice) setPurchasePrice(String(aiExtractedData.purchasePrice));
    if (aiExtractedData.wholesalePrice) setWholesalePrice(String(aiExtractedData.wholesalePrice));
    if (aiExtractedData.retailPrice) setRetailPrice(String(aiExtractedData.retailPrice));
    if (aiExtractedData.isGoldenProduct !== undefined) setIsGoldenProduct(aiExtractedData.isGoldenProduct);
    if (aiExtractedData.transportability) setTransportability(aiExtractedData.transportability);

    playSuccessChime();
    setActiveTab('form');
    onToast('Données IA transférées dans le formulaire de validation.');
  };

  // Final Form Submission
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    hapticTap('heavy');

    try {
      const cleanRef = reference.trim().toUpperCase();
      const productPayload: Omit<ProductProfile, 'id' | 'updatedAt'> = {
        reference: cleanRef,
        designation: designation.trim(),
        outerPackSize: packagingValidation.outerPackSize,
        innerPackSize: packagingValidation.innerPackSize,
        warehouseZone: warehouseZone || null,
        locationNote: locationNote.trim() || null,
        category,
        isGoldenProduct,
        wholesalePrice: wholesalePrice ? Number(wholesalePrice) : null,
        retailPrice: retailPrice ? Number(retailPrice) : null,
        purchasePrice: purchasePrice ? Number(purchasePrice) : null,
        stockQty: 0,
        imageUrl: aiImageBase64 || null,
      };

      const newId = await saveNewProductProfile(productPayload);

      // Auto-generate arrival samples (1 Showroom + 1 El Feth + Chauffeurs) if requested
      if (autoGenerateSamples) {
        const drivers = loadDriverRoster();
        const plan = buildArrivalSamplePlan({
          items: [
            {
              reference: cleanRef,
              ean: ean.trim() || null,
              designation: designation.trim(),
              category,
              transportability,
              workerEvaluationNote: 'Création initiale catalogue nouveau produit',
            },
          ],
          activeAgents: drivers,
          managerName: activeOperator,
          consultedWorkerName: 'Équipe Réception & Saisie',
        });
        await commitArrivalSamplePlan(plan);
      }

      playSuccessChime();
      onToast(`Article [${cleanRef}] enregistré avec succès dans le catalogue !`);

      if (onProductCreated) {
        onProductCreated({ ...productPayload, id: newId, updatedAt: new Date().toISOString() });
      }

      // Reset form
      setReference('');
      setEan('');
      setDesignation('');
      setBrand('');
      setPurchasePrice('');
      setWholesalePrice('');
      setRetailPrice('');
      setAiImageBase64(null);
      setAiExtractedData(null);
      await loadRecentProducts();
      onClose();
    } catch (err: any) {
      console.error('Error saving product profile', err);
      playWarningBeep();
      onToast(`Erreur d'enregistrement : ${err.message || 'Impossible de sauvegarder'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 6, 8, 0.88)',
        backdropFilter: 'blur(16px)',
        zIndex: 970,
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
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: 920,
          maxHeight: '92vh',
          backgroundColor: '#12141a',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 24,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(16, 185, 129, 0.08)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <IconSparkles size={24} />
            </div>
            <div>
              <div className="font-extrabold text-base text-white flex items-center gap-2">
                <span>Saisie de Nouveaux Produits</span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontWeight: 800,
                  }}
                >
                  Contrôle Zéro-Erreur • Checksum EAN & Marges
                </span>
              </div>
              <div className="text-xs text-muted mt-0.5">
                Création de fiche article • Reconnaissance optique IA • Colisage & Échantillonnage
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
            style={{ width: 36, height: 36, borderRadius: 18 }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Navigation Tabs (Apple Segmented Bar) */}
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <button
            type="button"
            className={`apple-segmented-tab ${activeTab === 'form' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('form');
              hapticTap('selection');
            }}
            style={{ minHeight: 38, flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            <IconPencil size={14} />
            <span>Formulaire</span>
          </button>
          <button
            type="button"
            className={`apple-segmented-tab ${activeTab === 'ai_vision' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('ai_vision');
              hapticTap('selection');
            }}
            style={{ minHeight: 38, flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            <IconCamera size={14} />
            <span>Extraction IA {aiExtractedData ? '✓' : ''}</span>
          </button>
          <button
            type="button"
            className={`apple-segmented-tab ${activeTab === 'recent_catalog' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('recent_catalog');
              hapticTap('selection');
            }}
            style={{ minHeight: 38, flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            <IconStore size={14} />
            <span>Catalogue ({recentProfiles.length})</span>
          </button>
        </div>

        {/* Modal Body Container */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* TAB 1: FORMULAIRE & POKA-YOKE GUARDS */}
          {activeTab === 'form' && (
            <form onSubmit={handleSubmitProduct} className="flex flex-col gap-4">
              {/* Collision / Duplicate SKU Warning Banner */}
              {collisionWarning && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 14,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: 'var(--danger)',
                  }}
                >
                  <IconWarning size={18} className="shrink-0" />
                  <div className="text-xs font-bold">{collisionWarning}</div>
                </div>
              )}

              {/* Pricing & Negative Margin Error Banner */}
              {!marginValidation.isValid && marginValidation.error && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 14,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: 'var(--danger)',
                  }}
                >
                  <IconWarning size={18} className="shrink-0" />
                  <div className="text-xs font-bold">{marginValidation.error}</div>
                </div>
              )}

              {/* Row 1: Reference, EAN & Brand */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Reference Unique */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-muted uppercase">
                      RÉFÉRENCE UNIQUE *
                    </label>
                    {reference.trim() && !collisionWarning && (
                      <span className="text-[10px] text-accent font-bold flex items-center gap-0.5">
                        <IconCheck size={11} /> Réf Disponible
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    className="input input-sm w-full font-mono font-bold text-sm uppercase"
                    placeholder="Ex: CAH-96P-SBM"
                    value={reference}
                    onChange={(e) => setReference(e.target.value.toUpperCase())}
                    required
                    style={{
                      borderRadius: 10,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      borderColor: collisionWarning ? 'var(--danger)' : 'rgba(255,255,255,0.12)',
                    }}
                  />
                </div>

                {/* EAN-13 Barcode with Checksum Verification */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-muted uppercase">
                      CODE-BARRES EAN-13
                    </label>
                    {eanValidation && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '1px 6px',
                          borderRadius: 9999,
                          fontWeight: 800,
                          backgroundColor: eanValidation.isValid
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(239, 68, 68, 0.2)',
                          color: eanValidation.isValid ? 'var(--accent)' : 'var(--danger)',
                        }}
                      >
                        {eanValidation.isValid ? 'Checksum Conforme' : 'Erreur Checksum'}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      className="input input-sm w-full font-mono text-xs"
                      placeholder="Ex: 6941782115565"
                      value={ean}
                      onChange={(e) => setEan(e.target.value)}
                      style={{
                        borderRadius: 10,
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        borderColor:
                          eanValidation && !eanValidation.isValid
                            ? 'var(--danger)'
                            : 'rgba(255,255,255,0.12)',
                      }}
                    />
                  </div>
                  {eanValidation && !eanValidation.isValid && (
                    <div className="text-[10px] text-danger mt-1">
                      {eanValidation.errorReason}
                    </div>
                  )}
                </div>

                {/* Brand / Fabricant */}
                <div>
                  <label className="text-[11px] font-bold text-muted uppercase block mb-1">
                    MARQUE / FABRICANT
                  </label>
                  <input
                    type="text"
                    className="input input-sm w-full text-xs font-semibold"
                    placeholder="Ex: SBM, Oxford, Maped, Bic..."
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    style={{ borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)' }}
                  />
                </div>
              </div>

              {/* Row 2: Designation & Category */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-3">
                  <label className="text-[11px] font-bold text-muted uppercase block mb-1">
                    DÉSIGNATION COMMERCIALE NORMALISÉE *
                  </label>
                  <input
                    type="text"
                    className="input input-sm w-full text-xs font-bold"
                    placeholder="Ex: Cahier 96 Pages Seyès SBM Grand Format 24x32"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    required
                    style={{ borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-muted uppercase block mb-1">
                    CATÉGORIE
                  </label>
                  <select
                    className="select select-sm w-full text-xs font-bold"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    style={{ borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)' }}
                  >
                    <option value="scolaire">Fourniture Scolaire</option>
                    <option value="bureautique">Bureautique & Bureau</option>
                    <option value="autre">Autre / Quincaillerie</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Packaging & Colisage Sanity Guard */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-extrabold uppercase tracking-wide text-white flex items-center gap-1.5">
                    <IconBox size={14} className="text-blue-400" />
                    <span>Colisage & Conditionnement Entrepôt</span>
                  </div>
                  {!packagingValidation.isValid && (
                    <span className="text-[10px] text-danger font-bold">
                      {packagingValidation.error}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] text-muted uppercase font-bold block mb-0.5">
                      Pièces par Carton (Outer Pack) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="input input-sm w-full font-mono font-bold text-xs"
                      value={outerPackSize}
                      onChange={(e) => setOuterPackSize(parseInt(e.target.value, 10) || 1)}
                      style={{ borderRadius: 8 }}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-muted uppercase font-bold block mb-0.5">
                      Sous-paquet / Blister (Inner Pack)
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="input input-sm w-full font-mono font-bold text-xs"
                      value={innerPackSize}
                      onChange={(e) => setInnerPackSize(parseInt(e.target.value, 10) || 1)}
                      style={{ borderRadius: 8 }}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-muted uppercase font-bold block mb-0.5">
                      Macro-Zone Entrepôt
                    </label>
                    <select
                      className="select select-sm w-full text-xs font-bold"
                      value={warehouseZone || ''}
                      onChange={(e) => setWarehouseZone((e.target.value || null) as WarehouseZone)}
                      style={{ borderRadius: 8 }}
                    >
                      <option value="">Sélectionner une zone...</option>
                      {DEFAULT_WAREHOUSE_ZONES.map((z) => (
                        <option key={z.code} value={z.code}>
                          {z.label} ({z.shortLabel})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-muted uppercase font-bold block mb-0.5">
                      Emplacement / Rayon
                    </label>
                    <input
                      type="text"
                      className="input input-sm w-full text-xs"
                      placeholder="Ex: Allée 2, Rayon B-4"
                      value={locationNote}
                      onChange={(e) => setLocationNote(e.target.value)}
                      style={{ borderRadius: 8 }}
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Pricing, Margin Calculation & Safety Gauge */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: 'rgba(16, 185, 129, 0.03)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-extrabold uppercase tracking-wide text-white flex items-center gap-1.5">
                    <IconTrendingUp size={14} className="text-emerald-400" />
                    <span>Tarification & Calculateur de Marges Nettes (DA)</span>
                  </div>
                  {marginValidation.warning && (
                    <span className="text-[10px] text-warning font-bold">
                      {marginValidation.warning}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-muted uppercase font-bold block mb-0.5">
                      Prix d'Achat HT / Coût Revient (DA)
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="input input-sm w-full font-mono font-bold text-xs"
                      placeholder="Ex: 5100"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      style={{ borderRadius: 8 }}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-blue-300 uppercase font-bold block mb-0.5">
                      Prix de Vente Gros B2B (DA) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="input input-sm w-full font-mono font-bold text-xs"
                      placeholder="Ex: 6800"
                      value={wholesalePrice}
                      onChange={(e) => setWholesalePrice(e.target.value)}
                      style={{ borderRadius: 8 }}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-purple-300 uppercase font-bold block mb-0.5">
                      Prix Public / Détail Conseillé (DA)
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="input input-sm w-full font-mono font-bold text-xs"
                      placeholder="Ex: 9600"
                      value={retailPrice}
                      onChange={(e) => setRetailPrice(e.target.value)}
                      style={{ borderRadius: 8 }}
                    />
                  </div>
                </div>

                {/* Margin Health Badges */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center">
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                    }}
                  >
                    <div className="text-[10px] text-muted uppercase font-bold">Marge Brute Gros</div>
                    <div
                      className="font-mono font-extrabold text-xs"
                      style={{ color: marginValidation.marginGrosDa >= 0 ? 'var(--accent)' : 'var(--danger)' }}
                    >
                      +{marginValidation.marginGrosDa.toLocaleString('fr-DZ')} DA ({marginValidation.marginGrosPercent}%)
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                    }}
                  >
                    <div className="text-[10px] text-muted uppercase font-bold">Marge Public / Détail</div>
                    <div className="font-mono font-extrabold text-xs text-purple-300">
                      +{marginValidation.marginDetailDa.toLocaleString('fr-DZ')} DA ({marginValidation.marginDetailPercent}%)
                    </div>
                  </div>

                  <div
                    className="col-span-2 md:col-span-1 flex items-center justify-center gap-2"
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                    }}
                  >
                    <input
                      type="checkbox"
                      id="goldenCheck"
                      className="checkbox checkbox-xs checkbox-primary"
                      checked={isGoldenProduct}
                      onChange={(e) => setIsGoldenProduct(e.target.checked)}
                    />
                    <label htmlFor="goldenCheck" className="text-xs font-bold text-amber-300 cursor-pointer">
                      Article Star (Forte Rotation)
                    </label>
                  </div>
                </div>
              </div>

              {/* Row 5: Transportability & Sample Allocation */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <IconTag size={13} className="text-accent" />
                    <span>Transportabilité pour Tournées Chauffeurs :</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`btn btn-xs ${transportability === 'easily_transportable' ? 'btn-success text-white' : 'btn-ghost'}`}
                      onClick={() => setTransportability('easily_transportable')}
                      style={{ borderRadius: 9999, fontWeight: 700 }}
                    >
                      <IconCheck size={11} />
                      <span>Compact (Sacoche Chauffeur)</span>
                    </button>
                    <button
                      type="button"
                      className={`btn btn-xs ${transportability === 'bulky_refused' ? 'btn-danger text-white' : 'btn-ghost'}`}
                      onClick={() => setTransportability('bulky_refused')}
                      style={{ borderRadius: 9999, fontWeight: 700 }}
                    >
                      <IconWarning size={11} />
                      <span>Volumineux (Showroom & El Feth Uniquement)</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                  <input
                    type="checkbox"
                    id="sampleCheck"
                    className="checkbox checkbox-xs checkbox-primary"
                    checked={autoGenerateSamples}
                    onChange={(e) => setAutoGenerateSamples(e.target.checked)}
                  />
                  <label htmlFor="sampleCheck" className="text-[11px] text-muted cursor-pointer">
                    Générer automatiquement les échantillons d'arrivage (1 Showroom + 1 El Feth + 1 par Chauffeur si compact)
                  </label>
                </div>
              </div>

              {/* Primary Action Button: Submit with Poka-Yoke Lock */}
              <div
                style={{
                  position: 'sticky',
                  bottom: 0,
                  padding: '8px 0 0 0',
                  background: 'linear-gradient(180deg, rgba(18,20,26,0) 0%, rgba(18,20,26,0.95) 40%, #12141a 100%)',
                }}
              >
                <button
                  type="submit"
                  disabled={!isFormValid || isSaving}
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                  style={{
                    minHeight: 48, // Fitts's law
                    borderRadius: 16,
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    boxShadow: isFormValid ? '0 8px 24px rgba(16, 185, 129, 0.35)' : 'none',
                    opacity: isFormValid ? 1 : 0.45,
                  }}
                >
                  <IconCheck size={18} />
                  <span>
                    {isSaving
                      ? 'Enregistrement en cours...'
                      : isFormValid
                      ? 'Valider & Enregistrer le Nouveau Produit (Conforme 100%)'
                      : 'Complétez les champs requis sans erreurs pour valider'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: AI VISION EXTRACTION */}
          {activeTab === 'ai_vision' && (
            <div className="flex flex-col gap-4">
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                }}
              >
                <div className="font-extrabold text-sm text-blue-300 flex items-center gap-2">
                  <IconCamera size={16} />
                  <span>Accélération IA Multimodale • Reconnaissance Carton & Étiquette</span>
                </div>
                <div className="text-xs text-muted mt-0.5">
                  Prenez en photo le carton ou importez une photo d’emballage. L’IA extrait instantanément la référence, l'EAN, le colisage et les prix avec vérification de contrôle.
                </div>
              </div>

              {/* Upload & Snapshot Input Area */}
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />

                {aiImageBase64 ? (
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={aiImageBase64}
                      alt="Carton à analyser"
                      style={{
                        maxHeight: 260,
                        maxWidth: '100%',
                        borderRadius: 14,
                        border: '1px solid rgba(255,255,255,0.15)',
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Changer de photo
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary flex items-center gap-1.5"
                        style={{ borderRadius: 12, fontWeight: 800 }}
                        onClick={handleRunAiAnalysis}
                        disabled={isAiAnalyzing}
                      >
                        <IconSparkles size={14} />
                        <span>{isAiAnalyzing ? 'Analyse en cours...' : 'Lancer l’Extraction IA'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <IconCamera size={36} className="mx-auto mb-2 text-blue-400 opacity-60" />
                    <div className="text-sm font-bold text-white">Prendre une photo du carton ou étiquette</div>
                    <div className="text-xs text-muted mt-1 mb-3">
                      Capture nette de la référence, du code-barres et du conditionnement
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary flex items-center gap-1.5 mx-auto"
                      style={{ borderRadius: 12, fontWeight: 700 }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <IconCamera size={14} />
                      <span>Prendre Photo / Sélectionner Fichier</span>
                    </button>
                  </div>
                )}
              </div>

              {/* AI Error Warning */}
              {aiError && (
                <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-bold flex items-center gap-2">
                  <IconWarning size={15} />
                  <span>{aiError}</span>
                </div>
              )}

              {/* Extracted Data Preview Card */}
              {aiExtractedData && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-extrabold text-sm text-emerald-300 flex items-center gap-2">
                      <IconCheck size={16} />
                      <span>Données Extraites par l'IA (Confiance: {Math.round(aiExtractedData.confidenceScore * 100)}%)</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary flex items-center gap-1.5"
                      style={{ borderRadius: 12, fontWeight: 800 }}
                      onClick={handleApplyAiDataToForm}
                    >
                      <IconCheck size={14} />
                      <span>Transférer dans le Formulaire</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-2 rounded-lg bg-black/30">
                      <div className="text-[10px] text-muted uppercase font-bold">Référence</div>
                      <div className="font-mono font-extrabold text-white text-sm">
                        {aiExtractedData.reference || 'Non détectée'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-black/30">
                      <div className="text-[10px] text-muted uppercase font-bold">EAN-13 (Vérifié)</div>
                      <div className="font-mono font-bold text-accent">
                        {aiExtractedData.ean || 'Non détecté'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-black/30">
                      <div className="text-[10px] text-muted uppercase font-bold">Marque</div>
                      <div className="font-bold text-white">
                        {aiExtractedData.brand || 'Non détectée'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-black/30">
                      <div className="text-[10px] text-muted uppercase font-bold">Conditionnement</div>
                      <div className="font-mono font-bold text-blue-300">
                        {aiExtractedData.outerPackSize} pcs / carton
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-black/30 text-xs">
                    <div className="text-[10px] text-muted uppercase font-bold">Désignation Proposée</div>
                    <div className="font-bold text-white mt-0.5">
                      {aiExtractedData.designation || 'Désignation standard'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RECENT CATALOG PRODUCTS */}
          {activeTab === 'recent_catalog' && (
            <div className="flex flex-col gap-2.5">
              <div className="text-xs text-muted font-bold px-1">
                Articles récemment ajoutés au catalogue ({recentProfiles.length})
              </div>

              {recentProfiles.length === 0 ? (
                <div className="text-center py-12 text-muted text-xs">
                  Aucun article enregistré récemment.
                </div>
              ) : (
                recentProfiles.map((p) => (
                  <div
                    key={p.id || p.reference}
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
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-xs text-white">{p.reference}</span>
                        {p.isGoldenProduct && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                            Star
                          </span>
                        )}
                        <span className="text-[10px] text-muted">
                          {p.outerPackSize} pcs/ctn
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white/90 mt-0.5 truncate max-w-[280px]">
                        {p.designation}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-xs text-accent">
                        {p.wholesalePrice ? `${p.wholesalePrice.toLocaleString('fr-DZ')} DA` : 'Prix à fixer'}
                      </div>
                      <div className="text-[10px] text-muted">
                        Zone : {p.warehouseZone ? getZoneShortLabel(p.warehouseZone) : 'Non assigné'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
