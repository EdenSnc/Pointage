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
  useBillAudit,
  useBillOverrides,
  useAllSessionOverrides,
  useProductProfile,
  useBillExtras,
  useAllSessionLines,
  addCountEvent,
  undoLastCount,
  updateOrderLineField,
  updateLineStatus,
  createTransportContainer,
  addExtra,
  addIdentifierOverride,
  addIdentifierSuggestion,
  saveProductProfile,
  searchLines,
} from './hooks';
import {
  calcBatchQty,
  sumStageEvents,
  calcDiscrepancy,
  calcBillProgress,
  getStageTotals,
  calcPackBreakdown,
  roundDownToPack,
  getStageProblemLines,
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
} from './icons';

import { OnboardingWalkthrough } from './OnboardingWalkthrough';
import { providerRegistry } from './ai/providerRegistry';
import { ErrorBoundary } from './ErrorBoundary';
import { SettingsModal } from './SettingsModal';
import { FastScanQuantityCard } from './FastScanQuantityCard';
import { playSuccessChime, playErrorBeep } from './audio';

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
          <BrandLogo size={34} />
          <div className="brand-text">
            <span className="brand-title">Pointage</span>
          </div>
        </div>

        <div className="header-meta">
          <button
            className="btn btn-xs btn-ghost btn-icon"
            onClick={toggleShowQuantities}
            title={showQuantities ? 'Quantités visibles (Cliquer pour masquer)' : 'Quantités masquées (Cliquer pour afficher)'}
            style={{ padding: 6 }}
            aria-label={showQuantities ? 'Masquer les quantités' : 'Afficher les quantités'}
          >
            {showQuantities ? <IconEye size={18} style={{ color: 'var(--accent)' }} /> : <IconEyeOff size={18} />}
          </button>
          <button
            className="btn btn-xs btn-ghost btn-icon"
            onClick={() => setShowSettingsModal(true)}
            title="Paramètres, Quotas & Thème"
            style={{ padding: 6 }}
            aria-label="Paramètres"
          >
            <IconSettings size={18} />
          </button>
          <span className="badge-status-dot">
            {activeBills.length} Actif{activeBills.length !== 1 ? 's' : ''}
          </span>
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

        {displayBills.length === 0 ? (
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

// ---- Client Group Accordion Card ----
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

  const [expanded, setExpanded] = useState(true);

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
            <div className="text-xs text-muted">{bills.length} bons</div>
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
          {bills.map((b) => (
            <BillCard
              key={b.id}
              bill={b}
              onClick={() => onSelectBill(b.id!)}
              onArchive={onArchiveBill ? () => onArchiveBill(b.id!) : undefined}
              onRestore={onRestoreBill ? () => onRestoreBill(b.id!) : undefined}
            />
          ))}
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
          <div className="card-bill-number">{bill.billNumber}</div>
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

  const [stage, setStage] = useState<Stage>('preparation');
  const [searchMode, setSearchMode] = useState<SearchMode>('smart');
  const [searchQuery, setSearchQuery] = useState('');
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [showQuantities, setShowQuantities] = useState(() => localStorage.getItem('pointage_show_quantities') === 'true');

  const toggleShowQuantities = () => {
    setShowQuantities(prev => {
      const next = !prev;
      localStorage.setItem('pointage_show_quantities', String(next));
      return next;
    });
  };

  const eventsByLine = new Map<number, CountEvent[]>();
  for (const e of events) {
    const arr = eventsByLine.get(e.orderLineId) || [];
    arr.push(e);
    eventsByLine.set(e.orderLineId, arr);
  }

  // Filter and sort lines
  let displayLines = [...lines];

  // Search
  if (searchQuery.trim()) {
    displayLines = searchLines(displayLines, searchQuery, searchMode, billId, overrides);
  }

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
          <div className="text-xs text-muted truncate">{bill.billNumber}</div>
        </div>
        <button className="btn btn-sm btn-secondary btn-icon" onClick={() => nav(`/bill/${billId}/summary`)} title="Récapitulatif">
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
              onClick={() => setStage(s)}
            >
              {s === 'preparation' ? 'Préparation' : s === 'chargement' ? 'Chargement' : 'Pointage'}
            </button>
          ))}
        </div>

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

        {/* Search input */}
        <div className="search-wrapper">
          <input
            id="bill-search-input"
            name="searchQuery"
            aria-label="Rechercher"
            className="search-input"
            placeholder={searchMode === 'no' ? 'Entrer N°...' : 'Rechercher (réf, code-barres partiel)...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            type={searchMode === 'no' ? 'number' : 'text'}
            inputMode={searchMode === 'no' ? 'numeric' : 'text'}
          />
          <button
            className="search-scan-btn"
            onClick={() => nav(`/scan?billId=${billId}&stage=${stage}`)}
            title="Scanner"
          >
            <IconScan size={18} />
          </button>
        </div>

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
          </div>
          <span className="text-sm text-muted" style={{ alignSelf: 'center' }}>
            {displayLines.length}/{lines.length} lignes
          </span>
        </div>

        {/* Lines */}
        {displayLines.map((line) => {
          const evts = eventsByLine.get(line.id!) || [];
          const stageTotal = sumStageEvents(evts, stage);
          const disc = calcDiscrepancy(line, stageTotal);

          return (
            <div
              key={line.id}
              className="product-card"
              onClick={() => nav(`/bill/${billId}/line/${line.id}?stage=${stage}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="line-no">N°{line.no}</span>
                  {line.page != null && <span className="line-page">PAGE {line.page}</span>}
                </div>
                <div className="flex gap-1">
                  {line.status !== 'active' && (
                    <span className={`badge badge-${line.status === 'cancelled' ? 'cancelled' : line.status === 'not_found' ? 'not-found' : 'removed'} flex items-center gap-1`}>
                      {line.status === 'cancelled' ? <><IconBan size={11} /> ANNULÉ</> :
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
            </div>
          );
        })}

        {displayLines.length === 0 && (
          <div className="empty-state">
            <p>Aucune ligne trouvée</p>
          </div>
        )}
      </div>

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
  const line = useOrderLine(lineId);
  const events = useLineEvents(lineId);
  const containers = useBillContainers(billId);
  const profile = useProductProfile(line?.reference);

  const stageParam = (searchParams.get('stage') || 'preparation') as Stage;
  const [stage, setStage] = useState<Stage>(stageParam);

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

  // Init pack sizes from line or profile
  useEffect(() => {
    if (line) {
      setOuterPack(line.outerPackSize ?? profile?.outerPackSize ?? null);
      setInnerPack(line.innerPackSize ?? profile?.innerPackSize ?? null);
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

  const handleAddCount = async () => {
    if (batchQty <= 0) return;

    await addCountEvent(
      billId,
      lineId,
      stage,
      batchQty,
      stage === 'preparation' ? selectedContainer : null,
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

    // Reset
    setOuterCount(0);
    setInnerCount(0);
    setLoose(0);
    setDirectTotal('');

    if (navigator.vibrate) navigator.vibrate(50);
    showToast(`+${batchQty} enregistré`, setToast);
  };

  const handleUndo = async () => {
    const success = await undoLastCount(lineId, stage);
    if (success) {
      showToast('Dernier comptage annulé', setToast);
    } else {
      showToast('Rien à annuler', setToast);
    }
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

        <button className="back-btn" onClick={() => nav(-1)} aria-label="Retour"><IconArrowLeft size={18} /></button>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent)' }}>
              N°{line.no}
            </span>
            {line.page != null && (
              <span className="text-sm font-bold text-muted">PAGE {line.page}</span>
            )}
          </div>
          <div className="text-xs text-muted truncate">{bill.client} — {bill.billNumber}</div>
        </div>
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

        {/* Discrepancy summary */}
        <div className="card">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted">
              {stage === 'preparation' ? 'PRÉPARATION' : stage === 'chargement' ? 'CHARGEMENT' : 'POINTAGE'}
            </span>
            {disc.isExact && stageTotal > 0 && <span className="badge badge-exact flex items-center gap-1"><IconCheck size={11} /> EXACT</span>}
            {disc.isShort && <span className="badge badge-short">{showQuantities ? `${disc.remaining} MANQUANTS` : 'MANQUANTS'}</span>}
            {disc.isOver && <span className="badge badge-over">{showQuantities ? `${disc.over} EXCÉDENT` : 'EXCÉDENT'}</span>}
          </div>
          <div className="flex justify-between mt-2">
            <div>
              <div className="text-xs text-muted">COMPTÉ</div>
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
          {innerPack && showQuantities && (
            <div className="text-xs text-muted mt-2">
              = {calcPackBreakdown(disc.remaining, innerPack).fullPacks} paquets × {innerPack} + {calcPackBreakdown(disc.remaining, innerPack).loose} unités
            </div>
          )}
        </div>

        {/* Stage tabs for counting */}
        <div className="stage-tabs">
          {(['preparation', 'chargement', 'pointage'] as Stage[]).map((s) => (
            <button
              key={s}
              className={`stage-tab ${stage === s ? 'active' : ''}`}
              onClick={() => setStage(s)}
            >
              {s === 'preparation' ? 'Préparation' : s === 'chargement' ? 'Chargement' : 'Pointage'}
            </button>
          ))}
        </div>

        {/* Packaging setup */}
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>EMBALLAGES</div>
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
            </div>
          )}

          {/* Quick preset chips for rapid warehouse counting */}
          <div className="flex gap-1 mt-3 flex-wrap">
            <button className="btn btn-xs btn-secondary" onClick={() => {
              if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + 1));
              else setLoose(prev => prev + 1);
            }}>+1</button>
            <button className="btn btn-xs btn-secondary" onClick={() => {
              if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + 5));
              else setLoose(prev => prev + 5);
            }}>+5</button>
            <button className="btn btn-xs btn-secondary" onClick={() => {
              if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + 10));
              else setLoose(prev => prev + 10);
            }}>+10</button>
            <button className="btn btn-xs btn-secondary" onClick={() => {
              if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + 12));
              else setLoose(prev => prev + 12);
            }}>+12</button>
            {innerPack && innerPack > 1 && innerPack !== 5 && innerPack !== 10 && innerPack !== 12 && (
              <button className="btn btn-xs btn-secondary" onClick={() => {
                if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + innerPack));
                else setLoose(prev => prev + innerPack);
              }}>+{innerPack}</button>
            )}
            {outerPack && outerPack > 1 && (
              <button className="btn btn-xs btn-secondary" onClick={() => {
                if (useDirectEntry) setDirectTotal(String((parseInt(directTotal) || 0) + outerPack));
                else setLoose(prev => prev + outerPack);
              }}>+{outerPack}</button>
            )}
            {disc.remaining > 0 && (
              <button className="btn btn-xs btn-primary flex items-center gap-1" onClick={() => {
                if (useDirectEntry) setDirectTotal(String(disc.remaining));
                else setLoose(disc.remaining);
              }}>
                <IconBolt size={13} /> SOLDE ({disc.remaining})
              </button>
            )}
          </div>

          {/* Sealed pack 1-tap round down option */}
          {(() => {
            const packSize = innerPack || outerPack;
            if (packSize && packSize > 1 && disc.remaining > 0 && disc.remaining % packSize !== 0) {
              const rounded = roundDownToPack(disc.remaining, packSize);
              if (rounded.servedQty > 0) {
                return (
                  <div className="mt-2 p-2" style={{ background: 'rgba(234, 179, 8, 0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--warning)' }}>
                      Colisage scellé ({packSize} pcs / carton)
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-warning btn-full flex items-center justify-center gap-1"
                      onClick={() => {
                        if (useDirectEntry) setDirectTotal(String(rounded.servedQty));
                        else setLoose(rounded.servedQty);
                        showToast(`Lot scellé : ${rounded.servedQty} servis (${rounded.missingQty} reliquat)`, setToast);
                      }}
                    >
                      <IconBox size={14} /> Servir {rounded.servedQty} ({rounded.missingQty} reliquat)
                    </button>
                  </div>
                );
              }
            }
            return null;
          })()}

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

        {/* Transport */}
        {stage === 'preparation' ? (
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>CARTON DE RANGEMENT</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {containers.map((c) => (
                <button
                  key={c.id}
                  className={`container-tag ${selectedContainer === c.id ? 'selected' : ''}`}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-pill)',
                    fontWeight: 700,
                    borderColor: selectedContainer === c.id ? 'var(--accent)' : 'var(--border)',
                    background: selectedContainer === c.id ? 'rgba(37, 99, 235, 0.2)' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedContainer(selectedContainer === c.id ? null : c.id!)}
                >
                  <span className="flex items-center gap-1">
                    {selectedContainer === c.id && <IconCheck size={12} />}
                    <IconBox size={13} />
                    {c.label}
                  </span>
                </button>
              ))}
              <button
                className={`container-tag ${selectedContainer === null ? 'selected' : ''}`}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-pill)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderColor: selectedContainer === null ? 'var(--warning)' : 'var(--border)',
                }}
                onClick={() => setSelectedContainer(null)}
              >
                <span className="flex items-center gap-1">
                  {selectedContainer === null && <IconCheck size={12} />}
                  Hors Carton
                </span>
              </button>
              <button
                className="container-tag"
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  borderStyle: 'dashed',
                }}
                onClick={async () => {
                  const c = await createTransportContainer(billId);
                  setSelectedContainer(c.id!);
                  showToast(`${c.label} créé`, setToast);
                }}
              >
                <span className="flex items-center gap-1">
                  <IconPlus size={13} /> Nouveau Carton
                </span>
              </button>
            </div>

            {/* Show transport breakdown for this line */}
            {events.filter(e => e.stage === 'preparation' && !e.undone).length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div className="text-xs text-muted mb-1">RÉPARTITION :</div>
                {containers.map((c) => {
                  const qty = events
                    .filter(e => e.stage === 'preparation' && !e.undone && e.containerId === c.id)
                    .reduce((s, e) => s + e.quantity, 0);
                  if (qty === 0) return null;
                  return (
                    <div key={c.id} className="flex justify-between text-sm py-1">
                      <span className="font-semibold text-accent">{c.label}</span>
                      <span className="font-bold">{qty} unités</span>
                    </div>
                  );
                })}
                {(() => {
                  const noContainer = events
                    .filter(e => e.stage === 'preparation' && !e.undone && !e.containerId)
                    .reduce((s, e) => s + e.quantity, 0);
                  if (noContainer === 0) return null;
                  return (
                    <div className="flex justify-between text-sm py-1">
                      <span className="text-muted">Hors Carton</span>

                      <span className="font-bold">{noContainer} unités</span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ) : (
          /* Chargement & Pointage: show transport cartons packed during preparation */
          events.filter(e => e.stage === 'preparation' && !e.undone && e.containerId).length > 0 && (
            <div className="card">
              <div className="section-title" style={{ marginTop: 0 }}>CARTONS DE TRANSPORT</div>
              <div className="flex flex-col gap-1">
                {containers.map((c) => {
                  const qty = events
                    .filter(e => e.stage === 'preparation' && !e.undone && e.containerId === c.id)
                    .reduce((s, e) => s + e.quantity, 0);
                  if (qty === 0) return null;
                  return (
                    <div key={c.id} className="flex justify-between text-sm" style={{ padding: '4px 0' }}>
                      <span className="container-tag">{c.label}</span>
                      <span className="font-bold" style={{ fontSize: '1rem', alignSelf: 'center' }}>{qty} unités</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}

        {/* Actions */}
        {line.status === 'active' && (
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex gap-2">
              <button
                className="btn btn-sm flex items-center justify-center gap-1"
                style={{ flex: 1, background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                onClick={() => handleStatusChange('out_of_stock')}
                title="Stock totalement épuisé"
              >
                <IconBan size={15} /> RUPTURE
              </button>
              <button
                className="btn btn-sm btn-warning flex items-center justify-center gap-1"
                style={{ flex: 1 }}
                onClick={() => handleStatusChange('not_found')}
                title="Article introuvable pour l'instant"
              >
                <IconSearch size={15} /> INTROUVABLE
              </button>
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-sm btn-secondary flex items-center justify-center gap-1"
                style={{ flex: 1 }}
                onClick={() => handleStatusChange('cancelled')}
              >
                <IconX size={15} /> ANNULER
              </button>
              <button
                className="btn btn-sm btn-secondary flex items-center justify-center gap-1"
                onClick={handleUndo}
              >
                <IconUndo size={15} /> UNDO
              </button>
            </div>
          </div>
        )}
        {line.status !== 'active' && (
          <div className="flex gap-2 mb-3">
            <button
              className="btn btn-sm btn-primary flex items-center justify-center gap-1"
              style={{ flex: 1 }}
              onClick={() => handleStatusChange('active')}
            >
              <IconUndo size={15} /> RÉACTIVER L'ARTICLE
            </button>
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
      </div>

      {/* Sticky confirm button */}
      <div className="bottom-bar">
        <button
          className="btn btn-success btn-lg btn-full flex items-center justify-center gap-2"
          onClick={handleAddCount}
          disabled={batchQty <= 0 || line.status !== 'active'}
        >
          <IconCheck size={20} /> AJOUTER {batchQty > 0 ? batchQty : ''} {stage === 'preparation' ? 'PRÉPARÉ' : stage === 'chargement' ? 'CHARGÉ' : 'POINTÉ'}
        </button>
      </div>
    </ErrorBoundary>
  );
}


// ---- Stepper Component ----
function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button className="stepper-btn" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <input
        id="stepper-quantity-input"
        name="stepperQuantity"
        aria-label="Quantité colisage"
        className="stepper-value"
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          fontFamily: 'var(--font)',
        }}
      />
      <button className="stepper-btn" onClick={() => onChange(value + 1)}>+</button>
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
        ]);
        reader = new BrowserMultiFormatReader(hints);


        if (videoRef.current && !cancelled) {
          await reader.decodeFromConstraints(
            {
              audio: false,
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
            },
            videoRef.current,
            (result: any) => {
              if (result && !scanLockRef.current) {
                scanLockRef.current = true;
                handleScanResult(result.getText());
              }
            }
          );

          // Store stream for cleanup and configure Samsung Galaxy A54 autofocus
          if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            streamRef.current = stream;
            const track = stream.getVideoTracks()[0];
            if (track && 'applyConstraints' in track) {
              track.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as any],
              }).catch(() => {});
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
  }, [scanning]);

  const handleScanResult = (code: string) => {
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
      return linesToSearch.filter(l =>
        l.reference?.toLowerCase().includes(lower) ||
        l.originalReference?.toLowerCase().includes(lower) ||
        (l.ean && (l.ean.toLowerCase().includes(lower) || (clean.length >= 3 && l.ean.replace(/[^a-z0-9]/gi, '').includes(clean)))) ||
        (l.originalEan && (l.originalEan.toLowerCase().includes(lower) || (clean.length >= 3 && l.originalEan.replace(/[^a-z0-9]/gi, '').includes(clean)))) ||
        (clean.length >= 2 && (
          (l.reference && l.reference.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(clean)) ||
          (l.originalReference && l.originalReference.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(clean))
        ))
      );
    }

    return [];
  };

  const handleManualSearch = () => {
    const q = manualEntry.trim();
    if (!q) return;
    handleScanResult(q);
  };

  const navigateToLine = (line: OrderLine) => {
    nav(`/bill/${line.billId}/line/${line.id}?stage=${stageParam}`);
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

  return (
    <div className="scanner-overlay">
      {scanning && (
        <>
          <video ref={videoRef} className="scanner-video" playsInline muted autoPlay />
          <div className="scanner-target" />
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
                <div className="text-xs font-bold text-muted">CODE INCONNU</div>
                <div className="font-bold text-lg" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                  {scanResult}
                </div>
              </div>
              <button className="btn btn-xs btn-secondary flex items-center gap-1" onClick={resetScan}>
                <IconScan size={14} /> Rescanner
              </button>
            </div>

            <div className="text-xs text-secondary mb-2">
              Associer à un article :
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
                      <span className="text-xs font-semibold text-accent">{b?.client}</span>
                    </div>
                    <div className="text-sm font-semibold truncate">{line.designation}</div>
                    <div className="text-xs text-muted">
                      {line.reference ? `RÉF: ${line.reference}` : 'Sans réf.'}
                    </div>
                  </div>
                );
              })}
            </div>

            {billIdParam && (
              <button
                className="btn btn-secondary btn-full flex items-center justify-center gap-2 mt-2"
                onClick={() => nav(`/bill/${billIdParam}/extras?stage=${stageParam}&ean=${scanResult}`)}
              >
                <IconPlus size={16} /> Produit Hors-BL
              </button>
            )}
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

  const [summaryTab, setSummaryTab] = useState<'problems' | 'all' | 'cartons' | 'audit'>('problems');
  const [stageScope, setStageScope] = useState<Stage | 'auto'>('preparation');

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
  const totalLines = lines.length;
  const activeLines = lines.filter(l => l.status === 'active').length;
  const cancelledLines = lines.filter(l => l.status === 'cancelled').length;
  const notFoundLines = lines.filter(l => l.status === 'not_found').length;
  const outOfStockLines = lines.filter(l => l.status === 'out_of_stock').length;

  const prep = calcBillProgress(lines, eventsByLine, 'preparation');
  const load = calcBillProgress(lines, eventsByLine, 'chargement');
  const point = calcBillProgress(lines, eventsByLine, 'pointage');

  // WhatsApp Discrepancy Report Generator
  const generateReport = () => {
    const stageProblems = getStageProblemLines(lines, eventsByLine, stageScope === 'auto' ? 'preparation' : stageScope);

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
        const count = events
          .filter((e) => e.stage === 'preparation' && !e.undone && e.containerId === c.id)
          .reduce((s, e) => s + e.quantity, 0);
        text += `• ${c.label} : ${count} unités\n`;
      });
      text += `\n`;
    }

    text += `_Transmis depuis l'application Pointage._`;
    return text;
  };

  const whatsappNumber = localStorage.getItem('pointage_whatsapp_number') || '+213556264976';
  const reportEmail = localStorage.getItem('pointage_report_email') || '';

  const handleShareWhatsApp = () => {
    const report = generateReport();
    const cleanPhone = whatsappNumber.replace(/[^\d]/g, '');
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(report)}`
      : `https://wa.me/?text=${encodeURIComponent(report)}`;
    window.open(url, '_blank');
  };

  const handleSendEmail = () => {
    const report = generateReport();
    const subject = encodeURIComponent(`Pointage — Synthèse ${bill.billNumber} (${bill.client})`);
    const body = encodeURIComponent(report);
    window.location.href = `mailto:${reportEmail}?subject=${subject}&body=${body}`;
  };


  const handleCopyReport = () => {
    const report = generateReport();
    navigator.clipboard.writeText(report);
    if (setToast) setToast('Rapport copié dans le presse-papier');
  };

  return (
    <>
      <header className="app-header">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Retour"><IconArrowLeft size={18} /></button>
        <h1>RÉCAPITULATIF</h1>
      </header>

      <div className="app-content">
        <div className="card">
          <div className="font-bold">{bill.client}</div>
          <div className="text-sm text-muted">{bill.billNumber}</div>
          <div className="divider" />
          <div className="info-row">
            <span className="info-label">Total lignes</span>
            <span className="info-value">{totalLines}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Actives</span>
            <span className="info-value">{activeLines}</span>
          </div>
          {outOfStockLines > 0 && (
            <div className="info-row">
              <span className="info-label">Ruptures Définitives</span>
              <span className="info-value" style={{ color: 'var(--danger)', fontWeight: 700 }}>{outOfStockLines}</span>
            </div>
          )}
          {notFoundLines > 0 && (
            <div className="info-row">
              <span className="info-label">Introuvables</span>
              <span className="info-value" style={{ color: 'var(--warning)', fontWeight: 700 }}>{notFoundLines}</span>
            </div>
          )}
          {cancelledLines > 0 && (
            <div className="info-row">
              <span className="info-label">Annulées</span>
              <span className="info-value" style={{ color: 'var(--text-muted)' }}>{cancelledLines}</span>
            </div>
          )}
          <div className="divider" />
          <ProgressRow label="Préparation" progress={prep} />
          <ProgressRow label="Chargement" progress={load} />
          <ProgressRow label="Pointage" progress={point} />
        </div>

        {/* Report Dispatch Card */}
        <div className="card mb-3" style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
          <div className="flex justify-between items-center mb-3">
            <div className="font-bold text-sm flex items-center gap-2" style={{ color: '#22c55e' }}>
              <IconSend size={18} /> RAPPORT D'ÉCARTS
            </div>
            <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>Instantané</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-sm flex-1 flex items-center justify-center gap-2"
              style={{ background: '#25D366', color: '#fff', fontWeight: 700, border: 'none', minWidth: 150 }}
              onClick={handleShareWhatsApp}
            >
              <IconSend size={15} /> WhatsApp
            </button>
            <button
              className="btn btn-sm btn-secondary flex items-center justify-center gap-1"
              onClick={handleSendEmail}
              title={reportEmail ? `Envoyer par email à ${reportEmail}` : 'Envoyer par email'}
            >
              <IconMail size={15} /> Email
            </button>
            <button
              className="btn btn-sm btn-secondary flex items-center justify-center gap-1"
              onClick={handleCopyReport}
              title="Copier le texte du rapport"
            >
              <IconClipboard size={15} /> Copier
            </button>
          </div>
        </div>

        {/* BL Lifecycle & Archiving Card */}
        <div className="card mb-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between items-center">
            <div className="font-bold text-sm">
              {bill.status === 'completed' ? 'Bon Archivé' : 'Bon Actif'}
            </div>
            {bill.status === 'completed' ? (
              <button
                className="btn btn-sm btn-secondary flex items-center gap-1"
                onClick={async () => {
                  await db.bills.update(bill.id!, { status: 'active' });
                  if (setToast) setToast('Bon réouvert et replacé dans les bons actifs');
                }}
              >
                <IconUndo size={14} /> Restaurer
              </button>
            ) : (
              <button
                className="btn btn-sm btn-primary flex items-center gap-1"
                onClick={async () => {
                  await db.bills.update(bill.id!, { status: 'completed' });
                  if (setToast) setToast(`Bon ${bill.billNumber} clôturé et archivé`);
                  nav('/');
                }}
              >
                <IconCheck size={14} /> Clôturer
              </button>
            )}
          </div>
        </div>

        {extras.length > 0 && (

          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>EXTRAS ({extras.length})</div>
            {extras.map((ex) => (
              <div key={ex.id} className="text-sm mb-2">
                <span className="font-bold">{ex.designation || ex.scannedEan || ex.reference || 'Extra'}</span>
                <span className="text-muted"> — Qté: {ex.quantity}</span>
              </div>
            ))}
          </div>
        )}

        {/* View Tabs */}
        <div className="flex gap-1 mb-2 flex-wrap">
          <button
            className={`btn btn-sm ${summaryTab === 'problems' ? 'btn-warning' : 'btn-secondary'} flex items-center gap-1`}
            onClick={() => setSummaryTab('problems')}
          >
            <IconWarning size={14} /> Problèmes ({problemLines.length})
          </button>
          <button
            className={`btn btn-sm ${summaryTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSummaryTab('all')}
          >
            Toutes ({lines.length})
          </button>
          <button
            className={`btn btn-sm ${summaryTab === 'cartons' ? 'btn-primary' : 'btn-secondary'} flex items-center gap-1`}
            onClick={() => setSummaryTab('cartons')}
          >
            <IconBox size={14} /> Cartons ({containers.length})
          </button>
          <button
            className={`btn btn-sm ${summaryTab === 'audit' ? 'btn-primary' : 'btn-secondary'} flex items-center gap-1`}
            onClick={() => setSummaryTab('audit')}
          >
            <IconClipboard size={14} /> Audit
          </button>
        </div>

        {/* Stage Scope Selector for Problem Detection */}
        {summaryTab === 'problems' && (
          <div className="stage-tabs mb-3">
            <button
              className={`stage-tab ${stageScope === 'preparation' ? 'active' : ''}`}
              onClick={() => setStageScope('preparation')}
            >
              Préparation ({getStageProblemLines(lines, eventsByLine, 'preparation').length})
            </button>
            <button
              className={`stage-tab ${stageScope === 'chargement' ? 'active' : ''}`}
              onClick={() => setStageScope('chargement')}
            >
              Chargement ({getStageProblemLines(lines, eventsByLine, 'chargement').length})
            </button>
            <button
              className={`stage-tab ${stageScope === 'pointage' ? 'active' : ''}`}
              onClick={() => setStageScope('pointage')}
            >
              Pointage ({getStageProblemLines(lines, eventsByLine, 'pointage').length})
            </button>
          </div>
        )}


        {/* PAR CARTON View */}
        {summaryTab === 'cartons' && (
          <div>
            {containers.map((c) => {
              const linesInCarton = lines
                .map(line => {
                  const evts = eventsByLine.get(line.id!) || [];
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
                        {c.type === 'loose' ? 'Hors Carton' : c.type === 'large' ? 'Grand Colis' : 'Carton Standard'}
                      </span>
                    </div>
                    <span className="badge badge-active font-mono">{totalUnits} unités</span>
                  </div>
                  {linesInCarton.length === 0 ? (
                    <div className="text-xs text-muted py-1">Carton vide</div>
                  ) : (
                    linesInCarton.map(({ line, qty }) => (
                      <div key={line.id} className="flex justify-between items-center py-1 border-t text-sm">
                        <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
                          <span className="font-bold text-accent">N°{line.no}</span>
                          {line.reference && <span className="text-xs text-muted"> • REF: {line.reference}</span>}
                          <div className="truncate text-xs">{line.designation}</div>
                        </div>
                        <span className="font-bold text-base font-mono">{qty}</span>
                      </div>
                    ))
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
        )}

        {/* Lines View (Problems or All) */}
        {(summaryTab === 'problems' || summaryTab === 'all') && displayLines.map((line) => {
          const evts = eventsByLine.get(line.id!) || [];
          const prepTotal = sumStageEvents(evts, 'preparation');
          const loadTotal = sumStageEvents(evts, 'chargement');
          const pointTotal = sumStageEvents(evts, 'pointage');
          const pointTotals = getStageTotals(evts, 'pointage');
          const isModified = line.orderedQty !== line.originalOrderedQty;

          return (
            <div key={line.id} className="card" style={{ padding: 10 }}>
              <div className="flex items-center gap-2">
                <span className="line-no" style={{ fontSize: '1rem' }}>N°{line.no}</span>
                {line.page != null && <span className="text-xs text-muted">P{line.page}</span>}
                {line.status !== 'active' && (
                  <span className={`badge badge-${line.status === 'cancelled' ? 'cancelled' : 'not-found'}`}>
                    {line.status === 'cancelled' ? 'ANNULÉ' : line.status === 'not_found' ? 'INTROUVABLE' : 'SUPPRIMÉ'}
                  </span>
                )}
                {isModified && <span className="badge badge-modified">MODIFIÉ</span>}
              </div>
              <div className="text-sm mt-1">{line.reference && `REF: ${line.reference} • `}{line.designation}</div>
              <div className="flex gap-3 mt-2 text-sm flex-wrap">
                {isModified && <div><span className="text-muted">Orig:</span> <strong>{line.originalOrderedQty}</strong></div>}
                <div><span className="text-muted">Attendu:</span> <strong>{line.orderedQty}</strong></div>
                <div><span className="text-muted">Préparé:</span> <strong>{prepTotal}</strong></div>
                <div><span className="text-muted">Chargé:</span> <strong>{loadTotal}</strong></div>
                <div><span className="text-muted">Pointé:</span> <strong>{pointTotal}</strong></div>
              </div>
              {pointTotal > 0 && (
                <div className="flex gap-2 mt-1 text-xs flex-wrap">
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
                <div className="flex gap-1 mt-1 flex-wrap">
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
