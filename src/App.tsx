// ============================================================
// POINTAGE — Main Application
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import {
  useActiveSession,
  useSessionBills,
  useBill,
  useBillLines,
  useOrderLine,
  useLineEvents,
  useBillEvents,
  useBillContainers,
  useEntityContainers,
  useBillAudit,
  useBillOverrides,
  useAllSessionOverrides,
  useProductProfile,
  useBillExtras,
  useAllSessionLines,
  useEntityBills,
  useEntityLines,
  useEntityEvents,
  addCountEvent,
  batchAssignContainerAndCount,
  undoLastCount,
  undoLastBillCount,
  resetLineStageCount,
  setLineStageTotalCount,
  transferLineStageCounts,
  transferBatchStageCounts,
  updateOrderLineField,
  updateLineStatus,
  createTransportContainer,
  substituteOrderLine,
  addExtra,
  addIdentifierOverride,
  addIdentifierSuggestion,
  saveProductProfile,
  searchLines,
} from './hooks';
import { useHardwareScanner } from './useHardwareScanner';
import {
  calcBatchQty,
  sumStageEvents,
  calcDiscrepancy,
  calcBillProgress,
  getStageTotals,
  calcClosestPackRecommendation,
  isDimensionInDesignation,
  getStageProblemLines,
  parsePackagingString,
  serializeCountsForQR,
  parseQRSyncPayload,
  planQRMerge,
  findNormalBackCamera,
  getAvailableBackCameras,
  BackCameraInfo,
  QRSyncPayload,
} from './logic';
import { parseImportJSON, importBills, getOrCreateSession, validateImport } from './importer';
import { exportBackup, importBackup, downloadBackup, shareBackup } from './backup';
import type { BackupData } from './backup';
import type {
  Stage,
  Bill,
  OrderLine,
  CountEvent,
  LineStatus,
  PointageOutcome,
  ChangeReason,
  SearchMode,
  TransportContainer,
} from './types';

import {
  BrandLogo,
  BrandWordmark,
  IconScan,
  IconImport,
  IconDisk,
  IconClipboard,
  IconBox,
  IconPencil,
  IconWarning,
  IconSearch,
  IconCheck,
  IconX,
  IconBan,
  IconUndo,
  IconPlus,
  IconChart,
  IconShare,
  IconFolder,
  IconBolt,
  IconArrowLeft,
  IconLayers,
  IconHash,
  IconHelp,
  IconCamera,
  IconKey,
  IconEye,
  IconEyeOff,
  IconSettings,
  IconSend,
  IconBuilding,
  IconMail,
  IconFileSpreadsheet,
  IconTable,
  IconVolume,
  IconVolumeX,
  IconTrash,
  IconBag,
  IconRotate,
  IconTag,
  IconTransfer,
} from './icons';

import {
  buildFinalBillRows,
  compileFinalBillData,
  downloadFinalBillExcel,
  shareFinalBillViaWhatsAppOrFile,
  formatFinalBillWhatsAppMessage,
  resolveDocumentType,
  type DocumentExportType,
} from './excelExport';

import { OnboardingWalkthrough } from './OnboardingWalkthrough';
import { providerRegistry } from './ai/providerRegistry';
import { ErrorBoundary } from './ErrorBoundary';
import { SettingsModal } from './SettingsModal';
import { FastScanQuantityCard } from './FastScanQuantityCard';
import { ConformityDonutChart } from './ConformityDonutChart';
import {
  playSuccessChime,
  playWarningBeep,
  playExactMatchChime,
  playUndoBeep,
  playErrorBeep,
  hapticTap,
  isAudioMuted,
  setAudioMuted,
} from './audio';

export interface ToastItem {
  message: string;
  onUndo?: () => void | Promise<void>;
  undoLabel?: string;
}

// ---- Toast ----
let toastTimeout: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string | ToastItem, setToast: (m: any) => void, duration = 2500) {
  setToast(msg);
  if (toastTimeout) clearTimeout(toastTimeout);
  const timeoutMs = typeof msg === 'object' && msg.onUndo ? 5000 : duration;
  toastTimeout = setTimeout(() => setToast(''), timeoutMs);
}

// ---- App Shell ----
export default function App() {
  const [toast, setToast] = useState<string | ToastItem>('');
  const [showWalkthrough, setShowWalkthrough] = useState(() => {
    return localStorage.getItem('pointage_onboarded') !== 'true';
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    // Default to clean, high-contrast light mode
    const saved = localStorage.getItem('pointage_theme');
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    return 'light';
  });


  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pointage_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  return (
    <HashRouter>
      <ErrorBoundary>
        <Routes>
          <Route
            path="/"
            element={
              <HomeScreen
                setToast={setToast}
                theme={theme}
                toggleTheme={toggleTheme}
                onOpenWalkthrough={() => setShowWalkthrough(true)}
              />
            }
          />
          <Route path="/import" element={<ImportScreen setToast={setToast} />} />
          <Route path="/bill/:billId" element={<BillScreen setToast={setToast} />} />
          <Route path="/bill/:billId/line/:lineId" element={<ProductScreen setToast={setToast} />} />
          <Route path="/bill/:billId/summary" element={<SummaryScreen setToast={setToast} />} />

          <Route path="/scan" element={<GlobalScanScreen setToast={setToast} />} />
          <Route
            path="/backup"
            element={
              <BackupScreen
                setToast={setToast}
                onOpenWalkthrough={() => setShowWalkthrough(true)}
              />
            }
          />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/bill/:billId/extras" element={<ExtrasScreen setToast={setToast} />} />
        </Routes>
      </ErrorBoundary>
      {toast && (
        <div className="toast flex items-center justify-between gap-3" style={{ minWidth: 260 }}>
          <span>{typeof toast === 'string' ? toast : toast.message}</span>
          {typeof toast !== 'string' && toast.onUndo && (
            <button
              type="button"
              className="toast-undo-btn"
              onClick={async () => {
                const action = toast.onUndo;
                setToast('');
                if (action) await action();
              }}
            >
              {toast.undoLabel || 'Annuler'}
            </button>
          )}
        </div>
      )}
      <OnboardingWalkthrough
        isOpen={showWalkthrough}
        onClose={() => setShowWalkthrough(false)}
      />
    </HashRouter>
  );

}

// ---- Reusable Audio / Haptic Mute Toggle ----
function AudioMuteButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [muted, setMuted] = useState(() => isAudioMuted());

  const toggle = () => {
    const next = !muted;
    setAudioMuted(next);
    setMuted(next);
    hapticTap('light');
    if (!next) {
      playSuccessChime();
    }
  };

  return (
    <button
      type="button"
      className={className || 'header-icon-btn'}
      style={{
        color: muted ? 'var(--text-muted)' : 'var(--accent)',
        ...style,
      }}
      onClick={toggle}
      title={muted ? 'Activer le son et les vibrations' : 'Couper les retours sonores'}
      aria-label={muted ? 'Activer le son' : 'Couper le son'}
    >
      {muted ? <IconVolumeX size={18} /> : <IconVolume size={18} />}
    </button>
  );
}

// ---- Reusable API Key Configuration Modal ----
function ApiKeyModal({
  isOpen,
  onClose,
  setToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  setToast: (m: string) => void;
}) {
  const activeProvider = providerRegistry.getActiveProvider();
  const [keyVal, setKeyVal] = useState(() => providerRegistry.getApiKey(activeProvider.id));
  const [modelVal, setModelVal] = useState(() => providerRegistry.getSelectedModel(activeProvider.id));

  if (!isOpen) return null;

  const handleSave = () => {
    providerRegistry.setApiKey(activeProvider.id, keyVal);
    providerRegistry.setSelectedModel(activeProvider.id, modelVal);
    onClose();
    showToast('Clé Gemini enregistrée sur votre appareil', setToast);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title flex items-center gap-2">
          <IconKey size={18} style={{ color: 'var(--accent)' }} /> Clé API Google Gemini
        </div>
        <div className="text-xs text-muted mb-3">
          Clé stockée localement sur cet appareil.
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <div className="mb-3">
            <span className="text-xs text-muted font-bold block mb-1">CLÉ D’API</span>
            <input
              id="modal-gemini-key-input"
              name="modalGeminiKey"
              aria-label="Clé d'API Google Gemini"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Collez votre clé API Gemini ici..."
              value={keyVal}
              onChange={(e) => setKeyVal(e.target.value)}
              autoFocus
            />
          </div>

          <div className="mb-4">
            <span className="text-xs text-muted font-bold block mb-1">MODÈLE</span>
            <div className="seg-control">
              {activeProvider.models.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`seg-btn ${modelVal === m.id ? 'active' : ''}`}
                  onClick={() => setModelVal(m.id)}
                  style={{ fontSize: '0.72rem' }}
                >
                  {m.id === 'gemini-3.5-flash-lite' ? 'Flash Lite 3.5' : m.id === 'gemini-3.8-flash' ? '3.8 Flash' : m.id === 'gemini-3.5-flash' ? '3.5 Flash' : m.id.replace('gemini-', '')}
                </button>
              ))}
            </div>
          </div>

          <div className="confirm-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              ANNULER
            </button>
            <button type="submit" className="btn btn-success">
              ENREGISTRER
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Reusable QR Code Multi-Phone Merge Modal ----
function QRSyncModal({
  isOpen,
  onClose,
  billId,
  initialPayload,
  initialTab = 'export',
  setToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  billId: number;
  initialPayload?: QRSyncPayload | null;
  initialTab?: 'export' | 'import';
  setToast?: (m: string) => void;
}) {
  const bill = useBill(billId);
  const lines = useBillLines(billId);
  const events = useBillEvents(billId);
  const containers = useBillContainers(billId);

  const [tab, setTab] = useState<'export' | 'import'>(initialPayload ? 'import' : initialTab);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [mergeMode, setMergeMode] = useState<'add' | 'replace'>('add');
  const [payload, setPayload] = useState<QRSyncPayload | null>(initialPayload || null);
  const [manualText, setManualText] = useState<string>('');
  const [isCameraScanning, setIsCameraScanning] = useState(false);
  const [mergeExecuting, setMergeExecuting] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (initialPayload) {
      setPayload(initialPayload);
      setTab('import');
    }
  }, [initialPayload]);

  useEffect(() => {
    if (!isOpen) {
      setIsCameraScanning(false);
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(t => t.stop());
        cameraStreamRef.current = null;
      }
    }
  }, [isOpen]);

  // Generate QR code on export
  useEffect(() => {
    if (!isOpen || tab !== 'export' || !bill) return;

    let cancelled = false;
    const containerMap = new Map<number, string>();
    for (const c of containers) {
      if (c.id) containerMap.set(c.id, c.label || c.name || '');
    }

    const json = serializeCountsForQR(bill.billNumber, bill.client, lines, events, containerMap);

    import('qrcode')
      .then((QRCodeModule) => {
        if (cancelled) return;
        const QRCode = (QRCodeModule as any).default || QRCodeModule;
        QRCode.toDataURL(json, {
          width: 320,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        })
          .then((url: string) => {
            if (!cancelled) setQrDataUrl(url);
          })
          .catch((err: any) => console.error('QR generation error:', err));
      })
      .catch((err) => console.error('qrcode module import error:', err));

    return () => {
      cancelled = true;
    };
  }, [isOpen, tab, bill?.id, lines.length, events.length, containers.length]);

  // Handle camera scanning inside modal
  useEffect(() => {
    if (!isCameraScanning || !cameraVideoRef.current) return;

    let cancelled = false;
    let reader: any = null;

    const startScanner = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
        reader = new BrowserMultiFormatReader(hints);

        if (cameraVideoRef.current && !cancelled) {
          const normalId = navigator.mediaDevices?.enumerateDevices
            ? findNormalBackCamera(await navigator.mediaDevices.enumerateDevices())
            : null;
          const qrConstraints: MediaTrackConstraints = normalId
            ? { deviceId: { exact: normalId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };

          await reader.decodeFromConstraints(
            {
              audio: false,
              video: qrConstraints,
            },
            cameraVideoRef.current,
            (result: any) => {
              if (result && !cancelled) {
                const text = result.getText();
                const p = parseQRSyncPayload(text);
                if (p) {
                  cancelled = true;
                  playSuccessChime();
                  setPayload(p);
                  setIsCameraScanning(false);
                  if (cameraStreamRef.current) {
                    cameraStreamRef.current.getTracks().forEach(t => t.stop());
                    cameraStreamRef.current = null;
                  }
                }
              }
            }
          );

          if (cameraVideoRef.current?.srcObject) {
            cameraStreamRef.current = cameraVideoRef.current.srcObject as MediaStream;
          }
        }
      } catch (err) {
        console.error('Modal scanner error:', err);
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(t => t.stop());
        cameraStreamRef.current = null;
      }
    };
  }, [isCameraScanning]);

  if (!isOpen || !bill) return null;

  // Plan merge preview
  const mergePlan = payload ? planQRMerge(lines, events, payload, mergeMode) : null;

  // Execute merge
  const handleApplyMerge = async () => {
    if (!mergePlan || mergePlan.items.length === 0) return;
    setMergeExecuting(true);

    try {
      const containerNameMap = new Map<string, number>();
      for (const c of containers) {
        if (c.id && c.label) containerNameMap.set(c.label.trim().toLowerCase(), c.id);
      }

      for (const item of mergePlan.items) {
        let containerId: number | undefined = undefined;
        if (item.containerName) {
          const normName = item.containerName.trim().toLowerCase();
          if (containerNameMap.has(normName)) {
            containerId = containerNameMap.get(normName);
          } else {
            const newC = await createTransportContainer(billId, bill?.client, item.containerName, 'carton');
            if (newC.id != null) {
              containerNameMap.set(normName, newC.id);
              containerId = newC.id;
            }
          }
        }

        await addCountEvent(
          billId,
          item.lineId,
          item.stage,
          item.incomingQty,
          containerId,
          item.outcome || undefined,
          item.note || undefined
        );
      }

      playSuccessChime();
      if (setToast) {
        showToast(`Fusion réussie : +${mergePlan.totalQtyAdded} pièces fusionnées !`, setToast);
      }
      onClose();
    } catch (err) {
      console.error('Error applying QR merge:', err);
      if (setToast) setToast('Erreur lors de la fusion');
    } finally {
      setMergeExecuting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <div className="modal-title flex items-center gap-2" style={{ margin: 0 }}>
            <IconLayers size={18} style={{ color: 'var(--accent)' }} /> FUSION HORS-LIGNE
          </div>
          <button type="button" className="btn btn-xs btn-secondary btn-icon" onClick={onClose}>
            <IconX size={14} />
          </button>
        </div>

        {/* Tabs: Émettre / Recevoir */}
        <div className="seg-control mb-3">
          <button
            type="button"
            className={`seg-btn ${tab === 'export' ? 'active' : ''}`}
            onClick={() => { setTab('export'); setIsCameraScanning(false); }}
          >
            ÉMETTRE QR
          </button>
          <button
            type="button"
            className={`seg-btn ${tab === 'import' ? 'active' : ''}`}
            onClick={() => setTab('import')}
          >
            RECEVOIR / FUSIONNER
          </button>
        </div>

        {/* TAB 1: EXPORT QR */}
        {tab === 'export' && (
          <div>
            <div className="text-xs text-muted mb-2 text-center">
              Montrez ce QR Code à l'autre téléphone pour synchroniser vos pointages en direct sans connexion.
            </div>

            <div className="qr-display-container">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Pointage" className="qr-code-img" />
              ) : (
                <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner" />
                </div>
              )}
              <div className="font-bold text-xs mt-2 text-center" style={{ color: '#0f172a' }}>
                {bill.billNumber}
              </div>
              <div className="text-xs text-muted text-center" style={{ color: '#475569' }}>
                {bill.client}
              </div>
            </div>

            <div className="flex justify-between items-center text-xs text-secondary px-2 mt-2">
              <span>{events.filter(e => !e.undone).length} saisies</span>
              <span>Total : {events.filter(e => !e.undone).reduce((sum, e) => sum + e.quantity, 0)} pièces</span>
            </div>
          </div>
        )}

        {/* TAB 2: IMPORT / MERGE */}
        {tab === 'import' && (
          <div>
            {!payload ? (
              <div>
                <div className="text-xs text-muted mb-3">
                  Scannez l'écran du second téléphone pour importer ses pointages dans votre bon.
                </div>

                {isCameraScanning ? (
                  <div className="mb-3" style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height: 240, background: '#000' }}>
                    <video ref={cameraVideoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}
                      onClick={() => setIsCameraScanning(false)}
                    >
                      Arrêter
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-full flex items-center justify-center gap-2 mb-3"
                    onClick={() => setIsCameraScanning(true)}
                  >
                    <IconCamera size={16} /> Scanner le QR du collègue
                  </button>
                )}

                <div className="divider" style={{ margin: '14px 0' }} />

                <div className="text-xs text-muted mb-1 font-semibold">OU COLLER LE TEXTE DU QR :</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input"
                    placeholder='{"ptg":1,...}'
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const p = parseQRSyncPayload(manualText);
                      if (p) {
                        setPayload(p);
                      } else if (setToast) {
                        setToast('Format QR Code invalide');
                      }
                    }}
                  >
                    OK
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm text-accent">Pointages détectés</span>
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    onClick={() => { setPayload(null); setManualText(''); }}
                  >
                    Changer
                  </button>
                </div>

                {payload.billNumber && payload.billNumber !== bill.billNumber && (
                  <div className="p-2 mb-2 text-xs" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: 8 }}>
                    ⚠️ QR issu de "{payload.billNumber}" (actuel : "{bill.billNumber}")
                  </div>
                )}

                <div className="flex gap-2 mb-2">
                  <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                    {mergePlan?.matchedLinesCount || 0} articles
                  </span>
                  <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                    +{mergePlan?.totalQtyAdded || 0} pièces
                  </span>
                </div>

                {/* Merge mode selector */}
                <div className="seg-control mb-2" style={{ fontSize: '0.75rem' }}>
                  <button
                    type="button"
                    className={`seg-btn ${mergeMode === 'add' ? 'active' : ''}`}
                    onClick={() => setMergeMode('add')}
                  >
                    + ADDITIONNER (Conseillé)
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${mergeMode === 'replace' ? 'active' : ''}`}
                    onClick={() => setMergeMode('replace')}
                  >
                    ⟳ REMPLACER
                  </button>
                </div>

                {/* Items to merge list */}
                <div className="qr-preview-list">
                  {mergePlan?.items.map((item, idx) => (
                    <div key={idx} className="qr-preview-item">
                      <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                        <div className="font-bold text-xs truncate">
                          N°{item.lineNo} • {item.designation}
                        </div>
                        <div className="text-xs text-muted truncate">
                          {item.containerName ? `Carton: ${item.containerName}` : 'Hors carton'}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-mono font-bold text-accent">
                          +{item.incomingQty}
                        </div>
                        <div className="text-xs text-muted" style={{ fontSize: '0.65rem' }}>
                          Total: {item.newStageQty}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-full flex items-center justify-center gap-2 mt-3"
                  disabled={mergeExecuting || (mergePlan?.items.length || 0) === 0}
                  onClick={handleApplyMerge}
                >
                  <IconCheck size={16} /> Valider la fusion (+{mergePlan?.totalQtyAdded || 0} pcs)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// HOME SCREEN
// ============================================================
function HomeScreen({
  setToast,
  theme,
  toggleTheme,
  onOpenWalkthrough,
}: {
  setToast: (m: string) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  onOpenWalkthrough: () => void;
}) {
  const nav = useNavigate();
  const session = useActiveSession();
  const bills = useSessionBills(session?.id);
  const allLines = useAllSessionLines(session?.id);
  const [homeSearch, setHomeSearch] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showManualBillModal, setShowManualBillModal] = useState(false);
  const [showQuantities, setShowQuantities] = useState(() => localStorage.getItem('pointage_show_quantities') === 'true');

  const toggleShowQuantities = () => {
    setShowQuantities(prev => {
      const next = !prev;
      localStorage.setItem('pointage_show_quantities', String(next));
      showToast(next ? 'Quantités visibles' : 'Quantités masquées (Mode aveugle)', setToast);
      return next;
    });
  };

  useEffect(() => {
    getOrCreateSession();
  }, []);

  const [billFilter, setBillFilter] = useState<'active' | 'archived'>('active');

  const activeBills = bills.filter(b => b.status === 'active');
  const archivedBills = bills.filter(b => b.status === 'completed');
  const displayBills = billFilter === 'active' ? activeBills : archivedBills;

  const matchedGlobalLines = React.useMemo(() => {
    if (!homeSearch.trim() || !allLines) return [];
    return searchLines(allLines, homeSearch, 'smart');
  }, [homeSearch, allLines]);

  const handleArchiveBill = async (billId: number) => {
    await db.bills.update(billId, { status: 'completed' });
    showToast(
      {
        message: 'Bon archivé dans l’historique',
        onUndo: async () => {
          await db.bills.update(billId, { status: 'active' });
          showToast('Bon restauré dans les bons actifs', setToast);
        },
        undoLabel: 'Annuler (5s)',
      },
      setToast as any,
      5000
    );
  };

  const handleRestoreBill = async (billId: number) => {
    await db.bills.update(billId, { status: 'active' });
    showToast('Bon restauré dans les bons actifs', setToast);
  };

  // Group displayed bills by client entity
  const clientGroups = React.useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const b of displayBills) {
      const key = (b.client || 'CLIENT DIVERS').trim().toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries()).map(([client, clientBills]) => ({
      client,
      bills: clientBills,
    }));
  }, [displayBills]);

  return (
    <>
      <header className="app-header">
        <div className="brand-container" onClick={() => nav('/')} title="Pointage">
          <BrandLogo size={32} />
          <div className="brand-text">
            <span className="brand-title">Pointage</span>
            <span className="brand-pill">SURFACE</span>
          </div>
        </div>

        <div className="header-meta">
          <button
            type="button"
            className="header-icon-btn"
            onClick={toggleShowQuantities}
            title={showQuantities ? 'Quantités visibles (Cliquer pour masquer)' : 'Quantités masquées (Cliquer pour afficher)'}
            aria-label={showQuantities ? 'Masquer les quantités' : 'Afficher les quantités'}
          >
            {showQuantities ? <IconEye size={18} style={{ color: 'var(--accent)' }} /> : <IconEyeOff size={18} />}
          </button>
          <AudioMuteButton className="header-icon-btn" />
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => setShowSettingsModal(true)}
            title="Paramètres, Quotas & Thème"
            aria-label="Paramètres"
          >
            <IconSettings size={18} />
          </button>
        </div>
      </header>

      <div className="app-content">
        {/* BL Filter Tabs */}
        <div className="flex gap-2 mb-3">
          <button
            className={`btn btn-sm ${billFilter === 'active' ? 'btn-primary' : 'btn-secondary'} flex-1 flex items-center justify-center gap-1`}
            onClick={() => setBillFilter('active')}
          >
            <IconBox size={15} /> Bons Actifs ({activeBills.length})
          </button>
          <button
            className={`btn btn-sm ${billFilter === 'archived' ? 'btn-primary' : 'btn-secondary'} flex-1 flex items-center justify-center gap-1`}
            onClick={() => setBillFilter('archived')}
          >
            <IconClipboard size={15} /> Historique ({archivedBills.length})
          </button>
        </div>

        {/* Global Search across all bills and products */}
        {bills.length > 0 && (
          <div className="search-wrapper mb-3" style={{ position: 'relative' }}>
            <input
              id="home-global-search-input"
              className="search-input"
              style={{ height: 40, fontSize: '0.84rem', paddingLeft: 14 }}
              placeholder="Rechercher un article, réf, code-barres ou N° BL..."
              value={homeSearch}
              onChange={(e) => setHomeSearch(e.target.value)}
            />
            {homeSearch ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setHomeSearch('')}
                aria-label="Effacer"
              >
                <IconX size={15} />
              </button>
            ) : (
              <span style={{ position: 'absolute', right: 12, top: 12, color: 'var(--text-muted)', pointerEvents: 'none' }}>
                <IconSearch size={16} />
              </span>
            )}
          </div>
        )}

        {homeSearch.trim() ? (
          <div className="flex flex-col gap-2 mb-4">
            <div className="text-xs text-muted flex justify-between items-center px-1">
              <span>{matchedGlobalLines.length} article(s) trouvé(s) dans la session</span>
              <button className="text-accent text-xs font-bold" onClick={() => setHomeSearch('')}>Voir tous les bons</button>
            </div>
            {matchedGlobalLines.length === 0 ? (
              <div className="card text-center text-xs text-muted py-4">
                Aucun article correspondant à « {homeSearch} »
              </div>
            ) : (
              matchedGlobalLines.slice(0, 30).map((line) => {
                const parentBill = bills.find((b) => b.id === line.billId);
                const targetStage = sessionStorage.getItem(`pointage_stage_${line.billId}`) || 'preparation';
                return (
                  <div
                    key={line.id}
                    className="product-card cursor-pointer"
                    style={{ borderLeft: '4px solid var(--accent)' }}
                    onClick={() => nav(`/bill/${line.billId}/line/${line.id}?stage=${targetStage}&from=home`)}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="badge"
                          style={{ background: 'var(--accent-glow)', color: 'var(--accent)', fontWeight: 800, cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            nav(`/bill/${line.billId}`);
                          }}
                          title="Ouvrir l'ensemble de ce bon"
                        >
                          {parentBill?.billNumber || `BL #${line.billId}`} ›
                        </span>
                        <span className="text-xs text-muted font-bold truncate" style={{ maxWidth: 140 }}>
                          {parentBill?.client || ''}
                        </span>
                      </div>
                      <span className="line-no">N°{line.no}</span>
                    </div>
                    <div className="line-designation font-bold text-sm">{line.designation}</div>
                    <div className="flex justify-between items-center text-xs text-muted mt-1">
                      <span>RÉF: {line.reference || 'Sans réf'}</span>
                      <span className="font-bold text-primary">Attendu: {line.orderedQty}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : displayBills.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              {billFilter === 'active' ? <IconBox size={46} /> : <IconClipboard size={46} />}
            </div>
            <p>
              {billFilter === 'active'
                ? 'Aucun bon de livraison actif'
                : 'Aucun bon archivé dans l’historique'}
            </p>
            {billFilter === 'active' && (
              <div className="flex gap-2 justify-center mt-4">
                <button className="btn btn-primary" onClick={() => nav('/import')}>
                  <IconImport size={18} /> IMPORTER DES BL
                </button>
                <button className="btn btn-secondary" onClick={() => setShowManualBillModal(true)}>
                  <IconPlus size={16} /> NOUVEAU BL
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {billFilter === 'active' && (
              <div className="flex justify-end mb-2">
                <button
                  className="btn btn-xs btn-secondary flex items-center gap-1"
                  onClick={() => setShowManualBillModal(true)}
                  title="Créer un nouveau bon"
                >
                  <IconPlus size={14} /> NOUVEAU BL
                </button>
              </div>
            )}

            {clientGroups.map(group => {
              if (group.bills.length === 1) {
                return (
                  <BillCard
                    key={group.bills[0].id}
                    bill={group.bills[0]}
                    onClick={() => nav(`/bill/${group.bills[0].id}`)}
                    onArchive={() => handleArchiveBill(group.bills[0].id!)}
                    onRestore={() => handleRestoreBill(group.bills[0].id!)}
                  />
                );
              }
              return (
                <ClientGroupCard
                  key={group.client}
                  client={group.client}
                  bills={group.bills}
                  onSelectBill={(id) => nav(`/bill/${id}`)}
                  onArchiveBill={handleArchiveBill}
                  onRestoreBill={handleRestoreBill}
                />
              );
            })}
          </>
        )}



      </div>

      <div className="bottom-bar">
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => nav('/scan')}>
          <IconScan size={18} /> SCANNER
        </button>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => nav('/import')}>
          <IconImport size={18} /> IMPORT
        </button>
        <button className="btn btn-secondary btn-icon" onClick={() => nav('/backup')} title="Export & Secours (Fichier)">
          <IconShare size={18} />
        </button>
        <button className="btn btn-secondary btn-icon" onClick={() => nav('/history')} title="Historique">
          <IconClipboard size={18} />
        </button>
      </div>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenKeyModal={() => setShowKeyModal(true)}
        onOpenWalkthrough={onOpenWalkthrough}
      />

      <ApiKeyModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        setToast={setToast}
      />

      <ManualBillModal
        isOpen={showManualBillModal}
        onClose={() => setShowManualBillModal(false)}
        sessionId={session?.id}
        setToast={setToast}
      />
    </>
  );
}

// ---- Modal: Création Manuelle de Bon en Urgence ----
function ManualBillModal({
  isOpen,
  onClose,
  sessionId,
  setToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: number;
  setToast: (m: string) => void;
}) {
  const nav = useNavigate();
  const [client, setClient] = useState('');
  const [billNumber, setBillNumber] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      showToast('Session non prête', setToast);
      return;
    }
    const finalClient = client.trim().toUpperCase() || 'CLIENT COMPTOIR';
    const finalBillNumber = billNumber.trim().toUpperCase() || `BL-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const id = await db.bills.add({
      sessionId,
      billNumber: finalBillNumber,
      client: finalClient,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    showToast(`Bon ${finalBillNumber} créé avec succès`, setToast);
    onClose();
    nav(`/bill/${id}`);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="flex justify-between items-center mb-3">
          <div className="modal-title" style={{ margin: 0 }}>NOUVEAU BON</div>
          <button className="btn btn-ghost btn-xs btn-icon" onClick={onClose}><IconX size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-muted font-bold block mb-1">CLIENT</label>
            <input
              className="input"
              type="text"
              placeholder="Ex: AISSAOUI HICHAM"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="text-xs text-muted font-bold block mb-1">N° DE BON (OPTIONNEL)</label>
            <input
              className="input"
              type="text"
              placeholder="Ex: BC/OU126/03835"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end mt-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>ANNULER</button>
            <button type="submit" className="btn btn-primary flex items-center gap-1">
              <IconCheck size={16} /> CRÉER
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Client Group Accordion Card (With Cross-Bill Search) ----
function ClientGroupCard({
  client,
  bills,
  onSelectBill,
  onArchiveBill,
  onRestoreBill,
}: {
  client: string;
  bills: Bill[];
  onSelectBill: (id: number) => void;
  onArchiveBill?: (id: number) => void;
  onRestoreBill?: (id: number) => void;
}) {
  const nav = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [groupSearch, setGroupSearch] = useState('');
  const entityLines = useEntityLines(client);

  const matchedLines = React.useMemo(() => {
    if (!groupSearch.trim() || !entityLines) return [];
    return searchLines(entityLines, groupSearch, 'smart');
  }, [groupSearch, entityLines]);

  return (
    <div className="client-group-block mb-3">
      <div
        className="flex justify-between items-center cursor-pointer py-1 px-1 mb-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <IconBuilding size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <div className="font-bold text-sm" style={{ letterSpacing: '0.3px' }}>{client}</div>
            <div className="text-xs text-muted">{bills.length} bon{bills.length > 1 ? 's' : ''}</div>
          </div>
        </div>
        <span
          className="badge"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: '0.72rem',
            cursor: 'pointer',
          }}
        >
          {expanded ? '▲ Replier' : `▼ ${bills.length} BLs`}
        </span>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2">
          {bills.length > 1 && (
            <div className="search-wrapper mb-1" onClick={(e) => e.stopPropagation()}>
              <input
                className="search-input"
                style={{ height: 38, fontSize: '0.82rem', paddingLeft: 12 }}
                placeholder={`Rechercher un article dans les ${bills.length} bons de ${client}...`}
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
              {groupSearch && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setGroupSearch('')}
                  aria-label="Effacer"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          )}

          {/* If searching within this client's bills, display matching lines across bills */}
          {groupSearch.trim() ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-muted flex justify-between">
                <span>{matchedLines.length} article(s) trouvé(s) chez {client}</span>
                <button className="text-accent text-xs font-bold" onClick={() => setGroupSearch('')}>Voir les bons</button>
              </div>
              {matchedLines.length === 0 ? (
                <div className="card text-center text-xs text-muted py-3">
                  Aucun article correspondant dans les {bills.length} bons de {client}
                </div>
              ) : (
                matchedLines.map((line) => {
                  const parentBill = bills.find((b) => b.id === line.billId);
                  const targetStage = sessionStorage.getItem(`pointage_stage_${line.billId}`) || 'preparation';
                  return (
                    <div
                      key={line.id}
                      className="product-card cursor-pointer"
                      style={{ borderLeft: '4px solid var(--accent)' }}
                      onClick={() => nav(`/bill/${line.billId}/line/${line.id}?stage=${targetStage}&from=home`)}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span
                          className="badge"
                          style={{ background: 'var(--accent-glow)', color: 'var(--accent)', fontWeight: 800, cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectBill(line.billId);
                          }}
                          title="Ouvrir ce bon de livraison"
                        >
                          {parentBill?.billNumber || `BL #${line.billId}`} ›
                        </span>
                        <span className="line-no">N°{line.no}</span>
                      </div>
                      <div className="line-designation font-bold text-sm">{line.designation}</div>
                      <div className="flex justify-between items-center text-xs text-muted mt-1">
                        <span>RÉF: {line.reference || 'Sans réf'}</span>
                        <span className="font-bold text-primary">Attendu: {line.orderedQty}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            bills.map((b) => (
              <BillCard
                key={b.id}
                bill={b}
                onClick={() => onSelectBill(b.id!)}
                onArchive={onArchiveBill ? () => onArchiveBill(b.id!) : undefined}
                onRestore={onRestoreBill ? () => onRestoreBill(b.id!) : undefined}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---- Bill Card ----
function BillCard({
  bill,
  onClick,
  onArchive,
  onRestore,
}: {
  bill: Bill;
  onClick: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  const lines = useBillLines(bill.id);
  const events = useBillEvents(bill.id);

  const eventsByLine = new Map<number, CountEvent[]>();
  for (const e of events) {
    const arr = eventsByLine.get(e.orderLineId) || [];
    arr.push(e);
    eventsByLine.set(e.orderLineId, arr);
  }

  const prep = calcBillProgress(lines, eventsByLine, 'preparation');
  const load = calcBillProgress(lines, eventsByLine, 'chargement');
  const point = calcBillProgress(lines, eventsByLine, 'pointage');

  return (
    <div className="card" onClick={onClick}>
      <div className="card-header">
        <div>
          <div className="card-client">{bill.client}</div>
          <div className="card-bill-number flex items-center gap-1.5 flex-wrap">
            <span>{bill.billNumber}</span>
            {bill.documentType && (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                }}
              >
                {bill.documentType === 'invoice'
                  ? 'Facture'
                  : bill.documentType === 'bl_official'
                  ? 'BL Officiel'
                  : bill.documentType === 'bl_workshop'
                  ? 'Atelier'
                  : 'BC'}
              </span>
            )}
            {bill.bcNumber && (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#3b82f6',
                }}
                title="Numéro Bon de Commande"
              >
                BC:{bill.bcNumber}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bill.status === 'completed' ? (
            <span className="badge" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
              ARCHIVÉ
            </span>
          ) : (
            <span className="badge badge-active">{lines.length} lignes</span>
          )}
          {onArchive && bill.status === 'active' && (
            <button
              className="btn btn-xs btn-ghost btn-icon"
              title="Clôturer et archiver ce bon"
              style={{ padding: 4 }}
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
            >
              <IconCheck size={16} style={{ color: 'var(--accent)' }} />
            </button>
          )}
          {onRestore && bill.status === 'completed' && (
            <button
              className="btn btn-xs btn-ghost btn-icon"
              title="Restaurer dans les bons actifs"
              style={{ padding: 4 }}
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
            >
              <IconUndo size={16} />
            </button>
          )}
        </div>
      </div>
      <ProgressRow label="Préparation" progress={prep} />
      <ProgressRow label="Chargement" progress={load} />
      <ProgressRow label="Pointage" progress={point} />
    </div>
  );
}


function ProgressRow({ label, progress }: { label: string; progress: { done: number; total: number; percent: number } }) {
  return (
    <div className="progress-row">
      <span className="progress-label">{label}</span>
      <div className="progress-bar">
        <div
          className={`progress-fill ${progress.percent === 100 ? 'complete' : ''}`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <span className="progress-pct">
        {progress.done}/{progress.total}
      </span>
    </div>
  );
}

// ============================================================
// IMPORT SCREEN
// ============================================================
function ImportScreen({ setToast }: { setToast: (m: string) => void }) {
  const nav = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modular AI state
  const activeProvider = providerRegistry.getActiveProvider();
  const [apiKey, setApiKey] = useState(() => providerRegistry.getApiKey(activeProvider.id));
  const [selectedModel, setSelectedModel] = useState(() => providerRegistry.getSelectedModel(activeProvider.id));
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState('');

  // Multi-Page Photo Staging State (3 pages per bill, multi-bills)
  interface StagedPhoto {
    id: string;
    file: File;
    previewUrl: string;
    pageLabel: string;
  }
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);

  // Import payload & preview state
  const [raw, setRaw] = useState('');
  const [showManualJSON, setShowManualJSON] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof parseImportJSON> | null>(null);
  const [issues, setIssues] = useState<ReturnType<typeof validateImport>>([]);
  const [importing, setImporting] = useState(false);

  const handleSaveKey = () => {
    providerRegistry.setApiKey(activeProvider.id, tempApiKey);
    providerRegistry.setSelectedModel(activeProvider.id, selectedModel);
    setApiKey(tempApiKey);
    setShowKeyModal(false);
    showToast('Clé Gemini enregistrée sur votre appareil', setToast);
  };

  const handleTriggerPhoto = () => {
    if (!apiKey.trim()) {
      setTempApiKey(apiKey);
      setShowKeyModal(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos: StagedPhoto[] = files.map((file, idx) => ({
      id: `${Date.now()}-${Math.random()}-${idx}`,
      file,
      previewUrl: URL.createObjectURL(file),
      pageLabel: `Page ${stagedPhotos.length + idx + 1}`,
    }));

    setStagedPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = (id: string) => {
    setStagedPhotos((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      const remaining = prev.filter((p) => p.id !== id);
      return remaining.map((p, idx) => ({
        ...p,
        pageLabel: `Page ${idx + 1}`,
      }));
    });
  };

  const handleExtractAll = async () => {
    if (stagedPhotos.length === 0) return;
    setIsExtracting(true);
    setExtractProgress("1/3 Optimisation des images...");

    const t1 = setTimeout(() => {
      setExtractProgress("2/3 Analyse IA : Détection et lecture des articles...");
    }, 1800);

    const t2 = setTimeout(() => {
      setExtractProgress("3/3 Préparation des lignes du bon...");
    }, 4500);

    try {
      const files = stagedPhotos.map((p) => p.file);
      const result = await activeProvider.extractFromImage(files, apiKey, selectedModel);
      setPreview({ payload: result.payload, parseError: null });
      setIssues(validateImport(result.payload));
      playSuccessChime();
      showToast(
        `${result.payload.bills?.length || 1} BL extrait(s) (${stagedPhotos.length} pages) avec succès`,
        setToast
      );
    } catch (err) {
      playErrorBeep();
      showToast(`Erreur IA: ${(err as Error).message}`, setToast);
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setIsExtracting(false);
      setExtractProgress('');
    }
  };

  const handleParseManual = () => {
    const result = parseImportJSON(raw);
    setPreview(result);
    if (result.payload) {
      setIssues(validateImport(result.payload));
    }
  };

  const handleImport = async () => {
    if (!preview?.payload) return;
    setImporting(true);
    try {
      const sessionId = await getOrCreateSession();
      const result = await importBills(preview.payload, sessionId);
      if (result.mergedBills && result.mergedBills.some((m) => m.addedLinesCount > 0)) {
        const merged = result.mergedBills.find((m) => m.addedLinesCount > 0);
        showToast(
          `${merged?.addedLinesCount || result.lineCount} ligne(s) ajoutée(s) au bon existant (${merged?.bill.billNumber || ''})`,
          setToast
        );
      } else {
        showToast(
          `${result.bills.length} BL, ${result.lineCount} lignes importées`,
          setToast
        );
      }
      nav('/');
    } catch (e) {
      showToast(`Erreur: ${(e as Error).message}`, setToast);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <header className="app-header">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Retour"><IconArrowLeft size={18} /></button>
        <h1>NUMÉRISATION</h1>
      </header>

      <div className="app-content">
        {/* Hidden file inputs for camera and gallery */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <input
          id="gallery-file-input"
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* If no API key is entered yet, show prominent direct setup card */}
        {!apiKey ? (
          <div className="card" style={{ borderColor: 'var(--accent)', background: 'rgba(59, 130, 246, 0.05)' }}>
            <div className="card-client flex items-center gap-2 mb-1">
              <IconKey size={20} style={{ color: 'var(--accent)' }} /> Clé API Google Gemini Requise
            </div>
            <p className="text-xs text-muted mb-3" style={{ lineHeight: 1.4 }}>
              Collez votre clé Google Gemini pour activer la numérisation :
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (tempApiKey.trim()) {
                  providerRegistry.setApiKey('gemini', tempApiKey);
                  setApiKey(tempApiKey);
                  showToast('Clé Gemini configurée', setToast);
                }
              }}
            >
              <input
                id="inline-gemini-key-input"
                name="inlineGeminiKey"
                aria-label="Clé API Gemini"
                type="password"
                autoComplete="new-password"
                className="input"
                placeholder="AIzaSy..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!tempApiKey.trim()}
              >
                VALIDER
              </button>
            </form>
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Stockée localement • <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-light)', textDecoration: 'underline' }}>Obtenir une clé gratuite</a>
            </div>
          </div>
        ) : (
          /* Gemini Vision Instant Photo Scanner */
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <div className="card-client flex items-center gap-2">
                <IconCamera size={20} style={{ color: 'var(--accent)' }} /> Numérisation Photo
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  setTempApiKey(apiKey);
                  setShowKeyModal(true);
                }}
                title="Modifier la clé"
                style={{ flexShrink: 0, padding: '4px 10px', fontSize: '0.72rem' }}
              >
                <IconKey size={12} /> Clé configurée
              </button>
            </div>

            {/* Quick Model Selector */}
            <div className="mb-3">
              <div className="seg-control">
                <button
                  className={`seg-btn ${selectedModel === 'gemini-3.5-flash-lite' ? 'active' : ''} flex items-center justify-center gap-1`}
                  onClick={() => {
                    setSelectedModel('gemini-3.5-flash-lite');
                    providerRegistry.setSelectedModel('gemini', 'gemini-3.5-flash-lite');
                  }}
                  style={{ fontSize: '0.74rem' }}
                >
                  <IconBolt size={13} /> Flash Lite (Rapide)
                </button>
                <button
                  className={`seg-btn ${selectedModel === 'gemini-3.8-flash' ? 'active' : ''} flex items-center justify-center gap-1`}
                  onClick={() => {
                    setSelectedModel('gemini-3.8-flash');
                    providerRegistry.setSelectedModel('gemini', 'gemini-3.8-flash');
                  }}
                  style={{ fontSize: '0.74rem' }}
                >
                  <IconLayers size={13} /> Flash (Avancé)
                </button>
              </div>
            </div>

            {/* Staged photos strip if any pages were captured */}
            {stagedPhotos.length > 0 ? (
              <div className="mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-secondary">
                    Pages ({stagedPhotos.length}) :
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost text-danger flex items-center gap-1"
                    onClick={() => setStagedPhotos([])}
                    style={{ fontSize: '0.72rem' }}
                  >
                    <IconX size={12} /> Effacer
                  </button>
                </div>

                <div className="staged-photo-strip">
                  {stagedPhotos.map((p) => (
                    <div key={p.id} className="staged-photo-item">
                      <img src={p.previewUrl} alt={p.pageLabel} className="staged-photo-img" />
                      <span className="staged-photo-badge">{p.pageLabel}</span>
                      <button
                        type="button"
                        className="staged-photo-remove"
                        onClick={() => handleRemovePhoto(p.id)}
                        title="Supprimer cette page"
                      >
                        <IconX size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    className="btn btn-secondary flex-1 flex items-center justify-center gap-1"
                    onClick={handleTriggerPhoto}
                    disabled={isExtracting}
                    style={{ minHeight: 44, fontSize: '0.82rem' }}
                  >
                    <IconPlus size={15} /> Ajouter page
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary flex items-center justify-center gap-1"
                    onClick={() => document.getElementById('gallery-file-input')?.click()}
                    disabled={isExtracting}
                    title="Choisir depuis la galerie"
                    style={{ minHeight: 44, fontSize: '0.82rem' }}
                  >
                    <IconFolder size={15} /> Galerie
                  </button>
                </div>

                <button
                  className="btn btn-primary btn-full mt-2"
                  style={{ minHeight: 54, fontSize: '0.94rem', fontWeight: 800, letterSpacing: 0.3 }}
                  onClick={handleExtractAll}
                  disabled={isExtracting}
                >
                  {isExtracting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> {extractProgress}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      NUMÉRISER ({stagedPhotos.length})
                    </span>
                  )}
                </button>
              </div>
            ) : (
              /* No photos staged yet: Initial triggers */
              <div>
                <button
                  className="btn btn-primary btn-full mt-2"
                  style={{ minHeight: 54, fontSize: '0.94rem', fontWeight: 800, letterSpacing: 0.3 }}
                  onClick={handleTriggerPhoto}
                  disabled={isExtracting}
                >
                  {isExtracting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> {extractProgress}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <IconCamera size={20} /> PRENDRE UNE PHOTO
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-full mt-2 text-xs flex items-center justify-center gap-2"
                  onClick={() => {
                    if (!apiKey.trim()) {
                      setShowKeyModal(true);
                      return;
                    }
                    document.getElementById('gallery-file-input')?.click();
                  }}
                  style={{ color: 'var(--text-muted)' }}
                >
                  <IconFolder size={15} /> Choisir depuis la galerie
                </button>
              </div>
            )}
          </div>
        )}

        {/* Secondary Accordion: Manual JSON */}
        <div className="card">
          <div
            className="flex justify-between items-center"
            style={{ cursor: 'pointer' }}
            onClick={() => setShowManualJSON(!showManualJSON)}
          >
            <span className="font-semibold text-sm text-secondary flex items-center gap-2">
              <IconPencil size={15} /> {showManualJSON ? 'Masquer JSON' : 'Importer JSON'}
            </span>
          </div>

          {showManualJSON && (
            <div className="mt-3">
              <textarea
                className="input textarea"
                placeholder="Collez le JSON ici..."
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={6}
              />
              <button
                className="btn btn-secondary btn-full mt-3"
                onClick={handleParseManual}
                disabled={!raw.trim()}
              >
                ANALYSER
              </button>
            </div>
          )}
        </div>

        {/* Parse Error */}
        {preview?.parseError && (
          <div className="card" style={{ borderColor: 'var(--danger)' }}>
            <p style={{ color: 'var(--danger)' }} className="flex items-center gap-1">
              <IconX size={16} /> {preview.parseError}
            </p>
          </div>
        )}

        {/* Extraction Preview & Validation */}
        {preview?.payload && (
          <div className="mt-2">
            <div className="card">
              <div className="section-title" style={{ marginTop: 0 }}>RÉSULTAT</div>
              <p className="font-bold text-lg mb-2">
                {preview.payload.bills?.length || 0} bon(s) •{' '}
                {preview.payload.bills?.reduce((s, b) => s + (b.lines?.length || 0), 0)} articles
              </p>
              {(preview.payload.bills || []).map((b, i) => (
                <div key={i} className="mt-2 text-sm p-3" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                  <div className="font-bold" style={{ color: 'var(--accent)' }}>{b.billNumber || `Facture ${i + 1}`}</div>
                  <div className="text-secondary">{b.client || 'Client divers'}</div>
                  <div className="text-xs text-muted mt-1">{b.lines?.length || 0} lignes extraites</div>
                </div>
              ))}

              {issues.length > 0 && (
                <div className="mt-3 p-3" style={{ background: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--warning-border)' }}>
                  <p className="font-bold text-xs flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                    <IconWarning size={14} /> {issues.length} observation(s)
                  </p>
                  <div style={{ maxHeight: '140px', overflow: 'auto' }} className="mt-1">
                    {issues.map((issue, i) => (
                      <div key={i} className="text-xs mt-1" style={{ color: issue.severity === 'error' ? 'var(--danger)' : 'var(--warning)' }}>
                        • {issue.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="btn btn-success btn-lg btn-full mt-4"
                onClick={handleImport}
                disabled={importing || issues.some((i) => i.severity === 'error')}
              >
                {importing ? 'Enregistrement...' : 'IMPORTER'}
              </button>
            </div>
          </div>
        )}

        {/* API Key Modal */}
        {showKeyModal && (
          <div className="modal-backdrop" onClick={() => setShowKeyModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title flex items-center gap-2">
                <IconKey size={18} style={{ color: 'var(--accent)' }} /> Clé API Google Gemini
              </div>
              <div className="text-xs text-muted mb-3">
                Stockée localement sur cet appareil.
              </div>

              <div className="mb-3">
                <span className="text-xs text-muted font-bold block mb-1">CLÉ D’API</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="AIzaSy..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="mb-4">
                <span className="text-xs text-muted font-bold block mb-1">MODÈLE IA</span>
                <div className="seg-control">
                  {activeProvider.models.map((m) => (
                    <button
                      key={m.id}
                      className={`seg-btn ${selectedModel === m.id ? 'active' : ''}`}
                      onClick={() => setSelectedModel(m.id)}
                      style={{ fontSize: '0.74rem' }}
                    >
                      {m.id.replace('gemini-', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="confirm-actions">
                <button className="btn btn-secondary" onClick={() => setShowKeyModal(false)}>
                  ANNULER
                </button>
                <button className="btn btn-success" onClick={handleSaveKey}>
                  ENREGISTRER
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// BATCH CONTAINER MODAL (Mise en Colis / Chouala groupée)
// ============================================================
function BatchContainerModal({
  isOpen,
  onClose,
  billId,
  client,
  stage,
  selectedLines,
  containers,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  billId: number;
  client?: string;
  stage: Stage;
  selectedLines: OrderLine[];
  containers: TransportContainer[];
  onSuccess: (processedCount: number, unitsAdded: number, label: string) => void;
}) {
  const [targetContainerId, setTargetContainerId] = useState<number | null | 'unselected'>('unselected');
  const [qtyMode, setQtyMode] = useState<'remaining' | 'full'>('remaining');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreateContainer = async (type: 'chouala' | 'carton') => {
    const newC = await createTransportContainer(billId, client, undefined, type);
    setTargetContainerId(newC.id!);
  };

  const handleConfirm = async () => {
    if (targetContainerId === 'unselected' || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const containerId = targetContainerId;
      const res = await batchAssignContainerAndCount(selectedLines, stage, containerId, {
        mode: qtyMode,
      });

      let label = 'Hors Colis (Vrac)';
      if (containerId !== null) {
        const found = containers.find((c) => c.id === containerId);
        label = found ? found.label : `Colis #${containerId}`;
      }

      onSuccess(res.processedCount, res.unitsAdded, label);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedContainerObj =
    targetContainerId !== 'unselected' && targetContainerId !== null
      ? containers.find((c) => c.id === targetContainerId)
      : null;
  const targetLabel =
    targetContainerId === null
      ? 'Hors Colis (Vrac)'
      : selectedContainerObj
      ? selectedContainerObj.label
      : '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="flex justify-between items-center mb-2">
          <div className="font-bold text-base flex items-center gap-2">
            <IconBag size={18} style={{ color: 'var(--accent)' }} />
            <span>Rangement groupé ({selectedLines.length} articles)</span>
          </div>
          <button className="btn btn-xs btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            <IconX size={16} />
          </button>
        </div>

        <p className="text-xs text-muted mb-3">
          Affecter ces {selectedLines.length} article{selectedLines.length > 1 ? 's' : ''} à un sac (Chouala), un carton ou en vrac.
        </p>

        {/* Section 1: Destination Colis */}
        <div className="mb-3">
          <div className="text-xs font-bold text-muted mb-2">1. CHOISIR LE COLIS DE DESTINATION :</div>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              type="button"
              className={`container-tag ${targetContainerId === null ? 'selected' : ''}`}
              style={{ padding: '6px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}
              onClick={() => setTargetContainerId(null)}
            >
              <span className="flex items-center gap-1">
                {targetContainerId === null && <IconCheck size={12} />}
                <IconTag size={12} />
                <span>Hors Colis (Vrac)</span>
              </span>
            </button>

            {containers.map((c) => {
              const isChouala = c.type === 'chouala';
              const isSelected = targetContainerId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`container-tag ${isChouala ? 'chouala' : ''} ${isSelected ? 'selected' : ''}`}
                  style={{ padding: '6px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}
                  onClick={() => setTargetContainerId(c.id!)}
                >
                  <span className="flex items-center gap-1">
                    {isSelected && <IconCheck size={12} />}
                    {isChouala ? <IconBag size={13} /> : <IconBox size={13} />}
                    <span>{c.label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="btn btn-xs btn-secondary flex items-center gap-1"
              style={{ borderStyle: 'dashed' }}
              onClick={() => handleCreateContainer('chouala')}
            >
              <IconPlus size={12} /> Nouveau Sac (Chouala)
            </button>
            <button
              type="button"
              className="btn btn-xs btn-secondary flex items-center gap-1"
              style={{ borderStyle: 'dashed' }}
              onClick={() => handleCreateContainer('carton')}
            >
              <IconPlus size={12} /> Nouveau Carton
            </button>
          </div>
        </div>

        {/* Section 2: Mode de Quantité */}
        <div className="mb-3 pt-2" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div className="text-xs font-bold text-muted mb-2">2. QUANTITÉ À VALIDER :</div>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="qtyMode"
                checked={qtyMode === 'remaining'}
                onChange={() => setQtyMode('remaining')}
                style={{ marginTop: 2 }}
              />
              <div>
                <div className="font-semibold">Compléter la quantité commandée (Reliquat restant)</div>
                <div className="text-xs text-muted">Valide les unités manquantes pour chaque article sélectionné</div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="qtyMode"
                checked={qtyMode === 'full'}
                onChange={() => setQtyMode('full')}
                style={{ marginTop: 2 }}
              />
              <div>
                <div className="font-semibold">Quantité totale commandée (Forcer 100%)</div>
                <div className="text-xs text-muted">Ajoute directement la totalité de la commande pour chacun</div>
              </div>
            </label>
          </div>
        </div>

        {/* Section 3: Action Confirmation */}
        <button
          type="button"
          className="btn btn-primary btn-full btn-lg mt-2 flex items-center justify-center gap-2"
          disabled={targetContainerId === 'unselected' || isSubmitting}
          onClick={handleConfirm}
        >
          <IconCheck size={18} />
          <span>
            {isSubmitting
              ? 'Enregistrement...'
              : targetContainerId === 'unselected'
              ? 'Choisissez un colis ci-dessus'
              : `VALIDER DANS ${targetLabel.toUpperCase()}`}
          </span>
        </button>
      </div>
    </div>
  );
}

function TransferStageModal({
  isOpen,
  onClose,
  billId,
  lineId,
  lineIds,
  currentLineTitle,
  initialFromStage = 'chargement',
  initialToStage = 'preparation',
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  billId: number;
  lineId?: number;
  lineIds?: number[];
  currentLineTitle?: string;
  initialFromStage?: Stage;
  initialToStage?: Stage;
  onSuccess: (unitsTransferred: number, linesCount: number, from: Stage, to: Stage) => void;
}) {
  const [fromStage, setFromStage] = useState<Stage>(initialFromStage);
  const [toStage, setToStage] = useState<Stage>(initialToStage);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFromStage(initialFromStage);
      setToStage(initialToStage);
    }
  }, [isOpen, initialFromStage, initialToStage]);

  if (!isOpen) return null;

  const STAGE_LABELS: Record<Stage, string> = {
    preparation: 'Préparation',
    chargement: 'Chargement',
    pointage: 'Pointage',
  };

  const handleConfirm = async () => {
    if (fromStage === toStage || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (lineId) {
        const units = await transferLineStageCounts(billId, lineId, fromStage, toStage);
        onSuccess(units, 1, fromStage, toStage);
      } else {
        const res = await transferBatchStageCounts(billId, lineIds || null, fromStage, toStage);
        onSuccess(res.unitsCount, res.linesCount, fromStage, toStage);
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBatch = !lineId && Boolean(lineIds && lineIds.length > 0);
  const isWholeBill = !lineId && !lineIds;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="flex justify-between items-center mb-3">
          <div className="modal-title flex items-center gap-2" style={{ margin: 0 }}>
            <IconTransfer size={18} style={{ color: 'var(--accent)' }} />
            <span>TRANSFÉRER L'ÉTAPE</span>
          </div>
          <button className="btn btn-ghost btn-xs btn-icon" onClick={onClose} aria-label="Fermer">
            <IconX size={18} />
          </button>
        </div>

        <div className="text-xs text-secondary mb-3 p-2.5" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          {lineId && (
            <div>
              Article concerné : <strong>{currentLineTitle || `#${lineId}`}</strong>
            </div>
          )}
          {isBatch && (
            <div>
              Articles sélectionnés : <strong>{lineIds!.length} articles</strong>
            </div>
          )}
          {isWholeBill && (
            <div>
              Portée : <strong>Tous les articles du bon</strong>
            </div>
          )}
          <div className="text-muted mt-1">
            Bascule les comptages enregistrés d'une étape vers une autre sans perte d'historique ni de colisage.
          </div>
        </div>

        {/* Source Stage */}
        <div className="mb-3">
          <label className="text-xs font-bold text-muted block mb-1">DÉPLACER DEPUIS (SOURCE) :</label>
          <div className="flex gap-2">
            {(['chargement', 'preparation', 'pointage'] as Stage[]).map((s) => (
              <button
                key={`from-${s}`}
                type="button"
                className={`btn btn-sm flex-1 ${fromStage === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setFromStage(s);
                  if (toStage === s) {
                    setToStage(s === 'chargement' ? 'preparation' : s === 'preparation' ? 'chargement' : 'preparation');
                  }
                }}
              >
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Destination Stage */}
        <div className="mb-4">
          <label className="text-xs font-bold text-muted block mb-1">VERS L'ÉTAPE (DESTINATION) :</label>
          <div className="flex gap-2">
            {(['preparation', 'chargement', 'pointage'] as Stage[]).map((s) => (
              <button
                key={`to-${s}`}
                type="button"
                className={`btn btn-sm flex-1 ${toStage === s ? 'btn-primary' : 'btn-secondary'}`}
                disabled={fromStage === s}
                onClick={() => setToStage(s)}
              >
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
            disabled={fromStage === toStage || isSubmitting}
            onClick={handleConfirm}
            style={{ fontWeight: 700 }}
          >
            <IconTransfer size={15} />
            <span>{isSubmitting ? 'Transfert...' : `Bascule vers ${STAGE_LABELS[toStage]}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BILL SCREEN
// ============================================================
function BillScreen({ setToast }: { setToast: (m: string) => void }) {
  const nav = useNavigate();
  const { billId: billIdStr } = useParams();
  const billId = Number(billIdStr);
  const bill = useBill(billId);
  const lines = useBillLines(billId);
  const events = useBillEvents(billId);
  const overrides = useBillOverrides(billId);
  const containers = useBillContainers(billId);
  const entityBills = useEntityBills(bill?.client);
  const entityLines = useEntityLines(bill?.client);
  const entityEvents = useEntityEvents(bill?.client);
  const entityContainers = useEntityContainers(bill?.client);

  const [searchParams, setSearchParams] = useSearchParams();
  const initialStage = (searchParams.get('stage') || sessionStorage.getItem(`pointage_stage_${billId}`) || 'preparation') as Stage;
  const [stage, setStage] = useState<Stage>(initialStage);

  const [selectedContainerFilter, setSelectedContainerFilter] = useState<number | 'all' | 'loose'>('all');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<number>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showBatchTransferModal, setShowBatchTransferModal] = useState(false);
  const [showWholeBillTransferModal, setShowWholeBillTransferModal] = useState(false);

  // Active units per stage across this entire bill
  const billStageUnitTotals = React.useMemo(() => {
    const res: Record<Stage, number> = { preparation: 0, chargement: 0, pointage: 0 };
    for (const e of events || []) {
      if (!e.undone && (e.stage in res)) {
        res[e.stage] += e.quantity;
      }
    }
    return res;
  }, [events]);

  const handleStageChange = (s: Stage) => {
    setStage(s);
    sessionStorage.setItem(`pointage_stage_${billId}`, s);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('stage', s);
      return next;
    }, { replace: true });
  };
  const [searchMode, setSearchMode] = useState<SearchMode>('smart');
  const [searchScope, setSearchScope] = useState<'current' | 'all'>('current');
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem(`pointage_search_${billId}`) || '');
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [showQuantities, setShowQuantities] = useState(() => localStorage.getItem('pointage_show_quantities') === 'true');
  const [showQRSync, setShowQRSync] = useState(false);
  const [unknownBarcodeModal, setUnknownBarcodeModal] = useState<string | null>(null);

  // Focus & visual continuity for recently updated line
  const [lastUpdatedLineId, setLastUpdatedLineId] = useState<number>(() => {
    return Number(sessionStorage.getItem('pointage_last_updated_line_id') || 0);
  });
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    if (lastUpdatedLineId) {
      const timer = setTimeout(() => {
        sessionStorage.removeItem('pointage_last_updated_line_id');
        setLastUpdatedLineId(0);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [lastUpdatedLineId]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 350);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (q) {
      sessionStorage.setItem(`pointage_search_${billId}`, q);
    } else {
      sessionStorage.removeItem(`pointage_search_${billId}`);
    }
  };

  const toggleShowQuantities = () => {
    setShowQuantities(prev => {
      const next = !prev;
      localStorage.setItem('pointage_show_quantities', String(next));
      return next;
    });
  };

  const siblingBills = React.useMemo(
    () => (entityBills || []).filter((b) => b.id !== billId),
    [entityBills, billId]
  );
  const siblingLines = React.useMemo(
    () => (entityLines || []).filter((l) => l.billId !== billId),
    [entityLines, billId]
  );

  // Hardware Bluetooth/Wedge Scanner Listener & Accelerators
  useHardwareScanner({
    onScan: (scannedCode) => {
      const trimmed = scannedCode.trim();
      if (!trimmed) return;

      // 1. Search current bill lines
      const currentMatches = searchLines(lines, trimmed, 'smart', billId, overrides);
      if (currentMatches.length === 1) {
        playSuccessChime();
        nav(`/bill/${billId}/line/${currentMatches[0].id}?stage=${stage}`);
        return;
      }
      if (currentMatches.length > 1) {
        playSuccessChime();
        handleSearchChange(trimmed);
        showToast(`${currentMatches.length} articles trouvés dans ce bon`, setToast);
        return;
      }

      // 2. Cross-bill search across sibling bills for this seller/client
      const siblingMatchesNow = searchLines(siblingLines, trimmed, 'smart');
      if (siblingMatchesNow.length === 1) {
        playSuccessChime();
        const match = siblingMatchesNow[0];
        const pBill = entityBills?.find((b) => b.id === match.billId);
        showToast(`Article trouvé sur ${pBill?.billNumber || 'autre bon'} (${bill?.client})`, setToast);
        nav(`/bill/${match.billId}/line/${match.id}?stage=${stage}`);
        return;
      }
      if (siblingMatchesNow.length > 1) {
        playSuccessChime();
        setSearchScope('all');
        handleSearchChange(trimmed);
        showToast(`${siblingMatchesNow.length} articles trouvés chez ${bill?.client}`, setToast);
        return;
      }

      // 3. Not found anywhere for this entity -> Error tone + ruby red flash + assistive recovery
      playErrorBeep();
      setUnknownBarcodeModal(trimmed);
    },
    onSpace: () => {
      nav(`/scan?billId=${billId}&stage=${stage}`);
    },
    onUndo: async () => {
      const ok = await undoLastBillCount(billId, stage);
      if (ok) {
        playUndoBeep();
        showToast('Dernier comptage annulé', setToast);
      } else {
        showToast('Rien à annuler pour ce bon', setToast);
      }
    },
    onQuickExport: () => {
      nav(`/bill/${billId}/summary?stage=${stage}`);
    },
  });

  const activeContainers = searchScope === 'all' && entityContainers && entityContainers.length > 0 ? entityContainers : containers;
  const activeEvents = searchScope === 'all' && entityEvents && entityEvents.length > 0 ? entityEvents : events;
  const eventsByLine = new Map<number, CountEvent[]>();
  for (const e of activeEvents) {
    const arr = eventsByLine.get(e.orderLineId) || [];
    arr.push(e);
    eventsByLine.set(e.orderLineId, arr);
  }

  // Active lines pool based on scope
  const activeLinesPool = searchScope === 'all' && entityLines && entityLines.length > 0 ? entityLines : lines;

  // Map lineId -> array of container labels or ['VRAC', 'HORS COLIS']
  const lineContainerMap = React.useMemo(() => {
    const map = new Map<number, string[]>();
    const containerMap = new Map<number, TransportContainer>();
    for (const c of activeContainers) {
      if (c.id != null) containerMap.set(c.id, c);
    }

    for (const line of activeLinesPool) {
      if (!line.id) continue;
      const evts = eventsByLine.get(line.id) || [];
      const activeEvts = evts.filter((e) => !e.undone && e.quantity > 0);
      const containerNames = new Set<string>();
      let hasLoose = false;

      for (const e of activeEvts) {
        if (e.containerId) {
          const c = containerMap.get(e.containerId);
          if (c) {
            containerNames.add(c.label);
            if (c.type === 'chouala') {
              containerNames.add('CHOUALA');
              containerNames.add('SAC');
            } else {
              containerNames.add('CARTON');
            }
          }
        } else {
          hasLoose = true;
        }
      }

      if (hasLoose || activeEvts.length === 0) {
        containerNames.add('HORS COLIS');
        containerNames.add('VRAC');
      }

      map.set(line.id, Array.from(containerNames));
    }
    return map;
  }, [activeContainers, activeLinesPool, eventsByLine]);

  // Colis stats for the filter pills
  const containerStats = React.useMemo(() => {
    const stats = new Map<number | 'loose', { linesCount: number; totalUnits: number }>();
    for (const c of activeContainers) {
      if (c.id != null) stats.set(c.id, { linesCount: 0, totalUnits: 0 });
    }
    stats.set('loose', { linesCount: 0, totalUnits: 0 });

    for (const line of activeLinesPool) {
      if (!line.id) continue;
      const evts = eventsByLine.get(line.id) || [];
      const activeEvts = evts.filter((e) => !e.undone && e.quantity > 0);
      const seenContainers = new Set<number | 'loose'>();

      for (const e of activeEvts) {
        if (e.containerId && stats.has(e.containerId)) {
          seenContainers.add(e.containerId);
          stats.get(e.containerId)!.totalUnits += e.quantity;
        } else {
          seenContainers.add('loose');
          stats.get('loose')!.totalUnits += e.quantity;
        }
      }

      if (activeEvts.length === 0) {
        seenContainers.add('loose');
      }

      for (const cId of seenContainers) {
        const s = stats.get(cId);
        if (s) s.linesCount += 1;
      }
    }

    return stats;
  }, [activeContainers, activeLinesPool, eventsByLine]);

  // Filter and sort lines
  let displayLines = [...activeLinesPool];

  // Container pill filter
  if (selectedContainerFilter !== 'all') {
    if (selectedContainerFilter === 'loose') {
      displayLines = displayLines.filter((l) => lineContainerMap.get(l.id!)?.includes('VRAC'));
    } else {
      const targetC = activeContainers.find((c) => c.id === selectedContainerFilter);
      if (targetC) {
        displayLines = displayLines.filter((l) => lineContainerMap.get(l.id!)?.includes(targetC.label));
      }
    }
  }

  // Search
  if (searchQuery.trim()) {
    displayLines = searchLines(
      displayLines,
      searchQuery,
      searchMode,
      searchScope === 'current' ? billId : undefined,
      searchScope === 'current' ? overrides : undefined,
      lineContainerMap
    );
  }

  // Sibling matches across other bills of the same client when in 'current' bill scope
  const siblingMatches = React.useMemo(() => {
    if (!searchQuery.trim() || searchScope === 'all' || siblingLines.length === 0) return [];
    return searchLines(siblingLines, searchQuery, searchMode);
  }, [siblingLines, searchQuery, searchMode, searchScope]);

  // Problems only
  if (showProblemsOnly) {
    displayLines = displayLines.filter((line) => {
      if (line.status !== 'active') return true;
      const evts = eventsByLine.get(line.id!) || [];
      const stageTotal = sumStageEvents(evts, stage);
      const disc = calcDiscrepancy(line, stageTotal);
      return !disc.isExact || disc.isModified;
    });
  }

  // Sort: incomplete/problem first
  displayLines.sort((a, b) => {
    if (a.status !== 'active' && b.status === 'active') return 1;
    if (a.status === 'active' && b.status !== 'active') return -1;

    const evA = eventsByLine.get(a.id!) || [];
    const evB = eventsByLine.get(b.id!) || [];
    const dA = calcDiscrepancy(a, sumStageEvents(evA, stage));
    const dB = calcDiscrepancy(b, sumStageEvents(evB, stage));

    // Not done first
    if (!dA.isExact && dB.isExact) return -1;
    if (dA.isExact && !dB.isExact) return 1;

    return 0;
  });

  if (!bill) return <div className="app-content"><div className="spinner" /></div>;

  return (
    <>
      <header className="app-header">
        <button className="back-btn" onClick={() => nav('/')} aria-label="Retour"><IconArrowLeft size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-semibold truncate">{bill.client}</div>
          <div className="text-xs text-muted truncate flex items-center gap-1.5 flex-wrap">
            <span>{bill.billNumber}</span>
            {bill.documentType && (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                }}
              >
                {bill.documentType === 'invoice'
                  ? 'Facture'
                  : bill.documentType === 'bl_official'
                  ? 'BL Officiel'
                  : bill.documentType === 'bl_workshop'
                  ? 'Atelier'
                  : 'BC'}
              </span>
            )}
            {bill.bcNumber && (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#3b82f6',
                }}
                title="Numéro Bon de Commande"
              >
                BC:{bill.bcNumber}
              </span>
            )}
          </div>
        </div>
        <AudioMuteButton />
        <button
          type="button"
          className="btn btn-sm btn-secondary flex items-center gap-1"
          style={{ padding: '6px 10px', fontSize: '0.78rem', fontWeight: 700 }}
          onClick={() => setShowQRSync(true)}
          title="Fusion multi-téléphones (QR)"
        >
          <IconLayers size={14} /> FUSION QR
        </button>
        <button className="btn btn-sm btn-secondary btn-icon" onClick={() => setShowWholeBillTransferModal(true)} title="Transférer les étapes du bon">
          <IconTransfer size={17} />
        </button>
        <button className="btn btn-sm btn-secondary btn-icon" onClick={() => nav(`/bill/${billId}/summary?stage=${stage}`)} title="Récapitulatif">
          <IconChart size={18} />
        </button>
      </header>

      <div className="app-content">
        {/* Stage tabs */}
        <div className="stage-tabs">
          {(['preparation', 'chargement', 'pointage'] as Stage[]).map((s) => (
            <button
              key={s}
              className={`stage-tab ${stage === s ? 'active' : ''}`}
              onClick={() => handleStageChange(s)}
            >
              {s === 'preparation' ? 'Préparation' : s === 'chargement' ? 'Chargement' : 'Pointage'}
            </button>
          ))}
        </div>

        {/* Smart Bill-Wide Stage Mistake Recovery Banner */}
        {billStageUnitTotals[stage] === 0 && (() => {
          const otherStage: Stage | null =
            stage === 'preparation' && billStageUnitTotals.chargement > 0
              ? 'chargement'
              : stage === 'chargement' && billStageUnitTotals.preparation > 0
              ? 'preparation'
              : null;
          if (!otherStage) return null;
          const otherUnits = billStageUnitTotals[otherStage];
          const otherStageName = otherStage === 'preparation' ? 'Préparation' : 'Chargement';
          const currentStageName = stage === 'preparation' ? 'Préparation' : 'Chargement';
          return (
            <div
              className="card mb-2 flex justify-between items-center"
              style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                padding: '10px 14px',
              }}
            >
              <div className="flex items-center gap-2">
                <IconTransfer size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                <div>
                  <div className="font-bold text-xs" style={{ color: 'var(--warning)' }}>
                    {otherUnits} pièces comptées en {otherStageName}
                  </div>
                  <div className="text-xs text-muted">
                    Vous êtes en {currentStageName}. Vouliez-vous enregistrer ce bon en {currentStageName} ?
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-primary flex items-center gap-1"
                style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                onClick={async () => {
                  if (window.confirm(`Basculer TOUS les comptages de "${otherStageName}" vers "${currentStageName}" pour ce bon (${otherUnits} pièces) ?`)) {
                    const res = await transferBatchStageCounts(billId, null, otherStage, stage);
                    playSuccessChime();
                    hapticTap('medium');
                    showToast(`✓ ${res.unitsCount} pièces transférées vers ${currentStageName} (${res.linesCount} articles)`, setToast);
                  }
                }}
              >
                ⇄ Tout basculer ici
              </button>
            </div>
          );
        })()}

        {/* Search mode */}
        <div className="seg-control mb-2">
          {(['smart', 'no', 'ref', 'ean', 'name'] as SearchMode[]).map((m) => (
            <button
              key={m}
              className={`seg-btn ${searchMode === m ? 'active' : ''}`}
              onClick={() => setSearchMode(m)}
            >
              {m === 'smart' ? 'SMART' : m === 'no' ? 'N°' : m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search input with persistence and clear button */}
        <div className="search-wrapper">
          <input
            id="bill-search-input"
            name="searchQuery"
            aria-label="Rechercher"
            className="search-input"
            placeholder={searchMode === 'no' ? 'Entrer N°...' : 'Rechercher (réf, code-barres partiel)...'}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            type={searchMode === 'no' ? 'number' : 'text'}
            inputMode={searchMode === 'no' ? 'numeric' : 'text'}
          />
          {searchQuery ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => handleSearchChange('')}
              title="Effacer la recherche"
              aria-label="Effacer la recherche"
            >
              <IconX size={16} />
            </button>
          ) : (
            <button
              className="search-scan-btn"
              onClick={() => nav(`/scan?billId=${billId}&stage=${stage}`)}
              title="Scanner"
            >
              <IconScan size={18} />
            </button>
          )}
        </div>

        {/* Scope Toggle when client has multiple bills */}
        {entityBills && entityBills.length > 1 && (
          <div className="scope-segmented-bar">
            <button
              type="button"
              className={`scope-seg-btn ${searchScope === 'current' ? 'active' : ''}`}
              onClick={() => setSearchScope('current')}
            >
              <span>Ce bon</span>
              <span className="scope-count-badge">{lines.length}</span>
            </button>
            <button
              type="button"
              className={`scope-seg-btn ${searchScope === 'all' ? 'active' : ''}`}
              onClick={() => setSearchScope('all')}
            >
              <IconBuilding size={14} />
              <span>Tous les {entityBills.length} bons</span>
              <span className="scope-count-badge">{entityLines?.length || 0}</span>
            </button>
          </div>
        )}

        {/* Transport Containers Filter Pills (Chouala, Carton & Vrac) */}
        {activeContainers.length > 0 && (
          <div className="colis-filter-bar">
            <button
              type="button"
              className={`colis-filter-pill ${selectedContainerFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedContainerFilter('all')}
            >
              <span>Tous</span>
              <span className="colis-pill-badge">{activeLinesPool.length}</span>
            </button>

            {activeContainers.map((c) => {
              const st = containerStats.get(c.id!) || { linesCount: 0, totalUnits: 0 };
              const isChouala = c.type === 'chouala';
              const isSelected = selectedContainerFilter === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`colis-filter-pill ${isChouala ? 'chouala' : ''} ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedContainerFilter(isSelected ? 'all' : c.id!)}
                >
                  <span className="flex items-center gap-1">
                    {isChouala ? <IconBag size={12} /> : <IconBox size={12} />}
                    <span>{c.label}</span>
                  </span>
                  <span className="colis-pill-badge">{st.linesCount}</span>
                </button>
              );
            })}

            <button
              type="button"
              className={`colis-filter-pill loose ${selectedContainerFilter === 'loose' ? 'active' : ''}`}
              onClick={() => setSelectedContainerFilter(selectedContainerFilter === 'loose' ? 'all' : 'loose')}
            >
              <span className="flex items-center gap-1">
                <IconTag size={12} />
                <span>Hors Colis</span>
              </span>
              <span className="colis-pill-badge">{containerStats.get('loose')?.linesCount || 0}</span>
            </button>
          </div>
        )}

        {/* Filters and Visibility Toggle */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-2">
            <button
              className={`btn btn-sm ${showProblemsOnly ? 'btn-warning' : 'btn-secondary'}`}
              onClick={() => setShowProblemsOnly(!showProblemsOnly)}
            >
              <IconWarning size={14} /> {showProblemsOnly ? 'PROBLÈMES' : 'Problèmes'}
            </button>
            <button
              className={`btn btn-sm ${showQuantities ? 'btn-primary' : 'btn-secondary'} flex items-center gap-1`}
              onClick={toggleShowQuantities}
              title={showQuantities ? 'Masquer les quantités' : 'Afficher les quantités'}
            >
              {showQuantities ? <IconEye size={15} /> : <IconEyeOff size={15} />}
              <span>{showQuantities ? 'Visibles' : 'Masquées'}</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${isSelectionMode ? 'btn-primary' : 'btn-secondary'} flex items-center gap-1`}
              onClick={() => {
                if (isSelectionMode) {
                  setIsSelectionMode(false);
                  setSelectedLineIds(new Set());
                } else {
                  setIsSelectionMode(true);
                }
              }}
              title="Sélection multiple d'articles"
            >
              <IconCheck size={14} />
              <span>{isSelectionMode ? 'Terminer' : 'Sélectionner'}</span>
            </button>
          </div>
          <span className="text-xs text-muted font-bold" style={{ alignSelf: 'center' }}>
            {searchScope === 'all'
              ? `${displayLines.length} / ${entityLines?.length || displayLines.length} lignes`
              : `${displayLines.length} / ${lines.length} lignes`}
          </span>
        </div>

        {/* Selection Toolbar when in multi-select mode */}
        {isSelectionMode && (
          <div
            className="selection-toolbar flex items-center justify-between p-2 mb-2"
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              style={{ fontWeight: 700, color: 'var(--accent)' }}
              onClick={() => {
                const allDisplayedIds = displayLines.map((l) => l.id!).filter(Boolean);
                const allSelected =
                  allDisplayedIds.length > 0 && allDisplayedIds.every((id) => selectedLineIds.has(id));
                if (allSelected) {
                  setSelectedLineIds(new Set());
                } else {
                  setSelectedLineIds(new Set(allDisplayedIds));
                }
              }}
            >
              {displayLines.length > 0 && displayLines.every((l) => selectedLineIds.has(l.id!))
                ? 'Tout décocher'
                : `Tout cocher (${displayLines.length})`}
            </button>
            <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
              {selectedLineIds.size} sélectionné{selectedLineIds.size > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className="btn btn-xs btn-ghost text-muted"
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedLineIds(new Set());
              }}
            >
              Annuler
            </button>
          </div>
        )}

        {/* Lines */}
        {displayLines.map((line) => {
          const evts = eventsByLine.get(line.id!) || [];
          const stageTotal = sumStageEvents(evts, stage);
          const disc = calcDiscrepancy(line, stageTotal);
          const isSelected = selectedLineIds.has(line.id!);

          const handleCardClick = () => {
            if (isSelectionMode) {
              hapticTap('light');
              setSelectedLineIds((prev) => {
                const next = new Set(prev);
                if (next.has(line.id!)) {
                  next.delete(line.id!);
                } else {
                  next.add(line.id!);
                }
                return next;
              });
            } else {
              nav(`/bill/${line.billId}/line/${line.id}?stage=${stage}`);
            }
          };

          return (
            <div
              key={line.id}
              id={`line-${line.id}`}
              className={`product-card ${isSelected ? 'selected-line-card' : ''} ${line.id === lastUpdatedLineId ? 'just-updated-card' : ''}`}
              onClick={handleCardClick}
            >
              <div className="flex items-start gap-2">
                {isSelectionMode && (
                  <div
                    className={`selection-checkbox ${isSelected ? 'checked' : ''}`}
                    style={{ marginTop: 2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCardClick();
                    }}
                  >
                    {isSelected && <IconCheck size={13} />}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 flex-wrap">
                      {line.billId !== billId && (
                        <span className="badge" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', fontWeight: 800, fontSize: '0.72rem' }}>
                          {entityBills?.find((b) => b.id === line.billId)?.billNumber || `BL #${line.billId}`}
                        </span>
                      )}
                      <span className="line-no">N°{line.no}</span>
                      {line.page != null && <span className="line-page">PAGE {line.page}</span>}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {line.status !== 'active' && (
                        <span className={`badge badge-${line.status === 'out_of_stock' ? 'out-of-stock' : line.status === 'cancelled' ? 'cancelled' : line.status === 'not_found' ? 'not-found' : 'removed'} flex items-center gap-1`}>
                          {line.status === 'out_of_stock' ? <><IconBan size={11} /> RUPTURE</> :
                           line.status === 'cancelled' ? <><IconBan size={11} /> ANNULÉ</> :
                           line.status === 'not_found' ? <><IconSearch size={11} /> INTROUVABLE</> : <><IconX size={11} /> SUPPRIMÉ</>}
                        </span>
                      )}
                      {disc.isModified && <span className="badge badge-modified flex items-center gap-1"><IconPencil size={11} /> MODIFIÉ</span>}
                      {line.status === 'active' && disc.isExact && stageTotal > 0 && (
                        <span className="badge badge-exact flex items-center gap-1"><IconCheck size={11} /> EXACT</span>
                      )}
                      {line.status === 'active' && disc.isShort && (
                        <span className="badge badge-short flex items-center gap-1"><IconWarning size={11} /> {showQuantities ? `${disc.remaining} MANQ` : 'MANQUANT'}</span>
                      )}
                      {line.status === 'active' && disc.isOver && (
                        <span className="badge badge-over">{showQuantities ? `${disc.over} EXCÉD` : 'EXCÉDENT'}</span>
                      )}
                    </div>
                  </div>

                  {line.reference && <div className="line-ref">REF: {line.reference}</div>}
                  <div className="line-designation">{line.designation}</div>

                  {/* Packaging Container Badges */}
                  {(() => {
                    const lineContainers = lineContainerMap.get(line.id!) || [];
                    const matched = activeContainers.filter((c) => lineContainers.includes(c.label));
                    if (matched.length > 0) {
                      return (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {matched.map((c) => (
                            <span
                              key={c.id}
                              className={`badge ${c.type === 'chouala' ? 'badge-chouala' : 'badge-carton'} flex items-center gap-1`}
                              title={`Emballé dans ${c.label}`}
                            >
                              {c.type === 'chouala' ? <IconBag size={11} /> : <IconBox size={11} />}
                              <span>{c.label}</span>
                            </span>
                          ))}
                        </div>
                      );
                    } else if (stage !== 'preparation' && stageTotal > 0) {
                      return (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="badge badge-loose flex items-center gap-1">
                            <IconTag size={10} />
                            <span>Hors Colis</span>
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="line-qty-row">
                    <span className="qty-label">Attendu</span>
                    <span className="qty-value">{showQuantities ? line.orderedQty : '•••'}</span>
                    <span className="qty-label">
                      {stage === 'preparation' ? 'Préparé' : stage === 'chargement' ? 'Chargé' : 'Pointé'}
                    </span>
                    <span className="qty-value" style={{
                      color: disc.isExact && stageTotal > 0 ? 'var(--success)' :
                             disc.isOver ? 'var(--over)' :
                             disc.isShort ? 'var(--warning)' : 'var(--text)'
                    }}>
                      {stageTotal}
                    </span>
                  </div>

                  {/* Visual Progress Micro-Gauge Bar */}
                  <div
                    className="product-micro-gauge"
                    style={{
                      marginTop: 8,
                      height: 5,
                      background: 'var(--border-subtle, rgba(255, 255, 255, 0.08))',
                      borderRadius: 999,
                      overflow: 'hidden',
                      display: 'flex',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, line.orderedQty > 0 ? (stageTotal / line.orderedQty) * 100 : (stageTotal > 0 ? 100 : 0))}%`,
                        background: disc.isExact && stageTotal > 0 ? 'var(--success)' :
                                   disc.isOver ? 'var(--over)' :
                                   stageTotal > 0 ? 'var(--warning)' : 'transparent',
                        borderRadius: 999,
                        transition: 'width 0.25s ease',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {displayLines.length === 0 && siblingMatches.length > 0 && searchScope === 'current' ? (
          <div
            className="card my-3 p-3 text-center"
            style={{
              background: 'rgba(37, 99, 235, 0.12)',
              border: '1px solid rgba(37, 99, 235, 0.35)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            <div className="font-bold text-sm text-accent mb-1 flex items-center justify-center gap-1.5">
              <IconBuilding size={16} />
              <span>Non trouvé dans ce bon, mais trouvé dans un autre bon !</span>
            </div>
            <div className="text-xs text-muted mb-2">
              Cet article ({searchQuery}) se trouve dans {siblingMatches.length === 1 ? 'un autre bon' : `${siblingMatches.length} autres articles`} de {bill.client}.
            </div>
            <button
              type="button"
              className="btn btn-xs btn-primary inline-flex items-center gap-1"
              onClick={() => setSearchScope('all')}
            >
              <span>Basculer sur tous les {entityBills?.length || 3} bons ({siblingMatches.length} trouvés)</span>
              <span style={{ fontSize: '1rem', fontWeight: 800 }}>→</span>
            </button>
          </div>
        ) : displayLines.length === 0 && (
          <div className="empty-state">
            <p>Aucune ligne trouvée dans ce bon</p>
          </div>
        )}

        {/* Cross-bill matches from sibling bills of the same seller/client */}
        {siblingMatches.length > 0 && searchScope === 'current' && (
          <div className="mt-4 pt-3 mb-4" style={{ borderTop: '2px dashed var(--accent)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <IconBuilding size={16} style={{ color: 'var(--accent)' }} />
                <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Dans les autres bons de {bill.client} ({siblingMatches.length})
                </span>
              </div>
              <span className="badge badge-exact">{siblingBills.length} autre{siblingBills.length > 1 ? 's' : ''} BL</span>
            </div>
            <div className="text-xs text-muted mb-2">
              Cet article appartient à un autre bon de la même entité. Cliquez pour le pointer :
            </div>
            {siblingMatches.map((otherLine) => {
              const parentBill = entityBills?.find((b) => b.id === otherLine.billId);
              return (
                <div
                  key={otherLine.id}
                  className="product-card cursor-pointer"
                  style={{ borderLeft: '4px solid var(--accent)', margin: '0 0 8px 0' }}
                  onClick={() => nav(`/bill/${otherLine.billId}/line/${otherLine.id}?stage=${stage}`)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="badge" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', fontWeight: 800 }}>
                      {parentBill?.billNumber || `BL #${otherLine.billId}`}
                    </span>
                    <span className="line-no font-bold">N°{otherLine.no}</span>
                  </div>
                  <div className="line-designation font-bold text-sm">{otherLine.designation}</div>
                  <div className="flex justify-between items-center text-xs text-muted mt-1">
                    <span>RÉF: {otherLine.reference || 'Sans réf'}</span>
                    <span className="font-bold text-primary">Attendu: {otherLine.orderedQty}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Batch Action Bar when items are selected */}
      {selectedLineIds.size > 0 ? (
        <div className="batch-action-bar">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="badge badge-accent font-bold" style={{ fontSize: '0.85rem', padding: '4px 10px' }}>
                {selectedLineIds.size}
              </span>
              <span className="text-xs font-semibold text-secondary">
                article{selectedLineIds.size > 1 ? 's' : ''} sélectionné{selectedLineIds.size > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex gap-2">
              {stage === 'pointage' && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary flex items-center gap-1"
                  style={{ fontWeight: 700 }}
                  onClick={async () => {
                    const selectedLines = activeLinesPool.filter((l) => selectedLineIds.has(l.id!));
                    const res = await batchAssignContainerAndCount(selectedLines, 'pointage', null, {
                      mode: 'remaining',
                      outcome: 'accepted',
                    });
                    playSuccessChime();
                    showToast(`✓ ${res.processedCount} articles validés en pointage`, setToast);
                    setSelectedLineIds(new Set());
                    setIsSelectionMode(false);
                  }}
                >
                  <IconCheck size={14} /> Pointer Tout
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-secondary flex items-center gap-1"
                style={{ fontWeight: 700 }}
                onClick={() => setShowBatchTransferModal(true)}
                title="Transférer les articles sélectionnés vers une autre étape"
              >
                <IconTransfer size={14} />
                <span>Changer d'étape</span>
              </button>
              <button
                type="button"
                className="btn btn-primary flex items-center gap-1.5"
                style={{ padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700 }}
                onClick={() => setShowBatchModal(true)}
              >
                <IconBag size={15} />
                <span>Mettre en Colis</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bottom-bar">
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={() => nav(`/scan?billId=${billId}&stage=${stage}`)}
          >
            <IconScan size={18} /> SCANNER
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={() => nav(`/bill/${billId}/extras?stage=${stage}`)}
          >
            <IconPlus size={16} /> EXTRA
          </button>
        </div>
      )}

      <BatchContainerModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        billId={billId}
        client={bill.client}
        stage={stage}
        selectedLines={activeLinesPool.filter((l) => selectedLineIds.has(l.id!))}
        containers={activeContainers}
        onSuccess={(processedCount, unitsAdded, label) => {
          playSuccessChime();
          showToast(`✓ ${processedCount} articles (${unitsAdded} unités) rangés dans ${label}`, setToast);
          setSelectedLineIds(new Set());
          setIsSelectionMode(false);
        }}
      />

      {/* Batch stage transfer modal for selected items */}
      <TransferStageModal
        isOpen={showBatchTransferModal}
        onClose={() => setShowBatchTransferModal(false)}
        billId={billId}
        lineIds={Array.from(selectedLineIds)}
        initialFromStage={stage === 'preparation' && billStageUnitTotals.chargement > 0 ? 'chargement' : stage}
        initialToStage={stage === 'preparation' ? 'chargement' : 'preparation'}
        onSuccess={(units, linesCount, from, to) => {
          playSuccessChime();
          hapticTap('medium');
          const STAGE_NAMES = { preparation: 'Préparation', chargement: 'Chargement', pointage: 'Pointage' };
          showToast(`✓ ${units} pièces basculées de ${STAGE_NAMES[from]} vers ${STAGE_NAMES[to]} (${linesCount} articles)`, setToast);
          setSelectedLineIds(new Set());
          setIsSelectionMode(false);
        }}
      />

      {/* Whole bill stage transfer modal */}
      <TransferStageModal
        isOpen={showWholeBillTransferModal}
        onClose={() => setShowWholeBillTransferModal(false)}
        billId={billId}
        initialFromStage={stage === 'preparation' && billStageUnitTotals.chargement > 0 ? 'chargement' : stage}
        initialToStage={stage === 'preparation' ? 'chargement' : 'preparation'}
        onSuccess={(units, linesCount, from, to) => {
          playSuccessChime();
          hapticTap('medium');
          const STAGE_NAMES = { preparation: 'Préparation', chargement: 'Chargement', pointage: 'Pointage' };
          showToast(`✓ ${units} pièces de tout le bon basculées vers ${STAGE_NAMES[to]} (${linesCount} articles)`, setToast);
        }}
      />

      <QRSyncModal
        isOpen={showQRSync}
        onClose={() => setShowQRSync(false)}
        billId={billId}
        setToast={setToast}
      />

      {/* Assistive Recovery Modal when Hardware Laser scans an uncataloged barcode */}
      {unknownBarcodeModal && (
        <div className="modal-backdrop" onClick={() => setUnknownBarcodeModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold text-sm text-danger flex items-center gap-1">
                <IconWarning size={16} /> ARTICLE INTROUVABLE
              </div>
              <button className="btn btn-xs btn-ghost btn-icon" onClick={() => setUnknownBarcodeModal(null)}>
                <IconX size={16} />
              </button>
            </div>

            <div className="p-3 mb-3" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
              <div className="text-xs text-muted">Code-barres scanné :</div>
              <div className="font-mono font-bold text-base text-accent">{unknownBarcodeModal}</div>
              <div className="text-xs text-muted mt-1">
                Aucun article correspondant dans les {entityBills?.length || 1} bons de <strong>{bill.client}</strong>.
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn btn-primary btn-full flex items-center justify-center gap-2"
                onClick={() => {
                  const code = unknownBarcodeModal;
                  setUnknownBarcodeModal(null);
                  nav(`/bill/${billId}/extras?stage=${stage}&ean=${encodeURIComponent(code)}`);
                }}
              >
                <IconPlus size={16} /> Enregistrer comme Hors-BL / Extra
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-full flex items-center justify-center gap-2"
                onClick={() => {
                  setUnknownBarcodeModal(null);
                  nav(`/scan?billId=${billId}&stage=${stage}`);
                }}
              >
                <IconScan size={16} /> Scanner via Caméra & Associer
              </button>
            </div>
          </div>
        </div>
      )}
      {showScrollTop && (
        <button
          type="button"
          className="scroll-top-pill"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Retourner en haut"
        >
          ↑ Haut
        </button>
      )}
    </>
  );
}

// ============================================================
// PRODUCT SCREEN
// ============================================================
function ProductScreen({ setToast }: { setToast: (m: string) => void }) {
  const nav = useNavigate();
  const { billId: billIdStr, lineId: lineIdStr } = useParams();
  const [searchParams] = useSearchParams();
  const billId = Number(billIdStr);
  const lineId = Number(lineIdStr);

  const bill = useBill(billId);
  const allBillLines = useBillLines(billId);
  const line = useOrderLine(lineId);
  const events = useLineEvents(lineId);
  const containers = useBillContainers(billId);
  const profile = useProductProfile(line?.reference);

  const stageParam = (searchParams.get('stage') || sessionStorage.getItem(`pointage_stage_${billId}`) || 'preparation') as Stage;
  const [stage, setStage] = useState<Stage>(stageParam);
  const fromParam = searchParams.get('from');

  // Next article in sequential order
  const nextLine = React.useMemo(() => {
    if (!allBillLines || !line) return null;
    const sorted = [...allBillLines].sort((a, b) => {
      const pageDiff = (a.page || 0) - (b.page || 0);
      if (pageDiff !== 0) return pageDiff;
      return (Number(a.no) || 0) - (Number(b.no) || 0);
    });
    const currentIndex = sorted.findIndex((l) => l.id === lineId);
    if (currentIndex >= 0 && currentIndex < sorted.length - 1) {
      return sorted[currentIndex + 1];
    }
    return null;
  }, [allBillLines, line, lineId]);

  const isSubmittingRef = useRef(false);
  const lastSubmitTimeRef = useRef(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeTimeoutsRef = useRef<number[]>([]);

  const safeTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    activeTimeoutsRef.current.push(id);
    return id;
  };

  useEffect(() => {
    return () => {
      activeTimeoutsRef.current.forEach(id => clearTimeout(id));
      activeTimeoutsRef.current = [];
    };
  }, []);

  const handleBack = () => {
    if (fromParam === 'scan') {
      nav(`/bill/${billId}/scan?stage=${stage}`, { replace: true });
    } else if (fromParam === 'home') {
      nav('/', { replace: true });
    } else {
      nav(`/bill/${billId}?stage=${stage}`, { replace: true });
    }
  };

  const handleStageChange = (s: Stage) => {
    setStage(s);
    sessionStorage.setItem(`pointage_stage_${billId}`, s);
  };

  // Direct count correction & reset
  const [editingCount, setEditingCount] = useState(false);
  const [editCountVal, setEditCountVal] = useState('');

  // Packaging
  const [outerPack, setOuterPack] = useState<number | null>(null);
  const [innerPack, setInnerPack] = useState<number | null>(null);
  const [outerCount, setOuterCount] = useState(0);
  const [innerCount, setInnerCount] = useState(0);
  const [loose, setLoose] = useState(0);
  const [directTotal, setDirectTotal] = useState('');
  const [useDirectEntry, setUseDirectEntry] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<PointageOutcome>('accepted');
  const [refusalNote, setRefusalNote] = useState('');
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Substitution state
  const [showSubModal, setShowSubModal] = useState(false);
  const [subSearch, setSubSearch] = useState('');
  const [selectedSubLine, setSelectedSubLine] = useState<OrderLine | null>(null);
  const [subPaidAdvance, setSubPaidAdvance] = useState(false);
  const [subNotifyClient, setSubNotifyClient] = useState(true);
  const [subCustomNote, setSubCustomNote] = useState('');

  // Edit mode
  const [editingQty, setEditingQty] = useState(false);
  const [editQtyVal, setEditQtyVal] = useState('');
  const [editReason, setEditReason] = useState<ChangeReason>('official_change');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editFieldVal, setEditFieldVal] = useState('');
  const [showQuantities, setShowQuantities] = useState(() => localStorage.getItem('pointage_show_quantities') === 'true');

  const toggleShowQuantities = () => {
    setShowQuantities(prev => {
      const next = !prev;
      localStorage.setItem('pointage_show_quantities', String(next));
      return next;
    });
  };

  // Init pack sizes from line, profile, or parse from packagesRaw / designation
  useEffect(() => {
    if (line) {
      const parsed = parsePackagingString(line.packagesRaw, line.designation);
      let outer = line.outerPackSize ?? profile?.outerPackSize ?? parsed.outerPackSize ?? null;
      let inner = line.innerPackSize ?? profile?.innerPackSize ?? parsed.innerPackSize ?? null;

      // Auto-heal legacy false positives (e.g. 30 cm ruler saved as 30-unit pack)
      if (inner && parsed.innerPackSize === null && isDimensionInDesignation(inner, line.designation)) {
        inner = null;
        db.orderLines.update(line.id!, { innerPackSize: null });
        if (line.reference) {
          saveProductProfile(line.reference, { innerPackSize: null });
        }
      }
      if (outer && parsed.outerPackSize === null && isDimensionInDesignation(outer, line.designation)) {
        outer = null;
        db.orderLines.update(line.id!, { outerPackSize: null });
        if (line.reference) {
          saveProductProfile(line.reference, { outerPackSize: null });
        }
      }

      setOuterPack(outer);
      setInnerPack(inner);
    }
  }, [line?.id, profile?.id]);

  if (!line || !bill) return <div className="app-content"><div className="spinner" /></div>;

  const stageTotal = sumStageEvents(events, stage);
  const disc = calcDiscrepancy(line, stageTotal);
  const batchQty = useDirectEntry
    ? (parseInt(directTotal) || 0)
    : calcBatchQty(outerCount, innerCount, loose, outerPack, innerPack);
  const afterAdding = stageTotal + batchQty;
  const afterDisc = calcDiscrepancy(line, afterAdding);

  const stageTotals = {
    preparation: sumStageEvents(events, 'preparation'),
    chargement: sumStageEvents(events, 'chargement'),
    pointage: sumStageEvents(events, 'pointage'),
  };

  const pointageTotals = getStageTotals(events, 'pointage');

  let mismatchedStage: Stage | null = null;
  if (stageTotals[stage] === 0) {
    if (stage === 'preparation' && stageTotals.chargement > 0) mismatchedStage = 'chargement';
    else if (stage === 'chargement' && stageTotals.preparation > 0) mismatchedStage = 'preparation';
    else if (stage === 'pointage' && stageTotals.chargement > 0) mismatchedStage = 'chargement';
    else if (stage === 'pointage' && stageTotals.preparation > 0) mismatchedStage = 'preparation';
  }

  const handleAddCount = async (targetNextLineId?: number) => {
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < 600) return;
    if (isSubmittingRef.current || batchQty <= 0) return;
    isSubmittingRef.current = true;
    lastSubmitTimeRef.current = now;
    setIsSubmitting(true);

    try {
      hapticTap('medium');
      const qtyAdded = batchQty;

      await addCountEvent(
        billId,
        lineId,
        stage,
        batchQty,
        (stage === 'preparation' || stage === 'chargement') ? selectedContainer : null,
        stage === 'pointage' ? outcome : null,
        stage === 'pointage' && outcome !== 'accepted' ? refusalNote : null
      );

      if (stage === 'pointage') setRefusalNote('');

      // Save packaging if set
      if (line.reference && (outerPack || innerPack)) {
        await db.orderLines.update(lineId, {
          outerPackSize: outerPack,
          innerPackSize: innerPack,
        });
        await saveProductProfile(line.reference, {
          outerPackSize: outerPack,
          innerPackSize: innerPack,
        });
      }

      // Reset synchronously
      setOuterCount(0);
      setInnerCount(0);
      setLoose(0);
      setDirectTotal('');

      // Track line ID in sessionStorage for highlight in bill view
      sessionStorage.setItem('pointage_last_updated_line_id', String(lineId));

      if (afterDisc.isExact) {
        playExactMatchChime();
      } else if (afterDisc.isOver) {
        playWarningBeep();
      } else {
        playSuccessChime();
      }
      showToast(`+${qtyAdded} enregistré`, setToast);

      const autoReturn = localStorage.getItem('pointage_auto_return_after_add') !== 'false';

      if (targetNextLineId) {
        // Sequential picking: advance directly to next line without memory leaks / history bloat
        safeTimeout(() => {
          nav(`/bill/${billId}/line/${targetNextLineId}?stage=${stage}${fromParam ? `&from=${fromParam}` : ''}`, { replace: true });
        }, 180);
      } else if (autoReturn) {
        // Ergonomic auto-return: leave page after brief sensory confirmation window
        safeTimeout(() => {
          handleBack();
        }, 200);
      }
    } finally {
      safeTimeout(() => {
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      }, 450);
    }
  };

  const handleUndo = async () => {
    const success = await undoLastCount(lineId, stage);
    if (success) {
      playUndoBeep();
      hapticTap('medium');
      showToast('Dernier comptage annulé', setToast);
    } else {
      playErrorBeep();
      showToast('Rien à annuler', setToast);
    }
  };

  const handleResetCount = async () => {
    if (stageTotal === 0) return;
    const stageName = stage === 'pointage' ? 'Pointage' : stage === 'chargement' ? 'Chargement' : 'Préparation';
    if (!window.confirm(`Remettre le comptage de cet article à zéro pour l'étape "${stageName}" ?`)) {
      return;
    }
    await resetLineStageCount(lineId, stage);
    playUndoBeep();
    hapticTap('medium');
    showToast('Comptage réinitialisé à 0', setToast);
  };

  const handleApplyPackQty = (qty: number, packsCount: number, pSize?: number | null, isLooseOnly?: boolean) => {
    hapticTap('medium');
    playSuccessChime();
    if (useDirectEntry) {
      setDirectTotal(String(qty));
    } else {
      if (isLooseOnly) {
        setLoose(qty);
        setOuterCount(0);
        setInnerCount(0);
      } else if (pSize === innerPack) {
        setInnerCount(packsCount);
        setOuterCount(0);
        setLoose(0);
      } else {
        setOuterCount(packsCount);
        setInnerCount(0);
        setLoose(0);
      }
    }
    showToast(`Quantité réglée à ${qty} pièces (${packsCount} colis)`, setToast);
  };

  const handleClearPackaging = async () => {
    setOuterPack(null);
    setInnerPack(null);
    setOuterCount(0);
    setInnerCount(0);
    hapticTap('light');
    await db.orderLines.update(lineId, {
      outerPackSize: null,
      innerPackSize: null,
    });
    if (line.reference) {
      await saveProductProfile(line.reference, {
        outerPackSize: null,
        innerPackSize: null,
      });
    }
    showToast('Colisage effacé', setToast);
  };

  const handleSaveExactCount = async () => {
    const val = parseInt(editCountVal, 10);
    if (isNaN(val) || val < 0) return;
    await setLineStageTotalCount(
      billId,
      lineId,
      stage,
      val,
      stage === 'pointage' ? outcome : null,
      refusalNote
    );
    if (val === line.orderedQty) {
      playExactMatchChime();
    } else if (val > line.orderedQty) {
      playWarningBeep();
    } else {
      playSuccessChime();
    }
    setEditingCount(false);
    showToast(`Comptage ajusté à ${val} pièces`, setToast);
  };

  const handleSaveQty = async () => {
    const newQty = parseInt(editQtyVal);
    if (isNaN(newQty) || newQty < 0) return;
    await updateOrderLineField(lineId, 'orderedQty', line.orderedQty, newQty, editReason);
    setEditingQty(false);
    showToast('Quantité mise à jour', setToast);
  };

  const handleStatusChange = async (newStatus: LineStatus) => {
    // Confirm if has count history
    if (newStatus !== 'active' && events.filter(e => !e.undone).length > 0) {
      if (!window.confirm('Cette ligne a un historique de comptage. Confirmer le changement de statut ?')) {
        return;
      }
    }
    await updateLineStatus(lineId, newStatus);
    showToast(`Statut → ${newStatus === 'cancelled' ? 'ANNULÉ' : newStatus === 'not_found' ? 'INTROUVABLE' : 'ACTIF'}`, setToast);
  };

  return (
    <ErrorBoundary fallbackTitle="Erreur d'affichage de la fiche produit">
      <header className="app-header">

        <button className="back-btn" onClick={handleBack} aria-label="Retour"><IconArrowLeft size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent)' }}>
              N°{line.no}
            </span>
            {line.page != null && (
              <span className="text-sm font-bold text-muted">PAGE {line.page}</span>
            )}
            <span
              className={`badge ${disc.isExact && stageTotal > 0 ? 'badge-exact' : disc.isOver ? 'badge-over' : disc.isShort && stageTotal > 0 ? 'badge-short' : ''}`}
              style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 7px', marginLeft: 'auto', marginRight: 4 }}
              title="Quantité déjà comptée pour cette étape"
            >
              {stageTotal === 0
                ? `0 / ${line.orderedQty} pcs`
                : disc.isExact
                ? `✓ ${stageTotal} / ${line.orderedQty} pcs`
                : disc.isOver
                ? `+${disc.over} excédent (${stageTotal}/${line.orderedQty})`
                : `${stageTotal} / ${line.orderedQty} pcs`}
            </span>
          </div>
          <div className="text-xs text-muted truncate flex items-center gap-1.5">
            <span>{bill.client}</span>
            <span>•</span>
            <span
              className="cursor-pointer font-bold text-accent"
              onClick={() => nav(`/bill/${billId}?stage=${stage}`)}
              title="Voir l'ensemble du bon"
            >
              {bill.billNumber} ›
            </span>
          </div>
        </div>
        <AudioMuteButton />
      </header>

      <div className="app-content">
        {/* Product card */}
        <div className="card">
          <div className="flex justify-between items-start">
            <div>
              <span className="line-no" style={{ fontSize: '1.2rem' }}>N°{line.no}</span>
              {line.page != null && <span className="line-page" style={{ marginLeft: 8 }}>PAGE {line.page}</span>}
              <div className="font-bold text-lg mt-1">{line.designation}</div>
              <div className="text-sm text-secondary mt-1">
                {line.reference ? `REF: ${line.reference}` : 'Sans réf.'}
                {line.ean ? ` • EAN: ${line.ean}` : ''}
              </div>
              {line.packagesRaw && (
                <div className="text-xs text-muted mt-1">Colisage document: {line.packagesRaw}</div>
              )}
            </div>
            <button className="btn btn-xs btn-ghost flex items-center gap-1" onClick={() => { setEditingField('designation'); setEditFieldVal(line.designation); }}>
              <IconPencil size={11} /> Modifier
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-xs btn-ghost flex items-center gap-1" onClick={() => { setEditingField('reference'); setEditFieldVal(line.reference || ''); }}>
              <IconPencil size={11} /> Réf
            </button>
            <button className="btn btn-xs btn-ghost flex items-center gap-1" onClick={() => { setEditingField('ean'); setEditFieldVal(line.ean || ''); }}>
              <IconPencil size={11} /> EAN
            </button>
            <button className="btn btn-xs btn-ghost flex items-center gap-1" onClick={() => { setEditingField('page'); setEditFieldVal(line.page != null ? String(line.page) : ''); }}>
              <IconPencil size={11} /> Page
            </button>
          </div>
          {disc.isModified && (
            <div className="mt-2">
              <span className="badge badge-modified">MODIFIÉ</span>
              <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                Original: {line.originalOrderedQty}
              </span>
            </div>
          )}
          {line.status !== 'active' && (
            <div className="mt-2">
              <span className={`badge badge-${line.status === 'out_of_stock' ? 'out-of-stock' : line.status === 'cancelled' ? 'cancelled' : 'not-found'}`}>
                {line.status === 'out_of_stock' ? 'RUPTURE DÉFINITIVE' :
                 line.status === 'cancelled' ? 'ANNULÉ' :
                 line.status === 'not_found' ? 'INTROUVABLE' :
                 'SUPPRIMÉ PAR RÉVISION'}
              </span>
            </div>
          )}
        </div>

        {/* Expected & Stage Totals */}
        <div className="card">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-muted">ATTENDU</div>
              <div className="qty-big qty-expected">{showQuantities ? line.orderedQty : '•••'}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`btn btn-xs ${showQuantities ? 'btn-primary' : 'btn-secondary'} flex items-center gap-1`}
                onClick={toggleShowQuantities}
                style={{ fontSize: '0.72rem' }}
                title="Afficher/masquer les quantités attendues"
              >
                {showQuantities ? <IconEye size={13} /> : <IconEyeOff size={13} />}
                {showQuantities ? 'Visible' : 'Masqué'}
              </button>
              <button className="btn btn-sm btn-secondary flex items-center gap-1" onClick={() => {
                setEditingQty(true);
                setEditQtyVal(String(line.orderedQty));
              }}>
                <IconPencil size={13} /> MODIFIER
              </button>
            </div>
          </div>

          <div className="divider" />

          <div className="flex gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted">PRÉPARÉ</div>
              <div className="font-bold text-lg">{stageTotals.preparation}</div>
            </div>
            <div>
              <div className="text-xs text-muted">CHARGÉ</div>
              <div className="font-bold text-lg">{stageTotals.chargement}</div>
            </div>
            <div>
              <div className="text-xs text-muted">POINTÉ</div>
              <div className="font-bold text-lg">{stageTotals.pointage}</div>
            </div>
          </div>

          {stage === 'pointage' && stageTotals.pointage > 0 && (
            <div className="flex gap-3 flex-wrap mt-2">
              <div className="text-xs flex items-center gap-1"><IconCheck size={12} /> {pointageTotals.byOutcome.accepted}</div>
              <div className="text-xs flex items-center gap-1"><IconWarning size={12} /> D.Accepté {pointageTotals.byOutcome.damaged_accepted}</div>
              <div className="text-xs flex items-center gap-1"><IconX size={12} /> D.Refusé {pointageTotals.byOutcome.damaged_refused}</div>
              <div className="text-xs flex items-center gap-1"><IconBan size={12} /> Refusé {pointageTotals.byOutcome.refused}</div>
            </div>
          )}
        </div>

        {/* Smart Transfer Suggestion Banner */}
        {stageTotal === 0 && mismatchedStage && (
          <div
            className="card mb-3 flex justify-between items-center"
            style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              padding: '10px 14px',
            }}
          >
            <div className="flex items-center gap-2">
              <IconTransfer size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <div>
                <div className="font-bold text-xs" style={{ color: 'var(--warning)' }}>
                  {stageTotals[mismatchedStage]} pièces comptées en {mismatchedStage === 'preparation' ? 'Préparation' : mismatchedStage === 'chargement' ? 'Chargement' : 'Pointage'}
                </div>
                <div className="text-xs text-muted">
                  Erreur d'étape ? Vous êtes actuellement en {stage === 'preparation' ? 'Préparation' : stage === 'chargement' ? 'Chargement' : 'Pointage'}.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-xs btn-primary flex items-center gap-1"
              style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
              onClick={async () => {
                const units = await transferLineStageCounts(billId, lineId, mismatchedStage, stage);
                playSuccessChime();
                hapticTap('medium');
                const STAGE_NAMES = { preparation: 'Préparation', chargement: 'Chargement', pointage: 'Pointage' };
                showToast(`✓ ${units} pièces basculées vers ${STAGE_NAMES[stage]}`, setToast);
              }}
            >
              ⇄ Basculer ici
            </button>
          </div>
        )}

        {/* Discrepancy summary */}
        <div className="card">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted font-bold">
              {stage === 'preparation' ? 'PRÉPARATION' : stage === 'chargement' ? 'CHARGEMENT' : 'POINTAGE'}
            </span>
            <div className="flex items-center gap-1.5">
              {events.filter(e => !e.undone).length > 0 && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost flex items-center gap-1"
                  style={{ fontSize: '0.68rem', padding: '2px 6px', color: 'var(--accent)' }}
                  onClick={() => setShowTransferModal(true)}
                  title="Transférer les comptages vers une autre étape"
                >
                  <IconTransfer size={12} /> Transférer
                </button>
              )}
              {stageTotal > 0 && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost text-danger flex items-center gap-1"
                  onClick={handleResetCount}
                  style={{ fontSize: '0.68rem', padding: '2px 6px' }}
                  title="Remettre le comptage de cet article à zéro"
                >
                  <IconTrash size={12} /> Réinitialiser
                </button>
              )}
              {disc.isExact && stageTotal > 0 && <span className="badge badge-exact flex items-center gap-1"><IconCheck size={11} /> EXACT</span>}
              {disc.isShort && <span className="badge badge-short">{showQuantities ? `${disc.remaining} MANQUANTS` : 'MANQUANTS'}</span>}
              {disc.isOver && <span className="badge badge-over">{showQuantities ? `${disc.over} EXCÉDENT` : 'EXCÉDENT'}</span>}
            </div>
          </div>
          <div className="flex justify-between items-end mt-2">
            <div>
              <div className="text-xs text-muted flex items-center gap-1">
                COMPTÉ
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  style={{ padding: '0 4px', fontSize: '0.68rem', color: 'var(--accent)' }}
                  onClick={() => {
                    setEditCountVal(String(stageTotal));
                    setEditingCount(true);
                  }}
                  title="Corriger directement la quantité comptée"
                >
                  <IconPencil size={11} /> Corriger
                </button>
              </div>
              <div className="qty-big" style={{
                color: disc.isExact && stageTotal > 0 ? 'var(--success)' :
                       disc.isOver ? 'var(--over)' :
                       disc.isShort ? 'var(--warning)' : 'var(--accent)'
              }}>
                {stageTotal}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="text-xs text-muted">RESTANT</div>
              <div className="qty-big" style={{
                color: disc.remaining > 0 ? 'var(--warning)' : 'var(--success)'
              }}>
                {showQuantities ? disc.remaining : '•••'}
              </div>
            </div>
          </div>

          {/* Inline exact count correction */}
          {editingCount && (
            <div className="mt-2.5 p-2" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-bold text-muted mb-1">CORRIGER LA QUANTITÉ COMPTÉE :</div>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  className="input input-sm"
                  style={{ maxWidth: 110, fontFamily: 'var(--font-mono)' }}
                  value={editCountVal}
                  onChange={(e) => setEditCountVal(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn btn-sm btn-primary" onClick={handleSaveExactCount}>
                  Valider
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditingCount(false)}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Visual pack breakdown illustration & Nearest-Pack Recommendation */}
          {(innerPack || outerPack) && showQuantities && disc.remaining > 0 && (() => {
            const activePack = innerPack || outerPack;
            if (!activePack || activePack <= 1) return null;
            const rec = calcClosestPackRecommendation(disc.remaining, activePack);
            if (!rec) return null;

            return (
              <div
                className="mt-2.5 p-2.5"
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-muted flex items-center gap-1.5">
                    <IconBox size={14} style={{ color: 'var(--accent)' }} />
                    <span>COLISAGE DU RELIQUAT ({disc.remaining} pcs) :</span>
                  </div>
                  <span
                    className="badge"
                    style={{
                      fontSize: '0.68rem',
                      padding: '2px 6px',
                      background: rec.isExactMultiple ? 'rgba(34, 197, 94, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                      color: rec.isExactMultiple ? 'var(--success)' : 'var(--accent)',
                      border: `1px solid ${rec.isExactMultiple ? 'rgba(34, 197, 94, 0.3)' : 'rgba(37, 99, 235, 0.3)'}`,
                      fontWeight: 700,
                    }}
                  >
                    {rec.isExactMultiple ? '✓ Multiple exact' : '🎯 Règle du plus proche'}
                  </span>
                </div>

                {rec.isExactMultiple ? (
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                    <div className="flex items-center gap-1.5 font-bold" style={{ color: 'var(--success)' }}>
                      <IconBox size={14} />
                      <span>{rec.closestPacks} × Colis ({activePack} pcs) = {rec.closestQty} pcs</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-xs btn-primary flex items-center gap-1"
                      onClick={() => handleApplyPackQty(rec.closestQty, rec.closestPacks, activePack)}
                    >
                      <IconCheck size={12} /> Appliquer {rec.closestQty} pcs
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* Nearest Recommendation Box */}
                    <div
                      className="p-2 mb-2 flex items-center justify-between gap-2 flex-wrap"
                      style={{
                        background: rec.closestAction === 'round_down'
                          ? 'rgba(234, 179, 8, 0.10)'
                          : 'rgba(37, 99, 235, 0.10)',
                        border: `1px solid ${rec.closestAction === 'round_down' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(37, 99, 235, 0.3)'}`,
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div>
                        <div className="text-xs font-extrabold flex items-center gap-1.5">
                          <span style={{ color: rec.closestAction === 'round_down' ? 'var(--warning)' : 'var(--accent)' }}>
                            🎯 Recommandé : {rec.closestPacks} Colis = {rec.closestQty} pcs
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: rec.closestAction === 'round_down' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(37, 99, 235, 0.2)',
                              color: rec.closestAction === 'round_down' ? 'var(--warning)' : 'var(--accent)',
                            }}
                          >
                            {rec.closestDiff < 0 ? `${rec.closestDiff} vrac retiré` : `+${rec.closestDiff} pcs (+1 colis)`}
                          </span>
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          Au plus proche ({Math.abs(rec.closestDiff)} pcs d'écart vs {rec.closestAction === 'round_down' ? rec.upperDiff : Math.abs(rec.lowerDiff)} pcs)
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-xs btn-primary flex items-center gap-1"
                        style={{ fontWeight: 800, padding: '4px 10px' }}
                        onClick={() => handleApplyPackQty(rec.closestQty, rec.closestPacks, activePack)}
                        title="Pré-remplir la quantité au plus proche"
                      >
                        <span>⚡ Appliquer {rec.closestQty} pcs</span>
                      </button>
                    </div>

                    {/* Options Breakdown Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <button
                        type="button"
                        className={`btn btn-xs ${rec.closestAction === 'round_down' ? 'btn-secondary' : 'btn-ghost'}`}
                        style={{
                          fontSize: '0.7rem',
                          border: rec.closestAction === 'round_down' ? '1px solid var(--border)' : '1px dashed var(--border)',
                        }}
                        onClick={() => handleApplyPackQty(rec.lowerQty, rec.lowerPacks, activePack)}
                        title={`Colis complets inférieurs : ${rec.lowerQty} pcs`}
                      >
                        📦 {rec.lowerPacks} Colis ({rec.lowerQty} pcs)
                        <span className="text-muted ml-1">({rec.lowerDiff} pcs)</span>
                      </button>

                      <button
                        type="button"
                        className={`btn btn-xs ${rec.closestAction === 'round_up' ? 'btn-secondary' : 'btn-ghost'}`}
                        style={{
                          fontSize: '0.7rem',
                          border: rec.closestAction === 'round_up' ? '1px solid var(--border)' : '1px dashed var(--border)',
                        }}
                        onClick={() => handleApplyPackQty(rec.upperQty, rec.upperPacks, activePack)}
                        title={`Colis complets supérieurs : ${rec.upperQty} pcs`}
                      >
                        📦 {rec.upperPacks} Colis ({rec.upperQty} pcs)
                        <span className="text-muted ml-1">(+{rec.upperDiff} pcs)</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-xs btn-ghost text-muted"
                        style={{ fontSize: '0.7rem' }}
                        onClick={() => handleApplyPackQty(disc.remaining, 0, activePack, true)}
                        title={`Conserver exactement ${disc.remaining} pièces en vrac`}
                      >
                        ✋ Vrac exact ({disc.remaining} pcs)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Stage tabs for counting */}
        <div className="stage-tabs">
          {(['preparation', 'chargement', 'pointage'] as Stage[]).map((s) => (
            <button
              key={s}
              className={`stage-tab ${stage === s ? 'active' : ''}`}
              onClick={() => handleStageChange(s)}
            >
              {s === 'preparation' ? 'Préparation' : s === 'chargement' ? 'Chargement' : 'Pointage'}
            </button>
          ))}
        </div>

        {/* Packaging setup */}
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginTop: 0, marginBottom: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>EMBALLAGES</div>
            {(outerPack != null || innerPack != null) && (
              <button
                type="button"
                className="btn btn-xs btn-ghost text-danger flex items-center gap-1"
                onClick={handleClearPackaging}
                title="Effacer le colisage et rétablir le comptage par unité"
              >
                <IconTrash size={12} /> Effacer colisage
              </button>
            )}
          </div>
          {profile && (profile.innerPackSize || profile.outerPackSize) && !line.innerPackSize && !line.outerPackSize && (
            <div className="mb-2 p-2" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
              <div className="text-xs text-muted">Mémorisé:</div>
              {profile.outerPackSize && <div className="text-sm">Carton = {profile.outerPackSize} unités</div>}
              {profile.innerPackSize && <div className="text-sm">Sous-pack = {profile.innerPackSize} unités</div>}
              <button className="btn btn-sm btn-primary mt-2" onClick={() => {
                setOuterPack(profile.outerPackSize);
                setInnerPack(profile.innerPackSize);
              }}>UTILISER</button>
            </div>
          )}

          <div className="flex gap-2 items-center mb-2">
            <span className="text-sm" style={{ minWidth: 80 }}>Carton:</span>
            <input
              id="input-outer-pack"
              name="outerPackSize"
              aria-label="Taille colis extérieur"
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={outerPack ?? ''}
              onChange={(e) => {
                const val = e.target.value.trim();
                if (!val) { setOuterPack(null); return; }
                const v = parseInt(val, 10);
                setOuterPack(!isNaN(v) && v > 0 ? v : null);
              }}
              style={{ maxWidth: 100 }}
            />
            <span className="text-xs text-muted">unités</span>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm" style={{ minWidth: 80 }}>Sous-pack:</span>
            <input
              id="input-inner-pack"
              name="innerPackSize"
              aria-label="Taille colis intérieur"
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={innerPack ?? ''}
              onChange={(e) => {
                const val = e.target.value.trim();
                if (!val) { setInnerPack(null); return; }
                const v = parseInt(val, 10);
                setInnerPack(!isNaN(v) && v > 0 ? v : null);
              }}
              style={{ maxWidth: 100 }}
            />
            <span className="text-xs text-muted">unités</span>
          </div>
        </div>

        {/* Pointage outcome (Placed before quantity so worker picks status first) */}
        {stage === 'pointage' && (
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>RÉSULTAT DU POINTAGE</div>
            <div className="outcome-grid">
              {(['accepted', 'damaged_accepted', 'damaged_refused', 'refused'] as PointageOutcome[]).map((o) => (
                <button
                  key={o}
                  className={`outcome-btn ${outcome === o ? 'selected' : ''}`}
                  onClick={() => setOutcome(o)}
                >
                  {o === 'accepted' ? (
                    <span className="flex items-center justify-center gap-1"><IconCheck size={16} /> Conforme</span>
                  ) : o === 'damaged_accepted' ? (
                    <span className="flex items-center justify-center gap-1"><IconWarning size={16} /> Avarié Accepté</span>
                  ) : o === 'damaged_refused' ? (
                    <span className="flex items-center justify-center gap-1"><IconX size={16} /> Avarié Refusé</span>
                  ) : (
                    <span className="flex items-center justify-center gap-1"><IconBan size={16} /> Refusé</span>
                  )}
                </button>
              ))}
            </div>

            {stage === 'pointage' && outcome !== 'accepted' && (
              <div className="mt-3 p-2" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-badge)', border: '1px solid var(--glass-border-bright)' }}>
                <div className="text-xs font-bold text-muted mb-1">MOTIF :</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {['Emballage écrasé / ouvert', 'Article cassé / défectueux', 'Non commandé / Réf erronée', 'Date dépassée'].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      className="btn btn-xs btn-ghost"
                      style={{
                        fontSize: '0.75rem',
                        borderColor: refusalNote === chip ? 'var(--accent)' : 'var(--border)',
                        background: refusalNote === chip ? 'var(--accent-glow)' : 'transparent',
                        color: refusalNote === chip ? 'var(--accent)' : 'inherit',
                      }}
                      onClick={() => setRefusalNote(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="input input-sm"
                  style={{ width: '100%' }}
                  placeholder="Ou précisez le problème (ex: 2 trousses fermeture bloquée)..."
                  value={refusalNote}
                  onChange={e => setRefusalNote(e.target.value)}
                />
              </div>
            )}
          </div>
        )}


        {/* Quantity input */}
        <div className="card">
          <div className="flex justify-between items-center mb-2">
            <div className="section-title" style={{ marginTop: 0, marginBottom: 0 }}>QUANTITÉ À AJOUTER</div>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setUseDirectEntry(!useDirectEntry)}
            >
              {useDirectEntry ? (
                <span className="flex items-center gap-1"><IconLayers size={14} /> EMBALLAGES</span>
              ) : (
                <span className="flex items-center gap-1"><IconHash size={14} /> TOTAL DIRECT</span>
              )}
            </button>
          </div>

          {useDirectEntry ? (
            <input
              id="input-direct-total"
              name="directTotal"
              aria-label="Quantité totale directe"
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="Total direct..."
              value={directTotal}
              onChange={(e) => setDirectTotal(e.target.value)}
              style={{ fontSize: '1.4rem', fontWeight: 800, textAlign: 'center', fontFamily: 'var(--font-mono)' }}
            />
          ) : (
            <div>
              {outerPack && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">EXT (×{outerPack})</span>
                  <Stepper value={outerCount} onChange={setOuterCount} />
                </div>
              )}
              {innerPack && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">INT (×{innerPack})</span>
                  <Stepper value={innerCount} onChange={setInnerCount} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">UNITÉS</span>
                <Stepper value={loose} onChange={setLoose} />
              </div>
              {((outerCount > 0 && outerPack) || (innerCount > 0 && innerPack)) && (
                <div className="text-xs font-mono text-muted mt-2 px-2 py-1" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)' }}>
                  {outerCount > 0 && outerPack ? `${outerCount} ext × ${outerPack} = ${outerCount * outerPack} pcs ` : ''}
                  {innerCount > 0 && innerPack ? `${outerCount > 0 ? '+ ' : ''}${innerCount} int × ${innerPack} = ${innerCount * innerPack} pcs ` : ''}
                  {loose > 0 ? `+ ${loose} unités ` : ''}
                  = <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{batchQty} pièces</span>
                </div>
              )}
            </div>
          )}

          {/* Quick preset chips for rapid warehouse counting */}
          <div className="flex gap-1 mt-3 flex-wrap items-center">
            <button className="btn btn-xs btn-secondary" onClick={() => {
              hapticTap('light');
              if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + 1));
              else setLoose(prev => prev + 1);
            }}>+1</button>
            <button className="btn btn-xs btn-secondary" onClick={() => {
              hapticTap('light');
              if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + 5));
              else setLoose(prev => prev + 5);
            }}>+5</button>
            <button className="btn btn-xs btn-secondary" onClick={() => {
              hapticTap('light');
              if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + 10));
              else setLoose(prev => prev + 10);
            }}>+10</button>
            <button className="btn btn-xs btn-secondary" onClick={() => {
              hapticTap('light');
              if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + 12));
              else setLoose(prev => prev + 12);
            }}>+12</button>
            {innerPack && innerPack > 1 && innerPack !== 5 && innerPack !== 10 && innerPack !== 12 && (
              <button className="btn btn-xs btn-secondary" onClick={() => {
                hapticTap('light');
                if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + innerPack));
                else setLoose(prev => prev + innerPack);
              }}>+{innerPack}</button>
            )}
            {outerPack && outerPack > 1 && (
              <button className="btn btn-xs btn-secondary" onClick={() => {
                hapticTap('light');
                if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + outerPack));
                else setLoose(prev => prev + outerPack);
              }}>+{outerPack}</button>
            )}

            {/* Minus buttons to correct accidental taps */}
            <button
              type="button"
              className="btn btn-xs btn-ghost text-muted"
              style={{ border: '1px dashed var(--border)' }}
              onClick={() => {
                hapticTap('light');
                if (useDirectEntry) {
                  const c = parseInt(directTotal) || 0;
                  if (c > 0) setDirectTotal(String(c - 1));
                } else {
                  setLoose(prev => Math.max(0, prev - 1));
                }
              }}
              title="Diminuer de 1"
            >
              -1
            </button>
            <button
              type="button"
              className="btn btn-xs btn-ghost text-muted"
              style={{ border: '1px dashed var(--border)' }}
              onClick={() => {
                hapticTap('light');
                if (useDirectEntry) {
                  const c = parseInt(directTotal) || 0;
                  if (c >= 5) setDirectTotal(String(c - 5));
                  else setDirectTotal('0');
                } else {
                  setLoose(prev => Math.max(0, prev - 5));
                }
              }}
              title="Diminuer de 5"
            >
              -5
            </button>

            {/* STRICT BLIND COUNT: Only show SOLDE / AU PLUS PROCHE when quantities are VISIBLE */}
            {showQuantities && disc.remaining > 0 && (() => {
              const activePack = innerPack || outerPack;
              const rec = activePack && activePack > 1 ? calcClosestPackRecommendation(disc.remaining, activePack) : null;
              return (
                <>
                  {rec && !rec.isExactMultiple && (
                    <button
                      type="button"
                      className="btn btn-xs flex items-center gap-1"
                      style={{
                        background: 'rgba(37, 99, 235, 0.15)',
                        border: '1px solid rgba(37, 99, 235, 0.35)',
                        color: 'var(--accent)',
                        fontWeight: 700,
                      }}
                      onClick={() => handleApplyPackQty(rec.closestQty, rec.closestPacks, activePack)}
                      title={`Régler au plus proche : ${rec.closestQty} pcs (${rec.closestPacks} colis)`}
                    >
                      <IconBox size={13} /> AU PLUS PROCHE ({rec.closestQty})
                    </button>
                  )}
                  <button className="btn btn-xs btn-primary flex items-center gap-1" onClick={() => {
                    hapticTap('medium');
                    playExactMatchChime();
                    if (useDirectEntry) setDirectTotal(String(disc.remaining));
                    else setLoose(disc.remaining);
                  }}>
                    <IconBolt size={13} /> SOLDE ({disc.remaining})
                  </button>
                </>
              );
            })()}
          </div>

          {/* Batch preview */}
          {batchQty > 0 && (
            <div className="mt-3 p-2" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-badge)', border: 'var(--glass-border-subtle)' }}>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted font-semibold">CE LOT</span>
                <span className="font-bold text-lg" style={{ fontFamily: 'var(--font-mono)' }}>+{batchQty}</span>
              </div>
              <div className="flex justify-between items-baseline mt-1">
                <span className="text-sm text-muted font-semibold">APRÈS AJOUT</span>
                <span className="font-bold text-lg" style={{
                  fontFamily: 'var(--font-mono)',
                  color: afterDisc.isExact ? 'var(--success)' :
                         afterDisc.isOver ? 'var(--over)' : 'var(--text-primary)'
                }}>
                  {afterAdding}
                </span>
              </div>
              <div className="mt-2">
                {afterDisc.isExact && <span className="badge badge-exact flex items-center gap-1"><IconCheck size={11} /> SERA EXACT</span>}
                {afterDisc.isOver && <span className="badge badge-over">{afterDisc.over} EXCÉDENT</span>}
                {afterDisc.isShort && <span className="badge badge-short">{afterDisc.remaining} RESTANTS</span>}
              </div>
            </div>
          )}
        </div>

        {/* Transport Containers (Carton & Chouala) */}
        {(stage === 'preparation' || stage === 'chargement') ? (
          <div className="card">
            <div className="flex justify-between items-center mb-2">
              <div className="section-title" style={{ marginTop: 0, marginBottom: 0 }}>
                COLIS DE RANGEMENT {stage === 'chargement' ? '(CHARGEMENT)' : ''}
              </div>
              <span className="text-xs text-muted">Cartons & Sacs (Conditionnement)</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                className={`container-tag ${selectedContainer === null ? 'selected' : ''}`}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-pill)',
                  fontWeight: selectedContainer === null ? 700 : 500,
                  cursor: 'pointer',
                  borderColor: selectedContainer === null ? 'var(--success)' : 'var(--border)',
                  background: selectedContainer === null ? 'rgba(16, 185, 129, 0.2)' : undefined,
                  color: selectedContainer === null ? 'var(--success)' : 'inherit',
                }}
                onClick={() => setSelectedContainer(null)}
              >
                <span className="flex items-center gap-1">
                  {selectedContainer === null && <IconCheck size={12} />}
                  Hors Colis (Vrac)
                </span>
              </button>

              {containers.map((c) => {
                const isChouala = c.type === 'chouala';
                const isSelected = selectedContainer === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`container-tag ${isChouala ? 'chouala' : ''} ${isSelected ? 'selected' : ''}`}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-pill)',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedContainer(isSelected ? null : c.id!)}
                  >
                    <span className="flex items-center gap-1">
                      {isSelected && <IconCheck size={12} />}
                      {isChouala ? <IconBag size={13} /> : <IconBox size={13} />}
                      {c.label} (BL {bill.billNumber})
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                className="container-tag"
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  borderStyle: 'dashed',
                }}
                onClick={async () => {
                  const c = await createTransportContainer(billId, bill?.client, undefined, 'carton');
                  setSelectedContainer(c.id!);
                  showToast(`${c.label} créé`, setToast);
                }}
              >
                <span className="flex items-center gap-1">
                  <IconPlus size={13} /> Nouveau Carton
                </span>
              </button>

              <button
                type="button"
                className="container-tag chouala"
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  borderStyle: 'dashed',
                }}
                onClick={async () => {
                  const c = await createTransportContainer(billId, bill?.client, undefined, 'chouala');
                  setSelectedContainer(c.id!);
                  showToast(`${c.label} créé`, setToast);
                }}
                title="Sac de transport / conditionnement en polypropylène tissé (Chouala)"
              >
                <span className="flex items-center gap-1">
                  <IconPlus size={13} /> Nouveau Sac (Chouala)
                </span>
              </button>
            </div>

            {/* Physical marker label hint for warehouse staff */}
            {selectedContainer && (() => {
              const curC = containers.find(c => c.id === selectedContainer);
              if (!curC) return null;
              return (
                <div className="mt-2 p-2" style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--glass-border-bright)' }}>
                  <div className="text-xs font-mono text-muted">🏷️ MARQUAGE AU FEUTRE DU COLIS :</div>
                  <div className="text-xs font-mono font-bold text-accent">
                    {bill.client || 'CLIENT'} — BL {bill.billNumber} — {curC.label}
                  </div>
                </div>
              );
            })()}

            {/* Show transport breakdown for this line */}
            {events.filter(e => (e.stage === 'preparation' || e.stage === 'chargement') && !e.undone).length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div className="text-xs text-muted mb-1">RÉPARTITION ACTUELLE :</div>
                {containers.map((c) => {
                  const qty = events
                    .filter(e => !e.undone && e.containerId === c.id)
                    .reduce((s, e) => s + e.quantity, 0);
                  if (qty === 0) return null;
                  return (
                    <div key={c.id} className="flex justify-between text-sm py-1">
                      <span className="font-semibold text-accent flex items-center gap-1">
                        {c.type === 'chouala' ? <IconBag size={13} /> : <IconBox size={13} />}
                        {c.label} (BL {bill.billNumber})
                      </span>
                      <span className="font-bold">{qty} unités</span>
                    </div>
                  );
                })}
                {(() => {
                  const noContainer = events
                    .filter(e => !e.undone && !e.containerId)
                    .reduce((s, e) => s + e.quantity, 0);
                  if (noContainer === 0) return null;
                  return (
                    <div className="flex justify-between text-sm py-1">
                      <span className="text-muted">Hors Colis (Vrac)</span>
                      <span className="font-bold">{noContainer} unités</span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ) : (
          /* Pointage: READ-ONLY view */
          <div className="card">
            <div className="flex justify-between items-center mb-2">
              <div className="section-title" style={{ margin: 0 }}>COLIS DE RANGEMENT</div>
              <span className="badge badge-secondary" style={{ fontSize: '0.68rem' }}>Lecture seule</span>
            </div>
            <div className="flex flex-col gap-1">
              {containers.map((c) => {
                const qty = events
                  .filter(e => !e.undone && e.containerId === c.id)
                  .reduce((s, e) => s + e.quantity, 0);
                if (qty === 0) return null;
                return (
                  <div key={c.id} className="flex justify-between text-sm py-1 border-b" style={{ borderColor: 'var(--glass-border-subtle)' }}>
                    <span className="container-tag selected flex items-center gap-1" style={{ fontSize: '0.8rem' }}>
                      {c.type === 'chouala' ? <IconBag size={12} /> : <IconBox size={12} />}
                      {c.label} (BL {bill.billNumber})
                    </span>
                    <span className="font-bold font-mono text-base">{qty} unités</span>
                  </div>
                );
              })}
              {(() => {
                const noContainer = events
                  .filter(e => !e.undone && !e.containerId)
                  .reduce((s, e) => s + e.quantity, 0);
                if (noContainer === 0) return null;
                return (
                  <div className="flex justify-between text-sm py-1">
                    <span className="text-muted">Hors Colis (Vrac)</span>
                    <span className="font-bold font-mono text-base">{noContainer} unités</span>
                  </div>
                );
              })()}
              {events.filter(e => !e.undone).length === 0 && (
                <div className="text-xs text-muted py-1">Aucun colis assigné en préparation</div>
              )}
            </div>
          </div>
        )}

        {/* Commercial Sample Card */}
        <div className="card mb-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="section-title" style={{ marginTop: 0, marginBottom: 2 }}>ÉCHANTILLON COMMERCIAL</div>
              <div className="text-xs text-muted">Pièce prélevée pour démonstration commerciale</div>
            </div>
            <button
              type="button"
              className={`btn btn-xs ${line.sampleTaken ? 'btn-primary' : 'btn-secondary'} flex items-center gap-1`}
              onClick={async () => {
                const nextVal = line.sampleTaken ? null : 1;
                await db.orderLines.update(line.id!, { sampleTaken: nextVal, updatedAt: new Date().toISOString() });
                if (setToast) setToast(nextVal ? 'Échantillon commercial noté (à réintégrer plus tard)' : 'Échantillon réintégré');
              }}
            >
              {line.sampleTaken ? '1 pc prêtée' : 'Aucun'}
            </button>
          </div>
        </div>

        {/* Statut article (Cas particuliers & Annulation / Substitution) */}
        <div className="card mb-3">
          <div className="section-title" style={{ marginTop: 0 }}>STATUT ARTICLE (CAS PARTICULIERS)</div>
          {line.status === 'active' ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm flex items-center justify-center gap-1.5"
                  style={{ flex: 1, background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 600 }}
                  onClick={() => handleStatusChange('out_of_stock')}
                  title="Stock totalement épuisé en entrepôt"
                >
                  <IconBan size={15} /> Rupture stock
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary flex items-center justify-center gap-1.5"
                  style={{ flex: 1, borderColor: 'var(--accent)', fontWeight: 600 }}
                  onClick={() => setShowSubModal(true)}
                  title="Remplacer par un produit similaire ou équivalent"
                >
                  <IconLayers size={15} /> Remplacer
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm flex items-center justify-center gap-1.5"
                  style={{ flex: 1, background: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.35)', fontWeight: 600 }}
                  onClick={() => handleStatusChange('not_found')}
                  title="Article introuvable dans les rayons pour l'instant"
                >
                  <IconSearch size={15} /> Introuvable
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary flex items-center justify-center gap-1.5"
                  style={{ flex: 1, background: 'rgba(148, 163, 184, 0.10)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontWeight: 600 }}
                  onClick={() => handleStatusChange('cancelled')}
                  title="Article annulé par le client ou le service commercial"
                >
                  <IconX size={15} /> Annulé
                </button>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-ghost flex items-center justify-center gap-1.5 text-muted mt-1"
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border)',
                }}
                onClick={handleUndo}
                title="Annuler la toute dernière saisie de comptage effectuée"
              >
                <IconUndo size={13} /> Annuler la dernière saisie
              </button>
            </div>
          ) : (
            <div>
              <div className="text-sm mb-2" style={{ color: 'var(--warning)' }}>
                Statut actuel : <strong>{
                  line.status === 'out_of_stock' ? 'RUPTURE DE STOCK' :
                  line.status === 'not_found' ? 'INTROUVABLE EN RAYON' :
                  line.status === 'cancelled' ? 'ANNULÉ PAR CLIENT' : line.status
                }</strong>
              </div>

              {line.substitutionNote && (
                <div className="mb-2 p-2 text-xs" style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border-bright)' }}>
                  <div className="font-bold text-accent mb-0.5">SUBSTITUTION ASSOCIÉE :</div>
                  <div>{line.substitutionNote}</div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary flex items-center justify-center gap-1 flex-1"
                  onClick={() => handleStatusChange('active')}
                >
                  <IconUndo size={15} /> RÉACTIVER L'ARTICLE
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary flex items-center justify-center gap-1 flex-1"
                  onClick={() => setShowSubModal(true)}
                >
                  <IconLayers size={15} /> Remplacer par un autre
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Substitution Dialog */}
        {showSubModal && (
          <div className="modal-backdrop">
            <div className="modal-card">
              <div className="modal-header">
                <h2 className="modal-title">Remplacement d'article en rupture</h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={() => setShowSubModal(false)}
                >
                  <IconX size={16} />
                </button>
              </div>

              <div className="mb-3 p-2 text-xs" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                <div className="text-muted">ARTICLE D'ORIGINE :</div>
                <div className="font-bold text-sm">{line.designation}</div>
                <div className="text-muted">Prix : {line.unitPrice != null ? `${line.unitPrice.toFixed(2)} DA` : 'Non renseigné'} • Qté : {line.orderedQty}</div>
              </div>

              <div className="mb-3">
                <label className="text-xs font-semibold text-muted mb-1 block">RECHERCHER L'ARTICLE DE REMPLACEMENT :</label>
                <input
                  type="text"
                  className="input input-sm"
                  style={{ width: '100%' }}
                  placeholder="Désignation ou référence..."
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                />
              </div>

              <div className="max-h-48 overflow-y-auto flex flex-col gap-1 mb-3" style={{ maxHeight: 180 }}>
                {(allBillLines || [])
                  .filter(l => l.id !== line.id && (!subSearch.trim() || l.designation.toLowerCase().includes(subSearch.toLowerCase()) || (l.reference && l.reference.toLowerCase().includes(subSearch.toLowerCase()))))
                  .slice(0, 15)
                  .map(l => {
                    const isPicked = selectedSubLine?.id === l.id;
                    const diff = (l.unitPrice || 0) - (line.unitPrice || 0);
                    return (
                      <div
                        key={l.id}
                        className={`p-2 rounded cursor-pointer border text-xs flex justify-between items-center ${isPicked ? 'border-accent bg-accent/10' : 'border-transparent'}`}
                        style={{ background: isPicked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)' }}
                        onClick={() => setSelectedSubLine(l)}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="font-semibold truncate">{l.designation}</div>
                          <div className="text-muted">Réf: {l.reference || '-'} • {l.unitPrice != null ? `${l.unitPrice.toFixed(2)} DA` : 'Prix libre'}</div>
                        </div>
                        <span className="font-bold font-mono ml-2" style={{ color: diff > 0 ? 'var(--danger)' : diff < 0 ? 'var(--success)' : 'inherit' }}>
                          {diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} DA
                        </span>
                      </div>
                    );
                  })}
              </div>

              {selectedSubLine && (
                <div className="flex flex-col gap-2 mb-3 p-2" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={subPaidAdvance}
                      onChange={(e) => setSubPaidAdvance(e.target.checked)}
                    />
                    <span>Le client a déjà payé à l'avance (Important)</span>
                  </label>

                  {subPaidAdvance && ((selectedSubLine.unitPrice || 0) !== (line.unitPrice || 0)) && (
                    <div className="text-xs p-2" style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 6, color: '#f59e0b' }}>
                      ⚠️ <strong>Attention paiement d'avance :</strong> L'écart financier ({(selectedSubLine.unitPrice || 0) - (line.unitPrice || 0)} DA) nécessite validation ou régularisation avec le client.
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={subNotifyClient}
                      onChange={(e) => setSubNotifyClient(e.target.checked)}
                    />
                    <span>Mentionner explicitement le remplacement sur le bon / facture</span>
                  </label>

                  <input
                    type="text"
                    className="input input-sm mt-1"
                    placeholder="Note interne (optionnel)..."
                    value={subCustomNote}
                    onChange={(e) => setSubCustomNote(e.target.value)}
                  />
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowSubModal(false)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!selectedSubLine}
                  onClick={async () => {
                    if (!selectedSubLine) return;
                    await substituteOrderLine(line.id!, selectedSubLine.id!, subPaidAdvance, subNotifyClient, subCustomNote);
                    setShowSubModal(false);
                    showToast('Substitution enregistrée avec succès', setToast);
                  }}
                >
                  Confirmer le remplacement
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Count history */}
        {events.filter(e => e.stage === stage && !e.undone).length > 0 && (
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>HISTORIQUE ({stage === 'preparation' ? 'PRÉP' : stage === 'chargement' ? 'CHARG' : 'POINTAGE'})</div>
            {events
              .filter(e => e.stage === stage)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((e) => (
                <div key={e.id} className={`flex justify-between text-sm ${e.undone ? 'text-muted' : ''}`}
                  style={{ textDecoration: e.undone ? 'line-through' : 'none', padding: '3px 0' }}>
                  <span>
                    {new Date(e.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {e.outcome && ` (${e.outcome})`}
                  </span>
                  <span className="font-bold">{e.undone ? '-' : '+'}{e.quantity}</span>
                </div>
              ))}
          </div>
        )}

        {/* Edit Qty Modal */}
        {editingQty && (
          <div className="modal-backdrop" onClick={() => setEditingQty(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">MODIFIER QUANTITÉ ATTENDUE</div>
              <div className="text-sm text-muted mb-2">
                Original: {line.originalOrderedQty} • Actuel: {line.orderedQty}
              </div>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={editQtyVal}
                onChange={(e) => setEditQtyVal(e.target.value)}
                autoFocus
              />
              <div className="section-title">RAISON</div>
              <div className="flex gap-2 flex-wrap">
                {([
                  ['official_change', 'OFFICIEL'],
                  ['bill_correction', 'CORRECTION BL'],
                  ['other', 'AUTRE'],
                ] as [ChangeReason, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    className={`btn btn-sm ${editReason === val ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setEditReason(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="confirm-actions">
                <button className="btn btn-secondary" onClick={() => setEditingQty(false)}>
                  ANNULER
                </button>
                <button className="btn btn-success" onClick={handleSaveQty}>
                  ENREGISTRER
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Field Modal */}
        {editingField && (
          <div className="modal-backdrop" onClick={() => setEditingField(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">
                MODIFIER {editingField === 'designation' ? 'DÉSIGNATION' :
                  editingField === 'reference' ? 'RÉFÉRENCE' :
                  editingField === 'ean' ? 'EAN' :
                  editingField === 'no' ? 'N°' : 'PAGE'}
              </div>
              <div className="text-sm text-muted mb-2">
                Original: {editingField === 'designation' ? line.originalDesignation :
                  editingField === 'reference' ? (line.originalReference || '—') :
                  editingField === 'ean' ? (line.originalEan || '—') :
                  editingField === 'no' ? line.originalNo :
                  (line.originalPage != null ? String(line.originalPage) : '—')}
              </div>
              <input
                className="input"
                type={editingField === 'page' ? 'number' : 'text'}
                inputMode={editingField === 'page' || editingField === 'no' ? 'numeric' : 'text'}
                value={editFieldVal}
                onChange={(e) => setEditFieldVal(e.target.value)}
                autoFocus
              />
              <div className="confirm-actions">
                <button className="btn btn-secondary" onClick={() => setEditingField(null)}>
                  ANNULER
                </button>
                <button className="btn btn-success" onClick={async () => {
                  const field = editingField;
                  const oldVal = field === 'designation' ? line.designation :
                    field === 'reference' ? line.reference :
                    field === 'ean' ? line.ean :
                    field === 'no' ? line.no : line.page;
                  const newVal = field === 'page' ? (editFieldVal ? parseInt(editFieldVal) : null) : editFieldVal;
                  await updateOrderLineField(lineId, field, oldVal as any, newVal as any, 'bill_correction');
                  setEditingField(null);
                  showToast('Champ mis à jour', setToast);
                }}>
                  ENREGISTRER
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Single product stage transfer modal */}
        <TransferStageModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          billId={billId}
          lineId={lineId}
          currentLineTitle={`N°${line.no} — ${line.designation}`}
          initialFromStage={stage === 'preparation' && stageTotals.chargement > 0 ? 'chargement' : stage}
          initialToStage={stage === 'preparation' ? 'chargement' : 'preparation'}
          onSuccess={(units, _, from, to) => {
            playSuccessChime();
            hapticTap('medium');
            const STAGE_NAMES = { preparation: 'Préparation', chargement: 'Chargement', pointage: 'Pointage' };
            showToast(`✓ ${units} pièces basculées de ${STAGE_NAMES[from]} vers ${STAGE_NAMES[to]}`, setToast);
          }}
        />
      </div>

      {/* Sticky confirm button & Next button */}
      <div className="bottom-bar flex-col gap-2" style={{ padding: '8px 12px' }}>
        {/* Glanceable Current Count Banner (Zero Scroll Needed) */}
        <div
          className="flex items-center justify-between w-full"
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: stageTotal > 0
              ? (disc.isExact ? 'rgba(16, 185, 129, 0.18)' : disc.isOver ? 'rgba(168, 85, 247, 0.18)' : 'rgba(245, 158, 11, 0.18)')
              : 'rgba(255, 255, 255, 0.06)',
            border: `1px solid ${
              stageTotal > 0
                ? (disc.isExact ? 'rgba(16, 185, 129, 0.35)' : disc.isOver ? 'rgba(168, 85, 247, 0.35)' : 'rgba(245, 158, 11, 0.35)')
                : 'rgba(255, 255, 255, 0.08)'
            }`,
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {stage === 'preparation' ? 'Préparé' : stage === 'chargement' ? 'Chargé' : 'Pointé'} :
            </span>
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: stageTotal > 0
                  ? (disc.isExact ? 'var(--success)' : disc.isOver ? 'var(--over)' : 'var(--warning)')
                  : 'var(--text-secondary)',
              }}
            >
              {stageTotal} / {line.orderedQty} pcs
            </span>
            {batchQty > 0 && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--accent)', marginLeft: 4 }}>
                → après : {afterAdding} pcs
              </span>
            )}
          </div>

          <span
            className={`badge ${disc.isExact && stageTotal > 0 ? 'badge-exact' : disc.isOver ? 'badge-over' : disc.isShort && stageTotal > 0 ? 'badge-short' : ''}`}
            style={{ fontSize: '0.68rem', fontWeight: 800, padding: '1px 7px', flexShrink: 0 }}
          >
            {stageTotal === 0 ? 'Non compté' : disc.isExact ? '✓ Complet' : disc.isOver ? `+${disc.over} Excédent` : `-${disc.remaining} Manquant`}
          </span>
        </div>

        {/* Buttons Row */}
        <div className="flex gap-2 w-full">
          <button
            className="btn btn-success btn-lg flex-1 flex items-center justify-center gap-2"
            onClick={() => handleAddCount()}
            disabled={isSubmitting || batchQty <= 0 || line.status !== 'active'}
          >
            <IconCheck size={20} />
            {isSubmitting
              ? 'ENREGISTRÉ !'
              : `AJOUTER ${batchQty > 0 ? batchQty : ''} ${stage === 'preparation' ? 'PRÉPARÉ' : stage === 'chargement' ? 'CHARGÉ' : 'POINTÉ'} & RETOURNER`}
          </button>

          {nextLine && (
            <button
              type="button"
              className="btn btn-secondary btn-lg flex items-center justify-center gap-1"
              onClick={() => {
                if (batchQty > 0 && line.status === 'active') {
                  handleAddCount(nextLine.id);
                } else {
                  nav(`/bill/${billId}/line/${nextLine.id}?stage=${stage}${fromParam ? `&from=${fromParam}` : ''}`, { replace: true });
                }
              }}
              title={batchQty > 0 ? `Enregistrer et passer à l'article suivant N°${nextLine.no}` : `Passer à l'article suivant N°${nextLine.no}`}
              style={{ padding: stage === 'pointage' ? '0 12px' : '0 16px', fontWeight: 800, flexShrink: 0 }}
            >
              <span>N°{nextLine.no}</span>
              <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>›</span>
            </button>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}


// ---- Stepper Component ----
function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        onClick={() => {
          hapticTap('light');
          onChange(Math.max(0, value - 1));
        }}
      >
        −
      </button>
      <input
        id="stepper-quantity-input"
        name="stepperQuantity"
        aria-label="Quantité colisage"
        className="stepper-value"
        type="text"
        inputMode="numeric"
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const val = e.target.value;
          setText(val);
          if (val.trim() === '') {
            onChange(0);
          } else {
            const n = parseInt(val, 10);
            if (!isNaN(n) && n >= 0) {
              onChange(n);
            }
          }
        }}
        onBlur={() => {
          setText(String(value));
        }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          fontFamily: 'var(--font-mono)',
        }}
      />
      <button
        type="button"
        className="stepper-btn"
        onClick={() => {
          hapticTap('light');
          onChange(value + 1);
        }}
      >
        +
      </button>
    </div>
  );
}

// ============================================================
// GLOBAL SCAN SCREEN
// ============================================================
function GlobalScanScreen({ setToast }: { setToast: (m: string) => void }) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const billIdParam = searchParams.get('billId');
  const stageParam = searchParams.get('stage') || 'preparation';

  const session = useActiveSession();
  const allLines = useAllSessionLines(session?.id);
  const bills = useSessionBills(session?.id);
  const allOverrides = useAllSessionOverrides(session?.id);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(true);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [matchedLines, setMatchedLines] = useState<OrderLine[]>([]);
  const [manualEntry, setManualEntry] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const scanLockRef = useRef(false);
  const [associateSearch, setAssociateSearch] = useState('');
  const [selectedLine, setSelectedLine] = useState<OrderLine | null>(null);

  // Dedicated Normal 1x Camera Management (100% eliminates 0.5x Ultra-Wide)
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    return localStorage.getItem('pointage_preferred_camera_id') || '';
  });
  const [availableCameras, setAvailableCameras] = useState<BackCameraInfo[]>([]);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [qrSyncModalPayload, setQrSyncModalPayload] = useState<QRSyncPayload | null>(null);

  const handleZoom = async (val: number) => {
    setZoomLevel(val);
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        try {
          const caps = (track as any).getCapabilities ? (track as any).getCapabilities() : {};
          if (caps.zoom) {
            const minZ = caps.zoom.min || 1;
            const maxZ = caps.zoom.max || 5;
            const targetZ = Math.min(maxZ, Math.max(minZ, val));
            await track.applyConstraints({ advanced: [{ zoom: targetZ } as any] });
          }
        } catch (e) {
          console.warn('Manual zoom toggle failed:', e);
        }
      }
    }
  };

  const handleCycleCamera = () => {
    if (availableCameras.length <= 1) {
      showToast('Capteur 2 (Principal 1×) verrouillé', setToast);
      return;
    }
    const currentIndex = availableCameras.findIndex(c => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCam = availableCameras[nextIndex];
    setSelectedCameraId(nextCam.deviceId);
    localStorage.setItem('pointage_preferred_camera_id', nextCam.deviceId);
    localStorage.setItem('pointage_camera_user_selected', 'true');
    showToast(`Capteur : ${nextCam.cleanName}`, setToast);
  };

  // Start camera
  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;
    let reader: any = null;

    const startScanning = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.ITF,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE,
        ]);
        reader = new BrowserMultiFormatReader(hints);

        // Enforce Capteur 2 exclusively as primary camera, discarding Capteur 1
        let activeDeviceId = selectedCameraId;
        if (navigator.mediaDevices?.enumerateDevices) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const backCams = getAvailableBackCameras(devices);
            if (backCams.length > 0) {
              setAvailableCameras(backCams);
            }
            const normalId = findNormalBackCamera(devices);

            // Capteur 1 ban: ensure Capteur 1 (index 0 of rear devices) is never used
            const allBackDevs = devices.filter(d => !d.kind || d.kind === 'videoinput').filter(d => {
              const lbl = (d.label || '').toLowerCase();
              return !lbl.includes('front') && !lbl.includes('avant') && !lbl.includes('selfie') && !lbl.includes('user');
            });
            const capteur1Id = allBackDevs.length >= 2 ? allBackDevs[0].deviceId : null;

            if (normalId) {
              // Always enforce normalId (Capteur 2) if activeDeviceId is missing, points to Capteur 1, or not in availableCameras
              if (!activeDeviceId || (capteur1Id && activeDeviceId === capteur1Id) || !backCams.some(c => c.deviceId === activeDeviceId)) {
                activeDeviceId = normalId;
                setSelectedCameraId(normalId);
                localStorage.setItem('pointage_preferred_camera_id', normalId);
              }
            }
          } catch (e) {
            console.warn('Initial device enumeration skipped:', e);
          }
        }

        const videoConstraints: MediaTrackConstraints = activeDeviceId
          ? {
              deviceId: { exact: activeDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            };

        if (videoRef.current && !cancelled) {
          await reader.decodeFromConstraints(
            {
              audio: false,
              video: videoConstraints,
            },
            videoRef.current,
            (result: any) => {
              if (result && !scanLockRef.current) {
                scanLockRef.current = true;
                handleScanResult(result.getText());
              }
            }
          );

          // Configure Samsung Galaxy continuous autofocus & apply current zoomLevel
          if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            streamRef.current = stream;
            const track = stream.getVideoTracks()[0];
            if (track && 'applyConstraints' in track) {
              const caps = (track as any).getCapabilities ? (track as any).getCapabilities() : {};
              const adv: any = {};
              if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
                adv.focusMode = 'continuous';
              }
              if (caps.zoom) {
                const minZoom = caps.zoom.min || 1;
                const maxZoom = caps.zoom.max || 5;
                adv.zoom = Math.min(maxZoom, Math.max(minZoom, zoomLevel));
              }
              if (Object.keys(adv).length > 0) {
                track.applyConstraints({ advanced: [adv] }).catch(() => {});
              }
            }
          }

          // Once permission is granted and stream is open, re-check camera labels to guarantee
          // we are locked onto the 1x normal camera (e.g. camera2 2 on Samsung)
          if (navigator.mediaDevices?.enumerateDevices) {
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              const backCams = getAvailableBackCameras(devices);
              if (backCams.length > 0) {
                setAvailableCameras(backCams);
              }
              const normalId = findNormalBackCamera(devices);
              const userManuallyChose = localStorage.getItem('pointage_camera_user_selected') === 'true';

              const currentCam = backCams.find(c => c.deviceId === activeDeviceId);
              const isCurrentUltraWide = currentCam && !currentCam.isLikely1x && (
                currentCam.label.toLowerCase().includes('0.5') ||
                currentCam.label.toLowerCase().includes('ultra') ||
                currentCam.label.toLowerCase().includes('camera2 0')
              );

              if (normalId && (isCurrentUltraWide || (!userManuallyChose && normalId !== activeDeviceId))) {
                console.info('[Camera] Auto-locking onto verified 1x camera sensor:', normalId);
                setSelectedCameraId(normalId);
                localStorage.setItem('pointage_preferred_camera_id', normalId);
                localStorage.removeItem('pointage_camera_user_selected');
                return; // Will re-run effect with the guaranteed 1x camera
              }
            } catch (e) {
              console.warn('Camera verification failed:', e);
            }
          }
        }
      } catch (err) {
        console.error('Scanner error:', err);
      }
    };

    startScanning();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [scanning, selectedCameraId]);

  const handleScanResult = (code: string) => {
    // Check if code is a Pointage offline QR Sync payload
    const syncPayload = parseQRSyncPayload(code);
    if (syncPayload) {
      playSuccessChime();
      setScanning(false);
      setQrSyncModalPayload(syncPayload);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      return;
    }

    setScanResult(code);
    setScanning(false);

    // Find matches (now including overrides)
    const matches = findLinesByCode(code);
    setMatchedLines(matches);
    if (matches.length > 0) {
      playSuccessChime();
    } else {
      playErrorBeep();
    }

    if (matches.length === 1) {
      setSelectedLine(matches[0]);
    } else {
      setSelectedLine(null);
    }

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };


  const findLinesByCode = (code: string): OrderLine[] => {
    const linesToSearch = billIdParam
      ? allLines.filter(l => l.billId === Number(billIdParam))
      : allLines;

    const trimmed = code.trim();
    const lower = trimmed.toLowerCase();
    const clean = lower.replace(/[^a-z0-9]/gi, '');

    // Find line IDs matched via identifier overrides
    const overrideLineIds = new Set(
      allOverrides
        .filter(o => 
          o.scannedValue.toLowerCase() === lower ||
          (clean.length >= 3 && o.scannedValue.replace(/[^a-z0-9]/gi, '').includes(clean))
        )
        .map(o => o.orderLineId)
    );

    // 1. Exact matches first
    const exactMatches = linesToSearch.filter(l =>
      l.ean?.toLowerCase() === lower ||
      l.originalEan?.toLowerCase() === lower ||
      l.reference?.toLowerCase() === lower ||
      l.originalReference?.toLowerCase() === lower ||
      l.referenceAliases.some(a => a.toLowerCase() === lower) ||
      overrideLineIds.has(l.id!)
    );

    if (exactMatches.length > 0) return exactMatches;

    // 2. Partial matches (reference substring, barcode substring, or clean alphanumeric substring)
    if (trimmed.length >= 2) {
      const partials = linesToSearch.filter(l =>
        l.reference?.toLowerCase().includes(lower) ||
        l.originalReference?.toLowerCase().includes(lower) ||
        (l.ean && (l.ean.toLowerCase().includes(lower) || (clean.length >= 3 && l.ean.replace(/[^a-z0-9]/gi, '').includes(clean)))) ||
        (l.originalEan && (l.originalEan.toLowerCase().includes(lower) || (clean.length >= 3 && l.originalEan.replace(/[^a-z0-9]/gi, '').includes(clean)))) ||
        (clean.length >= 2 && (
          (l.reference && l.reference.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(clean)) ||
          (l.originalReference && l.originalReference.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(clean))
        ))
      );
      if (partials.length > 0) return partials;
    }

    // 3. Cross-bill seller search: If searching within a specific bill, also search sibling bills of the same client
    if (billIdParam) {
      const currentBill = bills.find((b) => b.id === Number(billIdParam));
      const client = currentBill?.client?.trim();
      if (client) {
        const siblingBillIds = bills
          .filter((b) => b.client && b.client.trim().toLowerCase() === client.toLowerCase() && b.id !== Number(billIdParam))
          .map((b) => b.id!);
        const siblingLines = allLines.filter((l) => siblingBillIds.includes(l.billId));
        if (siblingLines.length > 0) {
          const siblingExact = siblingLines.filter((l) =>
            l.ean?.toLowerCase() === lower ||
            l.originalEan?.toLowerCase() === lower ||
            l.reference?.toLowerCase() === lower ||
            l.originalReference?.toLowerCase() === lower ||
            l.referenceAliases.some((a) => a.toLowerCase() === lower)
          );
          if (siblingExact.length > 0) return siblingExact;

          if (trimmed.length >= 2) {
            const siblingPartial = siblingLines.filter((l) =>
              l.reference?.toLowerCase().includes(lower) ||
              l.originalReference?.toLowerCase().includes(lower) ||
              (l.ean && (l.ean.toLowerCase().includes(lower) || (clean.length >= 3 && l.ean.replace(/[^a-z0-9]/gi, '').includes(clean)))) ||
              (l.originalEan && (l.originalEan.toLowerCase().includes(lower) || (clean.length >= 3 && l.originalEan.replace(/[^a-z0-9]/gi, '').includes(clean))))
            );
            if (siblingPartial.length > 0) return siblingPartial;
          }
        }
      }
    }

    return [];
  };

  const handleManualSearch = () => {
    const q = manualEntry.trim();
    if (!q) return;
    handleScanResult(q);
  };

  const navigateToLine = (line: OrderLine) => {
    nav(`/bill/${line.billId}/line/${line.id}?stage=${stageParam}&from=scan`);
  };

  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    nav(-1);
  };

  const resetScan = () => {
    setScanResult(null);
    setMatchedLines([]);
    setSelectedLine(null);
    setAssociateSearch('');
    scanLockRef.current = false;
    setScanning(true);
  };


  const getBillForLine = (line: OrderLine) => {
    return bills.find(b => b.id === line.billId);
  };

  const handleAssociate = async (line: OrderLine) => {
    if (!scanResult) return;
    // Determine if it looks like an EAN (mostly digits) or reference
    const fieldType: 'ean' | 'reference' = /^\d{8,14}$/.test(scanResult) ? 'ean' : 'reference';
    await addIdentifierOverride(line.billId, line.id!, scanResult, fieldType);
    await addIdentifierSuggestion(scanResult, fieldType, line);
    showToast(`${scanResult} associé à N°${line.no}`, setToast);
    navigateToLine(line);
  };

  // Lines available for manual association when code is unknown
  const candidateAssociateLines = React.useMemo(() => {
    const linesToSearch = billIdParam
      ? allLines.filter(l => l.billId === Number(billIdParam))
      : allLines;
    if (!associateSearch.trim()) return linesToSearch.slice(0, 20);
    return searchLines(linesToSearch, associateSearch, 'smart', billIdParam ? Number(billIdParam) : undefined).slice(0, 20);
  }, [allLines, billIdParam, associateSearch]);

  const targetBillId = React.useMemo(() => {
    if (billIdParam) return Number(billIdParam);
    if (qrSyncModalPayload?.billNumber) {
      const found = bills.find(b => b.billNumber === qrSyncModalPayload.billNumber);
      if (found?.id) return found.id;
    }
    return bills[0]?.id || 0;
  }, [billIdParam, qrSyncModalPayload, bills]);

  const currentCameraInfo = availableCameras.find(c => c.deviceId === selectedCameraId) ||
    availableCameras.find(c => c.isLikely1x) ||
    availableCameras[0];

  return (
    <div className="scanner-overlay">
      {scanning && (
        <>
          <video ref={videoRef} className="scanner-video" playsInline muted autoPlay />
          <div className="scanner-target" />
          <div className="scanner-controls-bar">
            {availableCameras.length > 0 && (
              <button
                type="button"
                className="scanner-cam-switch-btn"
                onClick={handleCycleCamera}
                title={availableCameras.length > 1 ? "Changer de capteur photo" : "Capteur 2 (Principal 1×) verrouillé"}
              >
                <IconRotate size={14} />
                <span>{currentCameraInfo?.cleanName || 'Capteur 2 (Principal 1×)'}</span>
              </button>
            )}
            <div className="scanner-zoom-bar">
              <button
                type="button"
                className={`scanner-zoom-btn ${zoomLevel === 1 ? 'active' : ''}`}
                onClick={() => handleZoom(1)}
              >
                1×
              </button>
              <button
                type="button"
                className={`scanner-zoom-btn ${zoomLevel === 2 ? 'active' : ''}`}
                onClick={() => handleZoom(2)}
              >
                2×
              </button>
            </div>
          </div>
        </>
      )}

      <button className="btn btn-secondary btn-icon scanner-close" onClick={handleClose} aria-label="Fermer">
        <IconX size={18} />
      </button>

      <div className="scanner-result">
        {!scanResult && (
          <div>
            <div className="flex gap-2">
              <input
                className="input"
                type="text"
                inputMode="text"
                placeholder="Saisie manuelle..."
                value={manualEntry}
                onChange={(e) => setManualEntry(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
              />
              <button className="btn btn-primary" onClick={handleManualSearch}>OK</button>
            </div>
          </div>
        )}

        {scanResult && matchedLines.length === 0 && (
          <div>
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-xs font-bold text-danger flex items-center gap-1">
                  <IconWarning size={14} /> CODE INCONNU
                </div>
                <div className="font-bold text-lg" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                  {scanResult}
                </div>
              </div>
              <button className="btn btn-xs btn-secondary flex items-center gap-1" onClick={resetScan}>
                <IconScan size={14} /> Rescanner
              </button>
            </div>

            {/* Instant 1-tap Assistive Recovery Action */}
            {billIdParam && (
              <button
                type="button"
                className="btn btn-primary btn-full flex items-center justify-center gap-2 mb-3"
                style={{ minHeight: 48, fontWeight: 700, borderRadius: 14 }}
                onClick={() => nav(`/bill/${billIdParam}/extras?stage=${stageParam}&ean=${encodeURIComponent(scanResult)}`)}
              >
                <IconPlus size={16} /> Enregistrer comme Hors-BL / Extra
              </button>
            )}

            <div className="text-xs text-secondary mb-2">
              Ou associer à un article existant :
            </div>

            <input
              className="input mb-2"
              type="text"
              placeholder="Filtrer par N°, réf, désignation..."
              value={associateSearch}
              onChange={(e) => setAssociateSearch(e.target.value)}
              autoFocus
            />

            <div style={{ maxHeight: '38vh', overflowY: 'auto' }} className="flex flex-col gap-1 mb-2">
              {candidateAssociateLines.map((line) => {
                const b = getBillForLine(line);
                return (
                  <div
                    key={line.id}
                    className="product-card"
                    onClick={() => handleAssociate(line)}
                    style={{ padding: '8px 12px', cursor: 'pointer' }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="line-no font-bold" style={{ fontSize: '0.95rem' }}>N°{line.no}</span>
                      <span className="text-xs font-semibold text-accent">{b?.billNumber || b?.client}</span>
                    </div>
                    <div className="text-sm font-semibold truncate">{line.designation}</div>
                    <div className="text-xs text-muted">
                      {line.reference ? `RÉF: ${line.reference}` : 'Sans réf.'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {scanResult && (matchedLines.length === 1 || selectedLine) && (
          <FastScanQuantityCard
            line={selectedLine || matchedLines[0]}
            bill={getBillForLine(selectedLine || matchedLines[0])}
            stage={(stageParam as Stage) || 'preparation'}
            onNextScan={resetScan}
            onOpenLine={navigateToLine}
            setToast={setToast}
          />
        )}

        {scanResult && matchedLines.length > 1 && !selectedLine && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <div>
                <div className="text-xs font-bold text-muted">{matchedLines.length} ARTICLES TROUVÉS</div>
                <div className="font-bold text-base" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                  {scanResult}
                </div>
              </div>
              <button className="btn btn-xs btn-secondary flex items-center gap-1" onClick={resetScan}>
                <IconScan size={14} /> Rescanner
              </button>
            </div>
            <div className="text-xs text-muted mb-2">
              Sélectionnez la ligne :
            </div>
            <div className="flex flex-col gap-2 mb-2" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
              {matchedLines.map((line) => {
                const b = getBillForLine(line);
                return (
                  <div
                    key={line.id}
                    className="product-card"
                    onClick={() => setSelectedLine(line)}
                    style={{ padding: '10px 14px', cursor: 'pointer', margin: 0 }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="line-no font-bold" style={{ fontSize: '1rem' }}>N°{line.no}</span>
                      <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>
                        Attendu : {line.orderedQty}
                      </span>

                    </div>
                    <div className="font-semibold text-sm truncate">{line.designation}</div>
                    <div className="text-xs text-muted">
                      {b?.client} • {line.reference ? `RÉF: ${line.reference}` : 'Sans réf.'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {qrSyncModalPayload && targetBillId > 0 && (
        <QRSyncModal
          isOpen={true}
          onClose={() => {
            setQrSyncModalPayload(null);
            resetScan();
          }}
          billId={targetBillId}
          initialPayload={qrSyncModalPayload}
          setToast={setToast}
        />
      )}
    </div>
  );
}


// ============================================================
// SUMMARY / PROBLEMS SCREEN
// ============================================================
function SummaryScreen({ setToast }: { setToast?: (m: string) => void }) {
  const nav = useNavigate();
  const { billId: billIdStr } = useParams();
  const billId = Number(billIdStr);
  const bill = useBill(billId);
  const lines = useBillLines(billId);
  const events = useBillEvents(billId);
  const extras = useBillExtras(billId);
  const audit = useBillAudit(billId);
  const containers = useBillContainers(billId);
  const entityBills = useEntityBills(bill?.client);
  const entityLines = useEntityLines(bill?.client);
  const entityEvents = useLiveQuery(
    async () => {
      if (!bill?.client) return [];
      const siblingBills = await db.bills.where('client').equals(bill.client.trim()).toArray();
      const siblingIds = siblingBills.map((b) => b.id!);
      if (siblingIds.length === 0) return [];
      return db.countEvents.where('billId').anyOf(siblingIds).toArray();
    },
    [bill?.client],
    []
  );

  const [searchParams] = useSearchParams();
  const urlStage = searchParams.get('stage') as Stage | null;
  const storedStage = (sessionStorage.getItem('pointage_stage_' + billId) as Stage | null);

  const hasLoadEvents = events.some((e) => e.stage === 'chargement' && !e.undone && e.quantity > 0);
  const hasPointEvents = events.some((e) => e.stage === 'pointage' && !e.undone && e.quantity > 0);
  const isMultiStage = hasLoadEvents || hasPointEvents;

  const defaultStage: Stage = urlStage || storedStage || (hasPointEvents ? 'pointage' : hasLoadEvents ? 'chargement' : 'preparation');
  const [stageScope, setStageScopeState] = useState<Stage>(defaultStage);

  const setStageScope = (s: Stage) => {
    setStageScopeState(s);
    sessionStorage.setItem('pointage_stage_' + billId, s);
  };

  const [summaryTab, setSummaryTab] = useState<'problems' | 'all' | 'cartons' | 'audit'>('problems');
  const [showQRSync, setShowQRSync] = useState(false);
  const [qrSyncInitialTab, setQrSyncInitialTab] = useState<'export' | 'import'>('export');
  const [exportOnlyPresent, setExportOnlyPresent] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [editingPrices, setEditingPrices] = useState<Record<number, string>>({});
  const [priceSearchQuery, setPriceSearchQuery] = useState('');
  const [exportDocFormat, setExportDocFormat] = useState<DocumentExportType>('auto');

  const eventsByLine = new Map<number, CountEvent[]>();
  for (const e of events) {
    const arr = eventsByLine.get(e.orderLineId) || [];
    arr.push(e);
    eventsByLine.set(e.orderLineId, arr);
  }

  if (!bill) return <div className="app-content"><div className="spinner" /></div>;

  // Use decoupled stage problem detection to avoid false alarms
  const problemLines = getStageProblemLines(lines, eventsByLine, stageScope);
  const displayLines = summaryTab === 'all' ? lines : problemLines;

  // Summary stats
  const cancelledLines = lines.filter(l => l.status === 'cancelled').length;
  const notFoundLines = lines.filter(l => l.status === 'not_found').length;
  const outOfStockLines = lines.filter(l => l.status === 'out_of_stock').length;

  const prep = calcBillProgress(lines, eventsByLine, 'preparation');
  const load = calcBillProgress(lines, eventsByLine, 'chargement');

  // Visual Quality Distribution metrics
  const conformeCount = lines.filter(l => {
    if (l.status !== 'active') return false;
    const evts = eventsByLine.get(l.id!) || [];
    const stageTotal = sumStageEvents(evts, stageScope);
    const disc = calcDiscrepancy(l, stageTotal);
    return disc.isExact && stageTotal > 0;
  }).length;

  const shortCount = lines.filter(l => {
    if (l.status !== 'active') return false;
    const evts = eventsByLine.get(l.id!) || [];
    const stageTotal = sumStageEvents(evts, stageScope);
    const disc = calcDiscrepancy(l, stageTotal);
    return disc.isShort && stageTotal > 0;
  }).length;

  const overCount = lines.filter(l => {
    if (l.status !== 'active') return false;
    const evts = eventsByLine.get(l.id!) || [];
    const stageTotal = sumStageEvents(evts, stageScope);
    const disc = calcDiscrepancy(l, stageTotal);
    return disc.isOver;
  }).length;

  const problemStatusCount = outOfStockLines + notFoundLines + cancelledLines;

  // WhatsApp Discrepancy Report Generator
  const generateReport = () => {
    const stageProblems = getStageProblemLines(lines, eventsByLine, stageScope);

    const nowStr = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    let text = `*RAPPORT D'EXPÉDITION / ÉCARTS - POINTAGE*\n`;
    text += `Date : ${nowStr}\n`;
    text += `Client : *${bill.client}*\n`;
    text += `N° Bon : *${bill.billNumber}*\n`;
    text += `------------------------------------\n`;
    text += `Avancement Préparation : ${prep.done}/${prep.total} (${prep.percent}%)\n`;
    if (load.done > 0) text += `Chargement : ${load.done}/${load.total} (${load.percent}%)\n`;
    text += `------------------------------------\n\n`;

    if (stageProblems.length === 0) {
      text += `*Aucun écart signalé :* Toutes les lignes préparées sont conformes.\n\n`;
    } else {
      text += `*ANOMALIES & ÉCARTS DÉTECTÉS (${stageProblems.length}) :*\n\n`;
      stageProblems.forEach((p, idx) => {
        const evts = eventsByLine.get(p.id!) || [];
        const prepQty = sumStageEvents(evts, 'preparation');
        text += `${idx + 1}. *N°${p.no}* - ${p.designation}\n`;
        if (p.reference) text += `   Réf: ${p.reference}\n`;
        if (p.status === 'out_of_stock') {
          text += `   [RUPTURE DÉFINITIVE EN ENTREPÔT] (Attendu: ${p.orderedQty})\n`;
        } else if (p.status === 'not_found') {
          text += `   [ARTICLE INTROUVABLE] (Attendu: ${p.orderedQty})\n`;
        } else if (p.status === 'cancelled') {
          text += `   [ARTICLE ANNULÉ]\n`;
        } else if (prepQty < p.orderedQty) {
          text += `   [MANQUANT] : Préparé ${prepQty} / ${p.orderedQty} (Reliquat: -${p.orderedQty - prepQty})\n`;
        } else if (prepQty > p.orderedQty) {
          text += `   [EXCÉDENT] : Préparé ${prepQty} / ${p.orderedQty} (+${prepQty - p.orderedQty})\n`;
        }
        if (p.orderedQty !== p.originalOrderedQty) {
          text += `   [MODIFIÉ] : Initialement ${p.originalOrderedQty}, ramené à ${p.orderedQty}\n`;
        }

        if (stageScope === 'pointage') {
          const pointageEvts = evts.filter(e => e.stage === 'pointage' && !e.undone);
          const refusedOrDamaged = pointageEvts.filter(e => e.outcome === 'damaged_refused' || e.outcome === 'refused' || e.outcome === 'damaged_accepted');
          refusedOrDamaged.forEach(re => {
            const outcomeLabel = re.outcome === 'damaged_refused' ? 'Avarié Refusé' : re.outcome === 'damaged_accepted' ? 'Avarié Accepté' : 'Refusé';
            text += `   [${outcomeLabel}] : Qté ${re.quantity}${re.note ? ` • Motif: "${re.note}"` : ''}\n`;
          });
        }
        text += `\n`;
      });
    }


    if (extras.length > 0) {
      text += `*ARTICLES HORS-BON AJOUTÉS (${extras.length}) :*\n`;
      extras.forEach((ex) => {
        text += `• ${ex.designation || ex.scannedEan || 'Extra'} : Qté ${ex.quantity}\n`;
      });
      text += `\n`;
    }

    if (containers.length > 0) {
      text += `*RÉPARTITION DES COLIS :*\n`;
      containers.forEach((c) => {
        const eventsInCarton = (entityEvents || events).filter(
          (e) => e.stage === 'preparation' && !e.undone && e.containerId === c.id
        );
        const count = eventsInCarton.reduce((s, e) => s + e.quantity, 0);
        if (count === 0) return;

        const uniqueBillIds = Array.from(new Set(eventsInCarton.map((e) => e.billId)));
        if (uniqueBillIds.length > 1) {
          const breakdownStr = uniqueBillIds
            .map((bId) => {
              const bNum = entityBills?.find((b) => b.id === bId)?.billNumber || `BL #${bId}`;
              const bCount = eventsInCarton.filter((e) => e.billId === bId).reduce((s, e) => s + e.quantity, 0);
              return `${bCount} du ${bNum}`;
            })
            .join(', ');
          text += `• ${c.label} : ${count} unités (${breakdownStr})\n`;
        } else {
          text += `• ${c.label} : ${count} unités\n`;
        }
      });
      text += `\n`;
    }

    text += `_Transmis depuis l'application Pointage._`;
    return text;
  };

  const whatsappNumber = localStorage.getItem('pointage_whatsapp_number') || '+213556264976';
  const reportEmail = localStorage.getItem('pointage_report_email') || '';

  const handleCopyReport = () => {
    const report = generateReport();
    navigator.clipboard.writeText(report);
    if (setToast) setToast('Rapport copié dans le presse-papier');
  };

  const finalBillRows = buildFinalBillRows(lines, eventsByLine, {
    stage: stageScope,
    onlyPresent: exportOnlyPresent,
  });
  const finalBillData = compileFinalBillData(bill, finalBillRows);
  const resolvedDocType = resolveDocumentType(finalBillData, exportDocFormat);

  const handleDownloadFinalExcel = () => {
    try {
      downloadFinalBillExcel(finalBillData, undefined, exportDocFormat);
      const label =
        resolvedDocType === 'invoice'
          ? 'Facture'
          : resolvedDocType === 'bl_official'
          ? 'Bon de Livraison'
          : resolvedDocType === 'bl_workshop'
          ? 'Bordereau Atelier'
          : 'Bon de Commande';
      if (setToast) setToast(`${label} Excel (.xlsx) téléchargé`);
    } catch (err: any) {
      if (setToast) setToast(`Erreur: ${err.message}`);
    }
  };

  const handleShareFinalWhatsApp = async () => {
    try {
      await shareFinalBillViaWhatsAppOrFile(finalBillData, whatsappNumber, exportDocFormat);
    } catch (err: any) {
      if (setToast) setToast(`Erreur: ${err.message}`);
    }
  };

  const handleSendFinalEmail = () => {
    const bodyText = formatFinalBillWhatsAppMessage(finalBillData, exportDocFormat);
    const label =
      resolvedDocType === 'invoice'
        ? 'Facture Finale'
        : resolvedDocType === 'bl_official'
        ? 'Bon de Livraison'
        : resolvedDocType === 'bl_workshop'
        ? 'Bordereau Atelier'
        : 'Bon de Commande';
    const subject = encodeURIComponent(`Pointage Surface — ${label} ${bill.billNumber} (${bill.client})`);
    const body = encodeURIComponent(bodyText);
    window.location.href = `mailto:${reportEmail}?subject=${subject}&body=${body}`;
  };

  const handleSavePrice = async (lineId: number, rawVal: string) => {
    const trimmed = (rawVal || '').trim().replace(',', '.');
    if (trimmed === '') {
      await db.orderLines.update(lineId, { unitPrice: null, updatedAt: new Date().toISOString() });
      if (setToast) setToast('Prix effacé');
      return;
    }
    const parsed = parseFloat(trimmed);
    const val = !isNaN(parsed) && parsed >= 0 ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
    await db.orderLines.update(lineId, { unitPrice: val, updatedAt: new Date().toISOString() });
    if (setToast) setToast(val != null ? `Prix enregistré: ${val} DA` : 'Prix invalide (effacé)');
  };

  return (
    <>
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => nav(`/bill/${billId}?stage=${stageScope}`)}
            aria-label="Retour"
          >
            <IconArrowLeft size={18} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Récapitulatif
            </h1>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }} className="truncate">
              {bill.client} • {bill.billNumber}
            </div>
          </div>
        </div>
        <div className="header-meta">
          <AudioMuteButton className="header-icon-btn" />
          <button
            type="button"
            className="header-icon-btn"
            onClick={handleCopyReport}
            title="Copier le rapport"
            aria-label="Copier le rapport"
          >
            <IconClipboard size={18} />
          </button>
        </div>
      </header>

      <div className="app-content">
        {/* Apple-Style Glanceable Donut KPI Card */}
        <ConformityDonutChart
          totalLines={lines.length}
          conformeCount={conformeCount}
          shortCount={shortCount}
          overCount={overCount}
          problemCount={problemStatusCount}
          actualPieces={finalBillData.totalActualQty}
          orderedPieces={finalBillData.totalOrderedQty}
          totalAmountTtc={finalBillData.totalAmountTtc}
          isPriced={finalBillData.isPriced}
          billStatus={bill.status}
          onToggleStatus={async () => {
            const nextStatus = bill.status === 'completed' ? 'active' : 'completed';
            await db.bills.update(bill.id!, { status: nextStatus });
            if (setToast) setToast(nextStatus === 'completed' ? 'Bon archivé' : 'Bon réouvert');
          }}
        />

        {/* Transmission & Export Hub (Apple Pill Buttons) */}
        <div className="transmission-card">
          <div className="transmission-header">
            <span className="transmission-title">
              <IconFileSpreadsheet size={15} style={{ color: 'var(--accent)' }} /> Transmettre & Exporter
            </span>
            <button
              type="button"
              className="btn btn-xs btn-ghost flex items-center gap-1"
              style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '2px 8px' }}
              onClick={() => {
                setQrSyncInitialTab('export');
                setShowQRSync(true);
              }}
              title="Synchronisation QR Multi-Téléphones"
            >
              <IconLayers size={13} /> Sync QR
            </button>
          </div>

          {/* Document Replica Format Selector */}
          <div className="mb-3">
            <div className="text-xs font-semibold text-muted mb-1.5 flex items-center justify-between">
              <span>Format du document :</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '1px 7px',
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  borderRadius: 4,
                  letterSpacing: '0.02em',
                }}
              >
                {resolvedDocType === 'invoice'
                  ? '💰 Facture SAJ'
                  : resolvedDocType === 'bl_official'
                  ? '📋 BL Officiel (EAN)'
                  : resolvedDocType === 'bl_workshop'
                  ? '📦 Bordereau Atelier'
                  : '🛒 Bon Commande'}
              </span>
            </div>
            <div className="seg-control-fit" style={{ fontSize: '0.74rem' }}>
              <button
                type="button"
                className={`seg-btn ${exportDocFormat === 'auto' ? 'active' : ''}`}
                onClick={() => setExportDocFormat('auto')}
                title="Détection automatique selon le bon"
              >
                Auto
              </button>
              <button
                type="button"
                className={`seg-btn ${exportDocFormat === 'invoice' ? 'active' : ''}`}
                onClick={() => setExportDocFormat('invoice')}
                title="Facture Commerciale (SAJ / ShowOr)"
              >
                Facture
              </button>
              <button
                type="button"
                className={`seg-btn ${exportDocFormat === 'bl_official' ? 'active' : ''}`}
                onClick={() => setExportDocFormat('bl_official')}
                title="Bon de Livraison Officiel avec EAN (SBM)"
              >
                BL Officiel
              </button>
              <button
                type="button"
                className={`seg-btn ${exportDocFormat === 'bl_workshop' ? 'active' : ''}`}
                onClick={() => setExportDocFormat('bl_workshop')}
                title="Bordereau Préparation Atelier (LOT / Packages)"
              >
                Atelier
              </button>
              <button
                type="button"
                className={`seg-btn ${exportDocFormat === 'bon_commande' ? 'active' : ''}`}
                onClick={() => setExportDocFormat('bon_commande')}
                title="Bon de Commande Standard (BC)"
              >
                BC
              </button>
            </div>
          </div>

          {/* Primary Action Buttons (Side by Side) */}
          <div className="transmission-primary-grid">
            <button
              type="button"
              className="btn-pill-primary"
              onClick={handleDownloadFinalExcel}
              title="Télécharger la facture 1:1 conforme au bon papier (.xlsx)"
            >
              <IconFileSpreadsheet size={18} /> Excel (.xlsx)
            </button>

            <button
              type="button"
              className="btn-pill-whatsapp"
              onClick={handleShareFinalWhatsApp}
              title="Transmettre le rapport et la facture par WhatsApp"
            >
              <IconSend size={18} /> WhatsApp
            </button>
          </div>

          {/* Secondary Quick Actions */}
          <div className="secondary-actions-row">
            <button
              type="button"
              className="btn-pill-glass"
              onClick={() => setShowPriceModal(true)}
              title="Consulter ou renseigner les prix unitaires"
            >
              <IconTable size={14} /> Prix
            </button>

            <button
              type="button"
              className="btn-pill-glass"
              onClick={handleSendFinalEmail}
              title="Envoyer par email"
            >
              <IconMail size={14} /> Email
            </button>

            <button
              type="button"
              className="btn-pill-glass"
              onClick={handleCopyReport}
              title="Copier le texte du rapport"
            >
              <IconClipboard size={14} /> Copier
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-secondary mt-3 pt-2" style={{ borderTop: 'var(--glass-border-subtle)' }}>
            <input
              type="checkbox"
              checked={exportOnlyPresent}
              onChange={(e) => setExportOnlyPresent(e.target.checked)}
              style={{ borderRadius: 4, accentColor: 'var(--accent)' }}
            />
            <span>Exclure les articles non reçus (Qté = 0)</span>
          </label>
        </div>

        {extras.length > 0 && (
          <div className="card mb-3">
            <div className="section-title" style={{ marginTop: 0 }}>EXTRAS ({extras.length})</div>
            {extras.map((ex) => (
              <div key={ex.id} className="text-sm mb-2">
                <span className="font-bold">{ex.designation || ex.scannedEan || ex.reference || 'Extra'}</span>
                <span className="text-muted"> — Qté: {ex.quantity}</span>
              </div>
            ))}
          </div>
        )}

        {/* View Tabs — Segmented Apple Control (100% Fit, Zero Overflow) */}
        <div className="seg-control-fit mb-3">
          <button
            type="button"
            className={`seg-btn ${summaryTab === 'problems' ? 'active' : ''}`}
            onClick={() => setSummaryTab('problems')}
          >
            Écarts ({problemLines.length})
          </button>
          <button
            type="button"
            className={`seg-btn ${summaryTab === 'all' ? 'active' : ''}`}
            onClick={() => setSummaryTab('all')}
          >
            Tous ({lines.length})
          </button>
          <button
            type="button"
            className={`seg-btn ${summaryTab === 'cartons' ? 'active' : ''}`}
            onClick={() => setSummaryTab('cartons')}
          >
            Colis ({containers.length})
          </button>
          <button
            type="button"
            className={`seg-btn ${summaryTab === 'audit' ? 'active' : ''}`}
            onClick={() => setSummaryTab('audit')}
          >
            Audit
          </button>
        </div>

        {/* Stage Scope Selector for Problem Detection (subtle inline pill filter) */}
        {summaryTab === 'problems' && isMultiStage && (
          <div className="flex items-center justify-between px-2 py-1.5 mb-2.5 text-xs text-muted" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <span className="font-semibold">Étape analysée :</span>
            <div className="flex gap-1">
              <button
                type="button"
                className={`btn btn-xs ${stageScope === 'preparation' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                onClick={() => setStageScope('preparation')}
              >
                Préparation ({getStageProblemLines(lines, eventsByLine, 'preparation').length})
              </button>
              {hasLoadEvents && (
                <button
                  type="button"
                  className={`btn btn-xs ${stageScope === 'chargement' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                  onClick={() => setStageScope('chargement')}
                >
                  Chargement ({getStageProblemLines(lines, eventsByLine, 'chargement').length})
                </button>
              )}
              {(hasPointEvents || stageScope === 'pointage') && (
                <button
                  type="button"
                  className={`btn btn-xs ${stageScope === 'pointage' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                  onClick={() => setStageScope('pointage')}
                >
                  Pointage ({getStageProblemLines(lines, eventsByLine, 'pointage').length})
                </button>
              )}
            </div>
          </div>
        )}


        {/* PAR CARTON View */}
        {summaryTab === 'cartons' && (() => {
          const allRelevantLines = (entityLines && entityLines.length > 0) ? entityLines : lines;
          const allRelevantEvents = (entityEvents && entityEvents.length > 0) ? entityEvents : events;
          const allEventsByLine = new Map<number, CountEvent[]>();
          for (const e of allRelevantEvents) {
            const arr = allEventsByLine.get(e.orderLineId) || [];
            arr.push(e);
            allEventsByLine.set(e.orderLineId, arr);
          }
          const billMap = new Map<number, Bill>();
          if (entityBills) {
            for (const b of entityBills) {
              if (b.id != null) billMap.set(b.id, b);
            }
          }

          return (
            <div>
              {containers.map((c) => {
                const linesInCarton = allRelevantLines
                  .map(line => {
                    const evts = allEventsByLine.get(line.id!) || [];
                    const qty = evts
                      .filter(e => e.stage === 'preparation' && !e.undone && e.containerId === c.id)
                      .reduce((s, e) => s + e.quantity, 0);
                    return { line, qty };
                  })
                  .filter(item => item.qty > 0);

                const totalUnits = linesInCarton.reduce((s, item) => s + item.qty, 0);

                return (
                  <div key={c.id} className="card mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-bold flex items-center gap-2">
                        <span className="container-tag selected" style={{ fontSize: '0.9rem' }}>{c.label}</span>
                        <span className="text-xs text-muted">
                          {c.type === 'chouala' ? 'Sac de conditionnement' : c.type === 'loose' ? 'Hors Colis (Vrac)' : c.type === 'large' ? 'Grand Colis' : 'Carton Standard'}
                        </span>
                      </div>
                      <span className="badge badge-active font-mono">{totalUnits} unités</span>
                    </div>
                    {linesInCarton.length === 0 ? (
                      <div className="text-xs text-muted py-1">{c.type === 'chouala' ? 'Sac vide' : 'Carton vide'}</div>
                    ) : (
                      linesInCarton.map(({ line, qty }) => {
                        const isSibling = line.billId !== billId;
                        const lineBill = isSibling ? billMap.get(line.billId) : bill;
                        return (
                          <div key={line.id} className="flex justify-between items-center py-1 border-t text-sm">
                            <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-accent">N°{line.no}</span>
                                {isSibling && (
                                  <span
                                    className="badge badge-secondary font-mono"
                                    style={{ fontSize: '0.7rem', padding: '1px 5px' }}
                                    title={`Cet article provient du bon ${lineBill?.billNumber || line.billId}`}
                                  >
                                    BL {lineBill?.billNumber || `#${line.billId}`}
                                  </span>
                                )}
                                {line.reference && <span className="text-xs text-muted">• REF: {line.reference}</span>}
                              </div>
                              <div className="truncate text-xs">{line.designation}</div>
                            </div>
                            <span className="font-bold text-base font-mono">{qty}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}

              {/* Unassigned / Hors carton */}
              {(() => {
                const linesOutside = lines
                  .map(line => {
                    const evts = eventsByLine.get(line.id!) || [];
                    const qty = evts
                      .filter(e => e.stage === 'preparation' && !e.undone && !e.containerId)
                      .reduce((s, e) => s + e.quantity, 0);
                    return { line, qty };
                  })
                  .filter(item => item.qty > 0);

                if (linesOutside.length === 0) return null;
                const totalUnits = linesOutside.reduce((s, item) => s + item.qty, 0);

                return (
                  <div className="card mb-3" style={{ borderColor: 'var(--warning-border)' }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="container-tag" style={{ background: 'var(--bg-surface)' }}>HORS CARTON</span>

                      <span className="badge badge-warning font-mono">{totalUnits} unités</span>
                    </div>
                    {linesOutside.map(({ line, qty }) => (
                      <div key={line.id} className="flex justify-between items-center py-1 border-t text-sm">
                        <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
                          <span className="font-bold text-warning">N°{line.no}</span>
                          {line.reference && <span className="text-xs text-muted"> • REF: {line.reference}</span>}
                          <div className="truncate text-xs">{line.designation}</div>
                        </div>
                        <span className="font-bold text-base font-mono">{qty}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* Calm Apple Glass Zero State for 0 Problems */}
        {summaryTab === 'problems' && problemLines.length === 0 && (
          <div className="calm-zero-state mb-3">
            <div className="calm-zero-icon">
              <IconCheck size={26} />
            </div>
            <div className="calm-zero-title">
              Aucun écart détecté
            </div>
            <div className="calm-zero-desc">
              Toutes les lignes comptées pour l'étape <strong>{stageScope === 'pointage' ? 'Pointage' : stageScope === 'chargement' ? 'Chargement' : 'Préparation'}</strong> correspondent au bon source.
            </div>
          </div>
        )}

        {/* Lines View (Problems or All) */}
        {(summaryTab === 'problems' || summaryTab === 'all') && displayLines.map((line) => {
          const evts = eventsByLine.get(line.id!) || [];
          const prepTotal = sumStageEvents(evts, 'preparation');
          const loadTotal = sumStageEvents(evts, 'chargement');
          const pointTotal = sumStageEvents(evts, 'pointage');
          const pointTotals = getStageTotals(evts, 'pointage');
          const isModified = line.orderedQty !== line.originalOrderedQty;

          // Reference quantity for the active stage
          const targetQty = stageScope === 'pointage'
            ? (hasLoadEvents ? loadTotal : (prepTotal > 0 ? prepTotal : line.orderedQty))
            : stageScope === 'chargement'
            ? (prepTotal > 0 ? prepTotal : line.orderedQty)
            : line.orderedQty;
          const activeStageCount = stageScope === 'pointage' ? pointTotal : stageScope === 'chargement' ? loadTotal : prepTotal;
          const diff = activeStageCount - targetQty;

          return (
            <div key={line.id} className="card" style={{ padding: 10, marginBottom: 8 }}>
              <div className="flex items-center gap-2">
                <span className="line-no" style={{ fontSize: '1rem' }}>N°{line.no}</span>
                {line.page != null && <span className="text-xs text-muted">P{line.page}</span>}
                {line.status !== 'active' && (
                  <span className={`badge badge-${line.status === 'out_of_stock' ? 'out-of-stock' : line.status === 'cancelled' ? 'cancelled' : 'not-found'}`}>
                    {line.status === 'out_of_stock' ? 'RUPTURE' : line.status === 'cancelled' ? 'ANNULÉ' : 'INTROUVABLE'}
                  </span>
                )}
                {isModified && <span className="badge badge-modified">MODIFIÉ</span>}
              </div>
              <div className="text-sm mt-1">{line.reference && `REF: ${line.reference} • `}{line.designation}</div>

              {/* Quantities breakdown */}
              <div className="flex items-center gap-3 mt-2 text-xs flex-wrap font-mono">
                {isModified && <div><span className="text-muted font-sans">Orig: </span><strong>{line.originalOrderedQty}</strong></div>}
                <div><span className="text-muted font-sans">Attendu: </span><strong className="text-primary">{line.orderedQty}</strong></div>
                {(prepTotal > 0 || stageScope === 'preparation') && (
                  <div><span className="text-muted font-sans">Préparé: </span><strong>{prepTotal}</strong></div>
                )}
                {(hasLoadEvents || (stageScope === 'chargement' && loadTotal > 0)) && (
                  <div><span className="text-muted font-sans">Chargé: </span><strong>{loadTotal}</strong></div>
                )}
                {(hasPointEvents || (stageScope === 'pointage' && pointTotal > 0)) && (
                  <div><span className="text-muted font-sans">Pointé: </span><strong style={{ color: diff === 0 && pointTotal > 0 ? 'var(--success)' : undefined }}>{pointTotal}</strong></div>
                )}

                {/* Status chip */}
                {diff === 0 && activeStageCount > 0 && (
                  <span className="badge badge-exact text-xs ml-auto font-sans"><IconCheck size={11} /> Conforme</span>
                )}
                {diff < 0 && (
                  <span className="badge badge-short text-xs ml-auto font-sans">{diff} manquant{Math.abs(diff) > 1 ? 's' : ''}</span>
                )}
                {diff > 0 && (
                  <span className="badge badge-over text-xs ml-auto font-sans">+{diff} excédent</span>
                )}
              </div>

              {pointTotal > 0 && (pointTotals.byOutcome.damaged_accepted > 0 || pointTotals.byOutcome.damaged_refused > 0 || pointTotals.byOutcome.refused > 0) && (
                <div className="flex gap-2 mt-1.5 text-xs flex-wrap">
                  <span className="flex items-center gap-1"><IconCheck size={12} /> Conforme: {pointTotals.byOutcome.accepted}</span>
                  {pointTotals.byOutcome.damaged_accepted > 0 && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--warning)' }}><IconWarning size={12} /> Avarié Acc: {pointTotals.byOutcome.damaged_accepted}</span>
                  )}
                  {pointTotals.byOutcome.damaged_refused > 0 && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--danger)' }}><IconX size={12} /> Avarié Réf: {pointTotals.byOutcome.damaged_refused}</span>
                  )}
                  {pointTotals.byOutcome.refused > 0 && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--danger)' }}><IconBan size={12} /> Refusé: {pointTotals.byOutcome.refused}</span>
                  )}
                </div>
              )}

              {/* Transport breakdown */}
              {evts.filter(e => e.stage === 'preparation' && !e.undone && e.containerId).length > 0 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {containers.map(c => {
                    const qty = evts
                      .filter(e => e.stage === 'preparation' && !e.undone && e.containerId === c.id)
                      .reduce((s, e) => s + e.quantity, 0);
                    if (!qty) return null;
                    return <span key={c.id} className="container-tag">{c.label}: {qty}</span>;
                  })}
                </div>
              )}
            </div>
          );
        })}

        {summaryTab === 'audit' && (
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>JOURNAL D'AUDIT</div>
            {audit.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((evt) => (
              <div key={evt.id} className="text-sm mb-2" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                <div className="flex justify-between">
                  <span className="font-semibold">{formatAuditType(evt.type)}</span>
                  <span className="text-xs text-muted">
                    {new Date(evt.timestamp).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                {evt.oldValue && <div className="text-xs text-muted">Ancien: {evt.oldValue}</div>}
                {evt.newValue && <div className="text-xs">Nouveau: {evt.newValue}</div>}
                {evt.reason && <div className="text-xs text-muted">Raison: {evt.reason}</div>}
              </div>
            ))}
            {audit.length === 0 && <div className="text-sm text-muted">Aucun événement</div>}
          </div>
        )}
      </div>

      <QRSyncModal
        isOpen={showQRSync}
        onClose={() => setShowQRSync(false)}
        billId={billId}
        initialTab={qrSyncInitialTab}
        setToast={setToast}
      />

      {showPriceModal && (
        <div className="modal-backdrop" onClick={() => setShowPriceModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <div className="modal-title flex items-center gap-2" style={{ margin: 0, fontSize: '1rem', color: '#0284c7' }}>
                <IconTable size={18} /> PRIX UNITAIRES & VALORISATION
              </div>
              <button
                type="button"
                className="btn btn-xs btn-secondary btn-icon"
                onClick={() => setShowPriceModal(false)}
                aria-label="Fermer"
              >
                <IconX size={14} />
              </button>
            </div>

            {/* Search bar */}
            <div className="mb-2">
              <input
                type="text"
                className="input input-sm w-full"
                placeholder="Rechercher un article (désignation, référence, N°)..."
                value={priceSearchQuery}
                onChange={(e) => setPriceSearchQuery(e.target.value)}
              />
            </div>

            {/* Total summary bar */}
            <div
              className="card mb-3 py-2 px-3 flex justify-between items-center"
              style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.2)' }}
            >
              <div>
                <div className="text-xs text-secondary font-medium">Articles chiffrés</div>
                <div className="text-sm font-bold">
                  {lines.filter((l) => l.unitPrice != null && l.unitPrice > 0).length} / {lines.length} lignes
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-secondary font-medium">Montant Total Pointé</div>
                <div className="text-sm font-bold" style={{ color: '#0284c7' }}>
                  {finalBillData.totalAmountTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DA
                </div>
              </div>
            </div>

            {/* Line list */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }} className="space-y-2">
              {lines
                .filter((l) => {
                  if (!priceSearchQuery) return true;
                  const q = priceSearchQuery.toLowerCase().trim();
                  return (
                    l.designation.toLowerCase().includes(q) ||
                    (l.reference && l.reference.toLowerCase().includes(q)) ||
                    (l.no && l.no.includes(q))
                  );
                })
                .map((l) => {
                const evts = eventsByLine.get(l.id!) || [];
                const actualQty = evts
                  .filter((e) => !e.undone && e.stage === stageScope)
                  .reduce((sum, e) => sum + e.quantity, 0);

                const currentVal =
                  editingPrices[l.id!] !== undefined
                    ? editingPrices[l.id!]
                    : l.unitPrice != null
                    ? String(l.unitPrice)
                    : '';

                const numVal = parseFloat(currentVal.replace(',', '.'));
                const lineTotal = !isNaN(numVal) && numVal > 0 ? numVal * actualQty : 0;

                return (
                  <div
                    key={l.id}
                    className="card p-2 text-xs flex justify-between items-center gap-2"
                    style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="font-semibold truncate" title={l.designation}>
                        {l.designation}
                      </div>
                      <div className="text-secondary flex gap-2 mt-0.5" style={{ fontSize: '0.72rem' }}>
                        <span>Réf: {l.reference || '-'}</span>
                        <span>Col: {l.colisage || 1}</span>
                        <span
                          className="font-medium"
                          style={{ color: actualQty < l.orderedQty ? 'var(--warning)' : 'inherit' }}
                        >
                          Pointé: {actualQty} / {l.orderedQty}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                      <div style={{ width: 85 }}>
                        <div className="text-secondary mb-0.5 text-right" style={{ fontSize: '0.65rem' }}>
                          P.U. (DA)
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="input input-sm text-right font-mono"
                          style={{ padding: '2px 6px', height: 28, fontSize: '0.8rem' }}
                          placeholder="0.00"
                          value={currentVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingPrices((prev) => ({ ...prev, [l.id!]: val }));
                          }}
                          onBlur={(e) => {
                            handleSavePrice(l.id!, e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </div>
                      <div style={{ width: 75, textAlign: 'right' }}>
                        <div className="text-secondary mb-0.5" style={{ fontSize: '0.65rem' }}>
                          Total
                        </div>
                        <div
                          className="font-bold text-xs truncate font-mono"
                          style={{ color: lineTotal > 0 ? '#10b981' : 'var(--muted)' }}
                        >
                          {lineTotal > 0 ? `${lineTotal.toFixed(2)}` : '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal actions */}
            <div
              className="flex justify-between items-center gap-2 mt-3 pt-2"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setShowPriceModal(false)}
              >
                Fermer
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary flex items-center gap-1"
                onClick={() => {
                  setShowPriceModal(false);
                  handleDownloadFinalExcel();
                }}
              >
                <IconFileSpreadsheet size={15} /> Exporter Excel (.xlsx)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatAuditType(type: string): string {
  const map: Record<string, string> = {
    quantity_changed: 'Quantité modifiée',
    reference_corrected: 'Référence corrigée',
    ean_corrected: 'EAN corrigé',
    designation_corrected: 'Désignation corrigée',
    line_added: 'Ligne ajoutée',
    line_cancelled: 'Ligne annulée',
    line_not_found: 'Ligne introuvable',
    line_reactivated: 'Ligne réactivée',
    identifier_override_added: 'Identifiant corrigé',
    bill_reimported: 'BL réimporté',
    count_event_undone: 'Comptage annulé',
    line_removed_by_revision: 'Supprimé par révision',
    status_changed: 'Statut modifié',
    no_corrected: 'N° corrigé',
    page_corrected: 'Page corrigée',
  };
  return map[type] || type;
}

// ============================================================
// EXTRAS SCREEN
// ============================================================
function ExtrasScreen({ setToast }: { setToast: (m: string) => void }) {
  const nav = useNavigate();
  const { billId: billIdStr } = useParams();
  const [searchParams] = useSearchParams();
  const billId = Number(billIdStr);
  const stageParam = (searchParams.get('stage') || 'preparation') as Stage;
  const eanParam = searchParams.get('ean') || '';

  const session = useActiveSession();
  const extras = useBillExtras(billId);

  const [ean, setEan] = useState(eanParam);
  const [ref, setRef] = useState('');
  const [designation, setDesignation] = useState('');
  const [qty, setQty] = useState('1');

  const handleAdd = async () => {
    if (!session?.id) return;
    const quantity = parseInt(qty) || 1;
    await addExtra(session.id, billId, stageParam, {
      scannedEan: ean || undefined,
      reference: ref || undefined,
      designation: designation || undefined,
      quantity,
    });
    showToast('Extra enregistré', setToast);
    setEan('');
    setRef('');
    setDesignation('');
    setQty('1');
  };

  return (
    <>
      <header className="app-header">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Retour"><IconArrowLeft size={18} /></button>
        <h1>PRODUIT EXTRA</h1>
      </header>

      <div className="app-content">
        <div className="card">
          <input className="input mb-2" placeholder="EAN" value={ean} onChange={e => setEan(e.target.value)} />
          <input className="input mb-2" placeholder="Référence" value={ref} onChange={e => setRef(e.target.value)} />
          <input className="input mb-2" placeholder="Désignation" value={designation} onChange={e => setDesignation(e.target.value)} />
          <input className="input mb-2" type="number" inputMode="numeric" placeholder="Quantité" value={qty} onChange={e => setQty(e.target.value)} />
          <button className="btn btn-success btn-full btn-lg flex items-center justify-center gap-2" onClick={handleAdd}>
            <IconCheck size={18} /> ENREGISTRER EXTRA
          </button>
        </div>

        {extras.length > 0 && (
          <div className="card mt-3">
            <div className="section-title" style={{ marginTop: 0 }}>EXTRAS ENREGISTRÉS</div>
            {extras.map(ex => (
              <div key={ex.id} className="text-sm mb-2">
                <strong>{ex.designation || ex.scannedEan || ex.reference || 'Extra'}</strong>
                <span className="text-muted"> — Qté: {ex.quantity} — {ex.stage}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// BACKUP SCREEN
// ============================================================
function BackupScreen({
  setToast,
  onOpenWalkthrough,
}: {
  setToast: (m: string) => void;
  onOpenWalkthrough?: () => void;
}) {
  const nav = useNavigate();
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportBackup();
      downloadBackup(data);
      showToast('Sauvegarde exportée', setToast);
    } catch (e) {
      showToast('Erreur export', setToast);
    }
    setExporting(false);
  };

  const handleShare = async () => {
    try {
      const data = await exportBackup();
      const shared = await shareBackup(data);
      showToast(shared ? 'Partagé avec succès' : 'Téléchargé', setToast);
    } catch {
      showToast('Erreur partage', setToast);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupData;
      if (!window.confirm('Cela remplacera TOUTES les données actuelles. Continuer ?')) return;
      await importBackup(data);
      showToast('Sauvegarde restaurée', setToast);
      nav('/');
    } catch (err) {
      showToast(`Erreur: ${(err as Error).message}`, setToast);
    }
  };

  return (
    <>
      <header className="app-header">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Retour"><IconArrowLeft size={18} /></button>
        <h1>EXPORT & SECOURS</h1>
      </header>

      <div className="app-content">
        {/* Automatic saving assurance card */}
        <div className="card flex items-center gap-2 py-2 mb-3" style={{ borderColor: 'var(--success)', background: 'rgba(16, 185, 129, 0.06)' }}>
          <IconCheck size={16} style={{ color: 'var(--success)' }} />
          <span className="text-xs text-secondary font-semibold">Sauvegarde locale automatique</span>
        </div>

        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>EXPORTER</div>
          <button className="btn btn-primary btn-full btn-lg mb-2 flex items-center justify-center gap-2" onClick={handleExport} disabled={exporting}>
            <IconDisk size={18} /> {exporting ? 'Export...' : 'TÉLÉCHARGER (.JSON)'}
          </button>
          <button className="btn btn-secondary btn-full flex items-center justify-center gap-2" onClick={handleShare}>
            <IconShare size={18} /> PARTAGER
          </button>
        </div>

        <div className="card mt-3">
          <div className="section-title" style={{ marginTop: 0 }}>RESTAURER</div>
          <p className="text-sm text-muted mb-2 flex items-center gap-1">
            <IconWarning size={14} /> La restauration remplacera toutes les données actuelles.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <button className="btn btn-warning btn-full flex items-center justify-center gap-2" onClick={() => fileInputRef.current?.click()}>
            <IconFolder size={18} /> IMPORTER (.JSON)
          </button>
        </div>

        {onOpenWalkthrough && (
          <div className="card mt-3">
            <div className="section-title" style={{ marginTop: 0 }}>GUIDE D'UTILISATION</div>
            <button
              className="btn btn-secondary btn-full flex items-center justify-center gap-2"
              onClick={onOpenWalkthrough}
            >
              <IconHelp size={18} /> GUIDE INTERACTIF
            </button>
          </div>
        )}

        {/* Subtle Credits Card */}
        <div className="card mt-4" style={{ textAlign: 'center', padding: '16px' }}>
          <div className="brand-container mb-1" style={{ justifyContent: 'center' }}>
            <BrandWordmark size={28} />
          </div>
          <div className="text-xs text-muted">
            100% Hors-Ligne
          </div>
        </div>

      </div>
    </>
  );
}

// ============================================================
// HISTORY SCREEN
// ============================================================
function HistoryScreen() {
  const nav = useNavigate();
  const allBills = useLiveQuery(() => db.bills.toArray(), [], []);
  const [tab, setTab] = useState<'active' | 'completed'>('active');

  const filteredBills = allBills.filter(b => tab === 'active' ? b.status === 'active' : b.status === 'completed');

  return (
    <>
      <header className="app-header">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Retour"><IconArrowLeft size={18} /></button>
        <h1>HISTORIQUE</h1>
      </header>

      <div className="app-content">
        <div className="seg-control mb-3">
          <button className={`seg-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
            Actifs
          </button>
          <button className={`seg-btn ${tab === 'completed' ? 'active' : ''}`} onClick={() => setTab('completed')}>
            Archivés
          </button>
        </div>

        {filteredBills.map(bill => (
          <div key={bill.id} className="card" onClick={() => nav(`/bill/${bill.id}`)}>
            <div className="card-client">{bill.client}</div>
            <div className="card-bill-number">{bill.billNumber}</div>
            <div className="text-xs text-muted mt-1">
              {new Date(bill.createdAt).toLocaleDateString('fr-FR')}
            </div>
          </div>
        ))}

        {filteredBills.length === 0 && (
          <div className="empty-state">
            <p>Aucun bon {tab === 'active' ? 'actif' : 'archivé'}</p>
          </div>
        )}
      </div>
    </>
  );
}
