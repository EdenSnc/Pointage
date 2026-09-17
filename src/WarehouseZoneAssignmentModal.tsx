import React, { useState, useEffect, useRef } from 'react';
import { db } from './db';
import {
  WAREHOUSE_ZONES,
  getZoneShortLabel,
  normalizeZoneCode,
} from './warehouseZones';
import { saveProductProfile } from './hooks';
import { scheduleVaultMirror } from './offlineVault';
import {
  IconCompass,
  IconX,
  IconCheck,
  IconZap,
  IconScan,
} from './icons';
import { findNormalBackCamera } from './logic';
import { opticalScannerCoordinator, type CatalogItemLookups } from './opticalScannerEngine';
import { playSuccessChime, hapticTap } from './audio';
import type { WarehouseZone } from './types';

interface WarehouseZoneAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOperator?: string | null;
  onZoneAssigned?: (reference: string, zone: string | null) => void;
}

interface ProductMatchItem {
  reference: string;
  designation: string;
  ean?: string | null;
  currentZone: string | null;
  linesCount: number;
}

export const WarehouseZoneAssignmentModal: React.FC<WarehouseZoneAssignmentModalProps> = ({
  isOpen,
  onClose,
  activeOperator,
  onZoneAssigned,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductMatchItem | null>(null);
  const [recentAssignments, setRecentAssignments] = useState<
    Array<{ reference: string; designation: string; zone: string; timestamp: Date }>
  >([]);
  const [searchResults, setSearchResults] = useState<ProductMatchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [assignmentToast, setAssignmentToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chambre' | 'couloir' | 'custom'>('chambre');
  const [customZoneInput, setCustomZoneInput] = useState('');

  // Dual-mode camera scanner state (Barcode + Printed Reference)
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [detectedBanner, setDetectedBanner] = useState<string | null>(null);
  const [catalogLookups, setCatalogLookups] = useState<CatalogItemLookups[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessingScanRef = useRef(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload catalog references for instant offline text & barcode matching
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadLookups = async () => {
      try {
        const profiles = await db.productProfiles.toArray();
        const lines = await db.orderLines.toArray();
        if (cancelled) return;

        const map = new Map<string, CatalogItemLookups>();
        for (const p of profiles) {
          if (p.reference) {
            map.set(p.reference.toUpperCase(), {
              reference: p.reference,
              designation: p.designation || undefined,
              ean: p.ean || null,
              aliases: p.legacyCodes || [],
            });
          }
        }
        for (const l of lines) {
          if (l.reference) {
            const key = l.reference.toUpperCase();
            if (!map.has(key)) {
              map.set(key, {
                reference: l.reference,
                designation: l.designation,
                ean: l.ean || null,
                aliases: l.referenceAliases || [],
              });
            }
          }
        }
        setCatalogLookups(Array.from(map.values()));
      } catch (e) {
        console.warn('Failed to load catalog lookups:', e);
      }
    };

    loadLookups();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Auto-focus search input on modal open and reset state
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedProduct(null);
      setSearchResults([]);
      setDetectedBanner(null);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setIsCameraActive(false);
    }
  }, [isOpen]);

  // Camera stream lifecycle & continuous dual scan loop
  useEffect(() => {
    if (!isCameraActive || !isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      try {
        let normalId: string | null = null;
        if (navigator.mediaDevices?.enumerateDevices) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            normalId = findNormalBackCamera(devices);
          } catch (e) {}
        }

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: normalId
            ? { deviceId: { exact: normalId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Start scanning loop: check barcode & printed reference text
        scanIntervalRef.current = setInterval(async () => {
          if (isProcessingScanRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
          isProcessingScanRef.current = true;

          try {
            // 1. Check Barcode first
            const barcodeHit = await opticalScannerCoordinator.detectBarcodeFromVideo(videoRef.current);
            if (barcodeHit && barcodeHit.rawCode) {
              handleDetectedCode(barcodeHit.rawCode, 'barcode');
              return;
            }

            // 2. Check Printed Reference Text on Carton
            const refHit = await opticalScannerCoordinator.detectReferenceTextFromVideo(
              videoRef.current,
              catalogLookups
            );
            if (refHit && refHit.matchedReference) {
              handleDetectedCode(refHit.matchedReference, 'reference');
              return;
            }
          } catch (e) {
            // Scanner tick error ignored
          } finally {
            isProcessingScanRef.current = false;
          }
        }, 220);
      } catch (err) {
        console.error('Failed to start camera for zone assignment:', err);
        setIsCameraActive(false);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [isCameraActive, isOpen, catalogLookups]);

  const handleDetectedCode = async (code: string, type: 'barcode' | 'reference') => {
    playSuccessChime();
    hapticTap('medium');

    const bannerMsg = type === 'barcode' ? `✓ Code-barres : ${code}` : `✓ Réf Détectée : ${code}`;
    setDetectedBanner(bannerMsg);
    setTimeout(() => setDetectedBanner(null), 3000);

    setSearchQuery(code);
    await performSearch(code);
  };

  // Search logic across productProfiles and orderLines
  const performSearch = async (query: string) => {
    const q = query.trim().toUpperCase();
    if (!q) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const qLower = query.trim().toLowerCase();

      // 1. Check ProductProfiles (Master catalog)
      const profiles = await db.productProfiles
        .filter((p) => {
          const matchRef = p.reference.toUpperCase().includes(q);
          const matchLegacy = p.legacyCodes?.some((c) => c.toUpperCase().includes(q));
          const matchDesig = p.designation?.toLowerCase().includes(qLower);
          return Boolean(matchRef || matchLegacy || matchDesig);
        })
        .limit(10)
        .toArray();

      // 2. Check OrderLines
      const lines = await db.orderLines
        .filter((l) => {
          const matchRef = Boolean(l.reference && l.reference.toUpperCase().includes(q));
          const matchEan = Boolean(l.ean && l.ean.includes(q));
          const matchDesig = l.designation.toLowerCase().includes(qLower);
          return matchRef || matchEan || matchDesig;
        })
        .limit(20)
        .toArray();

      const itemsMap = new Map<string, ProductMatchItem>();

      // Populate from profiles
      for (const p of profiles) {
        itemsMap.set(p.reference, {
          reference: p.reference,
          designation: p.designation || p.reference,
          currentZone: p.warehouseZone || null,
          linesCount: 0,
        });
      }

      // Merge and count from lines
      for (const l of lines) {
        const key = l.reference || l.ean || l.designation;
        const existing = itemsMap.get(key);
        if (existing) {
          existing.linesCount += 1;
          if (!existing.currentZone && l.warehouseZone) {
            existing.currentZone = l.warehouseZone;
          }
          if (!existing.ean && l.ean) {
            existing.ean = l.ean;
          }
        } else {
          itemsMap.set(key, {
            reference: l.reference || key,
            designation: l.designation,
            ean: l.ean || null,
            currentZone: l.warehouseZone || null,
            linesCount: 1,
          });
        }
      }

      const results = Array.from(itemsMap.values());
      setSearchResults(results);

      // If exact single barcode/reference match, auto-select it immediately!
      if (results.length === 1 && (results[0].reference.toUpperCase() === q || results[0].ean === q)) {
        handleSelectProduct(results[0]);
      }
    } catch (err) {
      console.error('Error searching products for zone assignment:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleSelectProduct(searchResults[0]);
      } else {
        performSearch(searchQuery);
      }
    }
  };

  const handleSelectProduct = (product: ProductMatchItem) => {
    setSelectedProduct(product);
    hapticTap('light');
    if (product.currentZone) {
      if (product.currentZone.startsWith('CO_')) {
        setActiveTab('couloir');
      } else if (product.currentZone.startsWith('CH_')) {
        setActiveTab('chambre');
      } else {
        setActiveTab('custom');
        setCustomZoneInput(product.currentZone);
      }
    }
  };

  const handleAssignZone = async (zoneCode: string | null) => {
    if (!selectedProduct) return;

    const normZone = (normalizeZoneCode(zoneCode) || null) as WarehouseZone | null;
    const ref = selectedProduct.reference;

    try {
      playSuccessChime();
      hapticTap('medium');

      // 1. Update master profile
      await saveProductProfile(ref, {
        designation: selectedProduct.designation,
        warehouseZone: normZone,
      });

      // 2. Update all matching orderLines in Dexie
      const matchingLines = await db.orderLines
        .filter((l) => l.reference === ref || (Boolean(selectedProduct.ean) && l.ean === selectedProduct.ean))
        .toArray();

      for (const line of matchingLines) {
        if (line.id) {
          await db.orderLines.update(line.id, {
            warehouseZone: normZone,
            updatedAt: new Date().toISOString(),
          });

          // Audit record
          await db.auditEvents.add({
            billId: line.billId,
            orderLineId: line.id,
            stage: null,
            type: 'warehouse_zone_changed',
            oldValue: selectedProduct.currentZone,
            newValue: normZone,
            reason: activeOperator
              ? `Cartographie rapide par ${activeOperator}`
              : 'Cartographie rapide entrepôt',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 3. Mirror to offline vault
      scheduleVaultMirror(150);

      // 4. Update UI state
      const zoneLabel = normZone ? getZoneShortLabel(normZone) : 'Zone effacée';
      showToast(`✓ ${ref} ➔ ${zoneLabel}`);

      setRecentAssignments((prev) => [
        {
          reference: ref,
          designation: selectedProduct.designation,
          zone: zoneLabel,
          timestamp: new Date(),
        },
        ...prev.slice(0, 4),
      ]);

      if (onZoneAssigned) {
        onZoneAssigned(ref, normZone);
      }

      // Update selected product's zone
      setSelectedProduct((prev) => (prev ? { ...prev, currentZone: normZone } : null));

      // Re-focus search input for continuous fast scanning!
      setSearchQuery('');
      setSearchResults([]);
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to assign warehouse zone:', err);
    }
  };

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setAssignmentToast(message);
    toastTimeoutRef.current = setTimeout(() => {
      setAssignmentToast(null);
    }, 2800);
  };

  if (!isOpen) return null;

  const chambreZones = WAREHOUSE_ZONES.filter((z) => z.category === 'chambre');
  const couloirZones = WAREHOUSE_ZONES.filter((z) => z.category === 'couloir');

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '92vh',
          borderRadius: 24,
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <IconCompass size={24} />
            </div>
            <div>
              <h2 className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                Cartographie Rapide & Emplacements
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Scannez un code-barres ou tapez une référence pour assigner sa zone
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors"
            title="Fermer (Échap)"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Scan / Search Bar with Camera Trigger */}
        <div className="relative">
          <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl px-3.5 py-2.5 focus-within:border-[var(--accent)] transition-all">
            <IconScan size={22} className="text-[var(--accent)] flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                performSearch(e.target.value);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Scanner code-barres EAN ou taper référence..."
              className="bg-transparent text-white text-sm w-full outline-none placeholder:text-[var(--text-muted)] font-mono"
            />
            {isSearching && (
              <span className="text-[10px] text-[var(--accent)] animate-pulse font-mono flex-shrink-0">
                Recherche...
              </span>
            )}
            {searchQuery && !isSearching && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  inputRef.current?.focus();
                }}
                className="text-[var(--text-muted)] hover:text-white p-1"
              >
                <IconX size={16} />
              </button>
            )}
            {/* Camera Toggle Button */}
            <button
              type="button"
              onClick={() => setIsCameraActive((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 shadow-sm ${
                isCameraActive
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
              }`}
              title="Activer la caméra pour scanner code-barres ou référence imprimée"
            >
              <span>📷</span>
              <span>{isCameraActive ? 'Fermer Cam' : 'Caméra'}</span>
            </button>
          </div>

          {/* Inline Smartphone Camera Viewfinder (Barcode + Carton Reference OCR) */}
          {isCameraActive && (
            <div className="mt-2 relative rounded-2xl overflow-hidden border-2 border-emerald-500/50 bg-black shadow-xl">
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="w-full h-52 sm:h-64 object-cover"
              />
              {/* Targeting Reticle & Overlay */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-3">
                {/* HUD Top Badges */}
                <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-mono text-emerald-300 border border-emerald-500/40 shadow">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Double Détection : Code-Barres &amp; Réf Carton</span>
                </div>

                {/* Target Aiming Box */}
                <div className="w-52 h-28 sm:w-64 sm:h-36 border-2 border-dashed border-emerald-400/90 rounded-2xl relative flex items-center justify-center bg-emerald-500/5">
                  <div className="text-[10px] text-emerald-300 font-bold bg-black/60 px-2 py-0.5 rounded font-mono">
                    Visez le code ou la référence
                  </div>
                </div>

                {/* Detected SKU Pill */}
                {detectedBanner ? (
                  <div className="bg-emerald-600 text-white text-xs font-bold px-3.5 py-1.5 rounded-full shadow-2xl animate-bounce border border-emerald-400">
                    {detectedBanner}
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-400 bg-black/70 px-3 py-1 rounded-full font-mono">
                    Scanne en direct...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search Dropdown (if multiple results found and none yet selected) */}
          {searchResults.length > 1 && !selectedProduct && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl z-20 max-h-56 overflow-y-auto divide-y divide-[var(--border)]">
              {searchResults.map((item) => (
                <div
                  key={item.reference}
                  onClick={() => handleSelectProduct(item)}
                  className="p-3 hover:bg-[var(--bg-card)] cursor-pointer transition-colors flex justify-between items-center"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-mono font-bold text-xs text-[var(--accent)]">
                      {item.reference}
                    </div>
                    <div className="text-sm font-semibold text-white truncate">
                      {item.designation}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {item.currentZone ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[var(--accent-glow)] text-[var(--accent)]">
                        {getZoneShortLabel(item.currentZone)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)] italic">
                        Non assigné
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Product Card */}
        {selectedProduct ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-3.5 flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-xs text-[var(--accent)] bg-[var(--accent-glow)] px-2 py-0.5 rounded-md">
                    {selectedProduct.reference}
                  </span>
                  {selectedProduct.ean && (
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      EAN: {selectedProduct.ean}
                    </span>
                  )}
                </div>
                <div className="font-bold text-sm text-white mt-1">
                  {selectedProduct.designation}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">
                  Emplacement actuel
                </div>
                <div className="font-extrabold text-xs text-[var(--accent)] mt-0.5">
                  {selectedProduct.currentZone
                    ? getZoneShortLabel(selectedProduct.currentZone)
                    : 'Non assigné'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-[var(--bg-card)]/50 border border-dashed border-[var(--border)] text-center text-xs text-[var(--text-muted)]">
            Scannez un produit ci-dessus pour activer la grille d&apos;attribution spatiale.
          </div>
        )}

        {/* Zone Selector Tabs */}
        <div className="flex gap-2 p-1 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setActiveTab('chambre')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'chambre'
                ? 'bg-[var(--accent)] text-slate-900 shadow-sm'
                : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            Chambre Principale (Boussole)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('couloir')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'couloir'
                ? 'bg-[var(--accent)] text-slate-900 shadow-sm'
                : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            Couloir (Salles 1 à 4)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'custom'
                ? 'bg-[var(--accent)] text-slate-900 shadow-sm'
                : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            Personnalisé
          </button>
        </div>

        {/* Tab 1: Chambre Principale (Compass 3x3 Grid) */}
        {activeTab === 'chambre' && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] text-center">
              Nord (Fond de l’entrepôt)
            </div>
            <div className="grid grid-cols-3 gap-2">
              {chambreZones.map((z) => {
                const isCurrent = selectedProduct?.currentZone?.includes(z.code);
                return (
                  <button
                    key={z.code}
                    type="button"
                    disabled={!selectedProduct}
                    onClick={() => handleAssignZone(z.code)}
                    className={`py-3 px-2 rounded-xl text-center border transition-all flex flex-col items-center justify-center gap-1 ${
                      !selectedProduct
                        ? 'opacity-40 cursor-not-allowed border-[var(--border)] bg-[var(--bg-card)]'
                        : isCurrent
                        ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-white shadow-md'
                        : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] text-slate-200'
                    }`}
                  >
                    <span className="font-extrabold text-xs">{z.shortLabel.replace('CH • ', '')}</span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{z.code}</span>
                    {isCurrent && (
                      <span className="text-[10px] text-[var(--accent)] font-bold flex items-center gap-0.5">
                        <IconCheck size={12} /> Actuel
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] text-center">
              Sud (Entrée / Quai de chargement)
            </div>
          </div>
        )}

        {/* Tab 2: Couloir (Salles 1 à 4) */}
        {activeTab === 'couloir' && (
          <div className="grid grid-cols-2 gap-2.5">
            {couloirZones.map((z) => {
              const isCurrent = selectedProduct?.currentZone?.includes(z.code);
              return (
                <button
                  key={z.code}
                  type="button"
                  disabled={!selectedProduct}
                  onClick={() => handleAssignZone(z.code)}
                  className={`p-3.5 rounded-xl text-left border transition-all flex flex-col justify-between gap-1.5 ${
                    !selectedProduct
                      ? 'opacity-40 cursor-not-allowed border-[var(--border)] bg-[var(--bg-card)]'
                      : isCurrent
                      ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-white shadow-md'
                      : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] text-slate-200'
                  }`}
                >
                  <div className="font-extrabold text-xs">{z.label}</div>
                  <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)]">
                    <span className="font-mono">{z.code}</span>
                    {isCurrent && (
                      <span className="text-[var(--accent)] font-bold flex items-center gap-0.5">
                        <IconCheck size={12} /> Actuel
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Tab 3: Custom Zone */}
        {activeTab === 'custom' && (
          <div className="flex gap-2">
            <input
              type="text"
              value={customZoneInput}
              onChange={(e) => setCustomZoneInput(e.target.value)}
              placeholder="Code zone personnalisé (ex: RACK-B2)..."
              className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white font-mono outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              disabled={!selectedProduct || !customZoneInput.trim()}
              onClick={() => handleAssignZone(customZoneInput.trim())}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-slate-900 font-bold text-xs hover:brightness-110 disabled:opacity-40"
            >
              Assigner
            </button>
          </div>
        )}

        {/* Unassign Button */}
        {selectedProduct && selectedProduct.currentZone && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleAssignZone(null)}
              className="text-xs text-rose-400 hover:text-rose-300 underline py-1"
            >
              Effacer l&apos;emplacement actuel
            </button>
          </div>
        )}

        {/* Toast Alert */}
        {assignmentToast && (
          <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs py-2 px-3 rounded-xl text-center flex items-center justify-center gap-1.5 animate-fade-in">
            <IconZap size={14} /> {assignmentToast}
          </div>
        )}

        {/* Recent Session History */}
        {recentAssignments.length > 0 && (
          <div className="pt-2 border-t border-[var(--border)]">
            <div className="text-[11px] font-bold text-[var(--text-muted)] mb-2 uppercase tracking-wider">
              Dernières assignations de la session
            </div>
            <div className="space-y-1.5">
              {recentAssignments.map((rec, idx) => (
                <div
                  key={`${rec.reference}-${idx}`}
                  className="flex justify-between items-center text-xs py-1 px-2.5 rounded-lg bg-[var(--bg-card)]/60"
                >
                  <span className="font-mono text-[var(--accent)] font-bold">
                    {rec.reference}
                  </span>
                  <span className="text-[var(--text-muted)] truncate max-w-[200px] text-[11px]">
                    {rec.designation}
                  </span>
                  <span className="font-extrabold text-white text-[11px]">
                    {rec.zone}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
