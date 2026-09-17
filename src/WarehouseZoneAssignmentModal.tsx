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
  IconTrash,
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
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(12px)',
        zIndex: 960,
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
          maxWidth: 480,
          maxHeight: '90vh',
          borderRadius: 24,
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
          padding: '20px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Header - Apple Liquid Glass Style */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                background: 'rgba(16, 185, 129, 0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}
            >
              <IconCompass size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2
                className="font-bold text-xs uppercase tracking-wider text-accent"
                style={{ margin: 0, color: 'var(--accent)' }}
              >
                Cartographie Rapide &amp; Emplacements
              </h2>
              <div
                className="font-semibold text-sm truncate"
                style={{ color: 'var(--text-primary)', marginTop: 1 }}
              >
                Assignation d&apos;Emplacement Rayon
              </div>
              <div className="text-xs text-muted">
                Scannez ou recherchez un produit
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-icon"
            style={{ borderRadius: 9999, color: 'var(--text-muted)' }}
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer (Échap)"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Unified Search & Camera Pill Bar */}
        <div className="relative">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 9999,
              padding: '4px 6px 4px 14px',
              transition: 'border-color 0.2s ease',
            }}
          >
            <IconScan size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
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
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                width: '100%',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
            {isSearching && (
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--accent)',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                ...
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
                className="btn btn-ghost btn-xs btn-icon"
                style={{ borderRadius: 9999, color: 'var(--text-muted)', padding: 4 }}
                title="Effacer"
              >
                <IconX size={14} />
              </button>
            )}
            {/* Apple Camera Toggle Pill Button */}
            <button
              type="button"
              onClick={() => setIsCameraActive((prev) => !prev)}
              className="btn btn-xs flex items-center gap-1"
              style={{
                borderRadius: 9999,
                fontSize: '0.75rem',
                padding: '5px 12px',
                fontWeight: 700,
                flexShrink: 0,
                background: isCameraActive ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                color: isCameraActive ? 'var(--danger)' : 'var(--accent)',
                border: `1px solid ${isCameraActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
              }}
              title="Activer la caméra pour scanner code-barres ou référence imprimée"
            >
              <span>{isCameraActive ? '✕ Fermer Cam' : '📷 Caméra'}</span>
            </button>
          </div>

          {/* Smartphone Camera Viewfinder */}
          {isCameraActive && (
            <div
              style={{
                marginTop: 10,
                position: 'relative',
                borderRadius: 20,
                overflow: 'hidden',
                border: '1px solid var(--accent)',
                background: '#000000',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                style={{ width: '100%', height: 190, objectFit: 'cover' }}
              />
              {/* Frosted HUD Overlays */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 10,
                }}
              >
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.65)',
                    backdropFilter: 'blur(8px)',
                    padding: '4px 12px',
                    borderRadius: 9999,
                    fontSize: '0.72rem',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    fontWeight: 600,
                  }}
                >
                  Double Détection : Code-Barres &amp; Réf Carton
                </div>

                <div
                  style={{
                    width: 200,
                    height: 90,
                    borderRadius: 16,
                    border: '2px dashed rgba(52, 211, 153, 0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(16, 185, 129, 0.04)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: '#ffffff',
                      background: 'rgba(0, 0, 0, 0.6)',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      fontWeight: 600,
                    }}
                  >
                    Visez le code ou la référence
                  </span>
                </div>

                {detectedBanner ? (
                  <div
                    style={{
                      background: 'var(--accent)',
                      color: '#ffffff',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      padding: '4px 14px',
                      borderRadius: 9999,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    }}
                  >
                    {detectedBanner}
                  </div>
                ) : (
                  <div style={{ height: 18 }} />
                )}
              </div>
            </div>
          )}

          {/* Search Dropdown Results */}
          {searchResults.length > 1 && !selectedProduct && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 6,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 18,
                boxShadow: 'var(--shadow-xl)',
                zIndex: 30,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {searchResults.map((item) => (
                <div
                  key={item.reference}
                  onClick={() => handleSelectProduct(item)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ minWidth: 0, paddingRight: 8 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        color: 'var(--accent)',
                      }}
                    >
                      {item.reference}
                    </div>
                    <div
                      className="truncate"
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {item.designation}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    {item.currentZone ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 9999,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: 'var(--accent)',
                        }}
                      >
                        {getZoneShortLabel(item.currentZone)}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Non assigné
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignment Feedback Toast */}
        {assignmentToast && (
          <div
            className="animate-fade-in"
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: 'var(--accent)',
              fontWeight: 800,
              fontSize: '0.78rem',
              padding: '7px 14px',
              borderRadius: 9999,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <IconZap size={14} /> {assignmentToast}
          </div>
        )}

        {/* Selected Product Card or Empty State */}
        {selectedProduct ? (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 18,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div className="flex justify-between items-start gap-2">
              <div style={{ minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: 'var(--accent)',
                    }}
                  >
                    {selectedProduct.reference}
                  </span>
                  {selectedProduct.ean && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      EAN: {selectedProduct.ean}
                    </span>
                  )}
                </div>
                <div
                  className="truncate"
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginTop: 3,
                  }}
                  title={selectedProduct.designation}
                >
                  {selectedProduct.designation}
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Emplacement
                </div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    color: selectedProduct.currentZone ? 'var(--accent)' : 'var(--text-muted)',
                    marginTop: 1,
                  }}
                >
                  {selectedProduct.currentZone
                    ? getZoneShortLabel(selectedProduct.currentZone)
                    : 'Non assigné'}
                </div>
              </div>
            </div>

            {selectedProduct.currentZone && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => handleAssignZone(null)}
                  className="btn btn-ghost btn-xs text-danger flex items-center gap-1"
                  style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 9999 }}
                >
                  <IconTrash size={12} /> Effacer l&apos;emplacement
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 16,
              background: 'var(--bg-card)',
              border: '1px dashed var(--border)',
              textAlign: 'center',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
            }}
          >
            Scannez un produit ci-dessus pour activer la grille d&apos;attribution spatiale.
          </div>
        )}

        {/* Category Navigation Tabs (Apple Liquid Glass Pill Control) */}
        <div
          className="flex gap-1 p-1"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 9999,
          }}
        >
          <button
            type="button"
            aria-label="Chambre Principale (Boussole)"
            className={`btn btn-xs flex-1 ${activeTab === 'chambre' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '6px 8px', borderRadius: 9999, whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('chambre')}
          >
            <span style={{ display: 'none' }}>Chambre Principale (Boussole)</span>
            <span>Chambre</span>
          </button>
          <button
            type="button"
            aria-label="Couloir (Salles 1 à 4)"
            className={`btn btn-xs flex-1 ${activeTab === 'couloir' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '6px 8px', borderRadius: 9999, whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('couloir')}
          >
            <span style={{ display: 'none' }}>Couloir (Salles 1 à 4)</span>
            <span>Couloir (Salles 1–4)</span>
          </button>
          <button
            type="button"
            aria-label="Personnalisé"
            className={`btn btn-xs flex-1 ${activeTab === 'custom' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '6px 8px', borderRadius: 9999, whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('custom')}
          >
            <span>Personnalisé</span>
          </button>
        </div>

        {/* Tab 1: Chambre Principale (Apple 3x3 Compass Grid) */}
        {activeTab === 'chambre' && (
          <div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex justify-between items-center px-1">
              <span>Chambre Principale</span>
              <span className="text-[10px] text-muted">Touchez pour assigner</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
              }}
            >
              {[1, 2, 3].map((r) =>
                [1, 2, 3].map((c) => {
                  const z = chambreZones.find((item) => item.compassRow === r && item.compassCol === c);
                  if (!z) return <div key={`${r}-${c}`} />;
                  const isCurrent = Boolean(
                    selectedProduct?.currentZone && selectedProduct.currentZone.includes(z.code)
                  );
                  const isEntrance = z.code === 'CH_SW';
                  const isCouloirAccess = z.code === 'CH_W' || z.code === 'CH_NW';

                  return (
                    <button
                      key={z.code}
                      type="button"
                      disabled={!selectedProduct}
                      className="flex flex-col items-center justify-center text-center transition-all"
                      style={{
                        minHeight: 64,
                        padding: '8px 4px',
                        borderRadius: 16,
                        background: isCurrent ? 'rgba(16, 185, 129, 0.18)' : 'var(--bg-card)',
                        border: isCurrent ? '2px solid var(--accent)' : '1px solid var(--border)',
                        cursor: selectedProduct ? 'pointer' : 'not-allowed',
                        opacity: selectedProduct ? 1 : 0.45,
                        position: 'relative',
                      }}
                      onClick={() => handleAssignZone(z.code)}
                    >
                      <span
                        className="text-xs font-bold leading-tight"
                        style={{ color: isCurrent ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {z.shortLabel.replace('CH • ', '')}
                      </span>
                      <span
                        className="font-mono text-[9px] mt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {z.code}
                      </span>

                      {isEntrance && (
                        <span
                          aria-hidden="true"
                          className="mt-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{
                            borderRadius: 9999,
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#60a5fa',
                          }}
                        >
                          Entrée
                        </span>
                      )}

                      {isCouloirAccess && !isEntrance && (
                        <span
                          aria-hidden="true"
                          className="mt-1 px-1.5 py-0.5 text-[9px] text-muted font-semibold"
                          style={{
                            borderRadius: 9999,
                            background: 'rgba(0, 0, 0, 0.05)',
                          }}
                        >
                          Couloir
                        </span>
                      )}

                      {isCurrent && (
                        <span
                          aria-hidden="true"
                          className="mt-1 px-1.5 py-0.5 text-[10px] text-accent font-extrabold flex items-center gap-0.5"
                          style={{ borderRadius: 9999, background: 'rgba(16, 185, 129, 0.15)' }}
                        >
                          <IconCheck size={11} /> Actuel
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Couloir (Salles 1 à 4) */}
        {activeTab === 'couloir' && (
          <div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex justify-between items-center px-1">
              <span>Salles du Couloir</span>
              <span className="text-[10px] text-muted">Touchez pour assigner</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {couloirZones.map((z) => {
                const isCurrent = Boolean(
                  selectedProduct?.currentZone && selectedProduct.currentZone.includes(z.code)
                );
                return (
                  <button
                    key={z.code}
                    type="button"
                    disabled={!selectedProduct}
                    onClick={() => handleAssignZone(z.code)}
                    className="p-3 rounded-2xl text-left transition-all flex flex-col justify-between gap-1"
                    style={{
                      minHeight: 64,
                      background: isCurrent ? 'rgba(16, 185, 129, 0.18)' : 'var(--bg-card)',
                      border: isCurrent ? '2px solid var(--accent)' : '1px solid var(--border)',
                      cursor: selectedProduct ? 'pointer' : 'not-allowed',
                      opacity: selectedProduct ? 1 : 0.45,
                    }}
                  >
                    <div
                      className="font-extrabold text-xs"
                      style={{ color: isCurrent ? 'var(--accent)' : 'var(--text-primary)' }}
                    >
                      {z.label}
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-muted">
                      <span className="font-mono">{z.code}</span>
                      {isCurrent && (
                        <span
                          className="text-accent font-bold flex items-center gap-0.5"
                          style={{ color: 'var(--accent)' }}
                        >
                          <IconCheck size={12} /> Actuel
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
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
              style={{
                flex: 1,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 9999,
                padding: '8px 16px',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              disabled={!selectedProduct || !customZoneInput.trim()}
              onClick={() => handleAssignZone(customZoneInput.trim())}
              className="btn btn-primary btn-sm"
              style={{ borderRadius: 9999, padding: '8px 18px', fontWeight: 700 }}
            >
              Assigner
            </button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ borderRadius: 9999, color: 'var(--text-muted)' }}
          >
            Fermer
          </button>
          {recentAssignments.length > 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {recentAssignments.length} article{recentAssignments.length > 1 ? 's' : ''} mis à jour
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
