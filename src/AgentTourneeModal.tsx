// ============================================================
// POINTAGE — Modal Agent à Tourner & Échantillonnage Arrivage
// Vitrine Showroom • Librairie El Feth • Sacoches Chauffeurs
// Co-Décision Transportabilité : Responsable Dépôt + Préparateurs
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  db,
  getAllProductSamples,
  saveProductSample,
  deleteProductSample,
  getAllReceptionSessions,
  getReceptionItemsBySession,
} from './db';
import type {
  ProductSampleAllocation,
  TransportabilityGrade,
  SampleStatus,
  ReceptionSession,
  ReceptionItem,
} from './types';
import {
  loadPreparateursRoster,
  savePreparateurToRoster,
  TRANSPORTABILITY_NOTE_PRESETS,
  suggestTransportability,
  buildArrivalSamplePlan,
  commitArrivalSamplePlan,
  formatAgentTourneeManifest,
  formatElFethPricingManifest,
  CandidateItemForSampling,
} from './sampleLogistics';
import { loadDriverRoster } from './driverLogistics';
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
  IconClipboardCheck,
  IconTag,
  IconStore,
  IconSparkles,
  IconUser,
  IconUsers,
  IconBag,
  IconTrendingUp,
} from './icons';
import { playSuccessChime, playWarningBeep, hapticTap } from './audio';

interface AgentTourneeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOperator: string;
  onToast: (msg: string) => void;
  initialReceptionSessionId?: number | null;
}

export const AgentTourneeModal: React.FC<AgentTourneeModalProps> = ({
  isOpen,
  onClose,
  activeOperator,
  onToast,
  initialReceptionSessionId,
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'arrival_sampling' | 'chauffeur_kits' | 'el_feth_pricing' | 'showroom'>('arrival_sampling');

  // Core Data States
  const [samples, setSamples] = useState<ProductSampleAllocation[]>([]);
  const [receptionSessions, setReceptionSessions] = useState<ReceptionSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(initialReceptionSessionId || null);
  const [preparateurs, setPreparateurs] = useState<string[]>(() => loadPreparateursRoster());
  const [drivers, setDrivers] = useState<string[]>(() => loadDriverRoster());

  // Co-decision & Consultation Settings
  const [managerName, setManagerName] = useState(activeOperator || 'Responsable Dépôt');
  const [consultedWorker, setConsultedWorker] = useState(preparateurs[0] || 'Walid (Préparateur Principal)');
  const [newWorkerInput, setNewWorkerInput] = useState('');
  const [showAddWorker, setShowAddWorker] = useState(false);

  // New Candidates for Sampling (e.g. from container or manual input)
  const [candidates, setCandidates] = useState<CandidateItemForSampling[]>([]);
  const [manualRef, setManualRef] = useState('');
  const [manualDesignation, setManualDesignation] = useState('');
  const [manualCategory, setManualCategory] = useState<'scolaire' | 'bureautique' | 'autre'>('scolaire');

  // Driver Kit Filter & Feedback State
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [feedbackEditingId, setFeedbackEditingId] = useState<number | null>(null);
  const [agentFeedbackText, setAgentFeedbackText] = useState('');

  // El Feth Pricing Inputs
  const [editingElFethId, setEditingElFethId] = useState<number | null>(null);
  const [elFethWholesale, setElFethWholesale] = useState<string>('');
  const [elFethRetail, setElFethRetail] = useState<string>('');
  const [elFethNote, setElFethNote] = useState<string>('');

  // Load existing samples & sessions
  const refreshData = async () => {
    try {
      const allSamples = await getAllProductSamples();
      setSamples(allSamples);

      const allSessions = await getAllReceptionSessions();
      setReceptionSessions(allSessions);

      const loadedDrivers = loadDriverRoster();
      setDrivers(loadedDrivers);

      const loadedPreps = loadPreparateursRoster();
      setPreparateurs(loadedPreps);
      if (!consultedWorker && loadedPreps.length > 0) {
        setConsultedWorker(loadedPreps[0]);
      }
    } catch (e) {
      console.error('Error refreshing sample logistics data', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  // When reception session is selected, load its items into candidates
  useEffect(() => {
    if (!isOpen) return;

    async function loadSessionCandidates(sessionId: number) {
      try {
        const sessionItems = await getReceptionItemsBySession(sessionId);
        const mapped: CandidateItemForSampling[] = sessionItems.map((item) => {
          const heuristic = suggestTransportability({
            designation: item.designation,
            category: item.category,
            outerPackSize: item.outerPackSize,
            innerPackSize: item.innerPackSize,
          });
          return {
            reference: item.reference,
            ean: item.ean,
            designation: item.designation,
            category: item.category || 'scolaire',
            receptionSessionId: sessionId,
            transportability: heuristic.grade,
            workerEvaluationNote: heuristic.suggestedNote,
          };
        });
        setCandidates(mapped);
      } catch (e) {
        console.error('Failed to load candidate items from session', e);
      }
    }

    if (selectedSessionId) {
      loadSessionCandidates(selectedSessionId);
    }
  }, [selectedSessionId, isOpen]);

  // Add manual candidate item
  const handleAddManualCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = manualRef.trim().toUpperCase();
    const des = manualDesignation.trim();
    if (!ref || !des) {
      playWarningBeep();
      onToast('Veuillez renseigner la référence et la désignation.');
      return;
    }

    const heuristic = suggestTransportability({ designation: des, category: manualCategory });
    const newCand: CandidateItemForSampling = {
      reference: ref,
      designation: des,
      category: manualCategory,
      receptionSessionId: selectedSessionId || null,
      transportability: heuristic.grade,
      workerEvaluationNote: heuristic.suggestedNote,
    };

    setCandidates((prev) => [newCand, ...prev]);
    setManualRef('');
    setManualDesignation('');
    playSuccessChime();
    hapticTap('light');
    onToast(`Article ${ref} ajouté aux candidats d'échantillonnage.`);
  };

  // Toggle transportability for a candidate
  const handleToggleTransportability = (index: number, grade: TransportabilityGrade) => {
    hapticTap('selection');
    setCandidates((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        let note = item.workerEvaluationNote;
        if (grade === 'easily_transportable' && (!note || note.includes('Trop lourd'))) {
          note = TRANSPORTABILITY_NOTE_PRESETS[0];
        } else if (grade === 'bulky_refused') {
          note = TRANSPORTABILITY_NOTE_PRESETS[4];
        }
        return {
          ...item,
          transportability: grade,
          workerEvaluationNote: note,
        };
      })
    );
  };

  // Change note for a candidate
  const handleUpdateCandidateNote = (index: number, note: string) => {
    setCandidates((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, workerEvaluationNote: note } : item))
    );
  };

  // Commit sample generation
  const handleGenerateSamples = async () => {
    if (candidates.length === 0) {
      playWarningBeep();
      onToast('Aucun article sélectionné pour générer des échantillons.');
      return;
    }

    const plan = buildArrivalSamplePlan({
      items: candidates,
      activeAgents: drivers,
      managerName: managerName || 'Chef de Dépôt',
      consultedWorkerName: consultedWorker || 'Préparateur',
    });

    try {
      await commitArrivalSamplePlan(plan);
      playSuccessChime();
      hapticTap('heavy');
      onToast(
        `Échantillons générés : ${plan.totalShowroom} Showroom, ${plan.totalElFeth} El Feth, ${plan.totalAgentTourner} Chauffeurs (${plan.excludedBulkyCount} exclus encombrants).`
      );
      setCandidates([]);
      await refreshData();
      setActiveTab('chauffeur_kits');
    } catch (e) {
      console.error('Failed to commit sample plan', e);
      playWarningBeep();
      onToast('Erreur lors de la génération des échantillons.');
    }
  };

  // Save new preparateur worker
  const handleAddNewWorker = () => {
    const clean = newWorkerInput.trim();
    if (!clean) return;
    const formatted = clean.includes('(') ? clean : `${clean} (Préparateur)`;
    const updated = savePreparateurToRoster(formatted);
    setPreparateurs(updated);
    setConsultedWorker(formatted);
    setNewWorkerInput('');
    setShowAddWorker(false);
    playSuccessChime();
    onToast(`Préparateur ${formatted} ajouté au registre.`);
  };

  // Filtered samples for chauffeur kits
  const filteredChauffeurSamples = useMemo(() => {
    let list = samples.filter((s) => s.destination === 'agent_tourner');
    if (selectedDriver !== 'all') {
      list = list.filter((s) => s.assignedAgentName === selectedDriver);
    }
    return list;
  }, [samples, selectedDriver]);

  // Samples for El Feth
  const elFethSamples = useMemo(() => {
    return samples.filter((s) => s.destination === 'el_feth');
  }, [samples]);

  // Samples for Showroom
  const showroomSamples = useMemo(() => {
    return samples.filter((s) => s.destination === 'showroom');
  }, [samples]);

  // Hand over to agent
  const handleUpdateStatus = async (sample: ProductSampleAllocation, newStatus: SampleStatus) => {
    hapticTap('medium');
    await saveProductSample({
      ...sample,
      status: newStatus,
    });
    playSuccessChime();
    await refreshData();
    onToast(`Statut mis à jour : ${newStatus === 'given_to_agent' ? 'Remis au chauffeur' : newStatus === 'returned' ? 'Retourné au dépôt' : 'Alloué'}.`);
  };

  // Save commercial feedback from driver
  const handleSaveDriverFeedback = async (sample: ProductSampleAllocation) => {
    await saveProductSample({
      ...sample,
      agentVendorFeedback: agentFeedbackText.trim() || null,
    });
    setFeedbackEditingId(null);
    setAgentFeedbackText('');
    playSuccessChime();
    await refreshData();
    onToast('Retour terrain enregistré.');
  };

  // Save El Feth pricing review
  const handleSaveElFethReview = async (sample: ProductSampleAllocation) => {
    const wp = elFethWholesale ? parseFloat(elFethWholesale) : null;
    const rp = elFethRetail ? parseFloat(elFethRetail) : null;

    await saveProductSample({
      ...sample,
      elFethWholesalePrice: wp,
      elFethRetailPrice: rp,
      elFethMarketNote: elFethNote.trim() || null,
      elFethReviewedBy: 'Responsable Librairie El Feth',
      elFethReviewedAt: new Date().toISOString(),
      status: 'priced_by_el_feth',
    });

    // Also update any matching chauffeur and showroom samples with the El Feth retail price!
    const matchingSamples = samples.filter((s) => s.reference === sample.reference && s.id !== sample.id);
    for (const match of matchingSamples) {
      await saveProductSample({
        ...match,
        elFethWholesalePrice: wp,
        elFethRetailPrice: rp,
      });
    }

    setEditingElFethId(null);
    setElFethWholesale('');
    setElFethRetail('');
    setElFethNote('');
    playSuccessChime();
    hapticTap('heavy');
    await refreshData();
    onToast(`Tarif El Feth validé pour ${sample.reference} (${rp ? rp + ' DA Détail' : 'Gros'}).`);
  };

  // Copy WhatsApp manifest for Driver
  const handleCopyDriverManifest = (driverName: string) => {
    const text = formatAgentTourneeManifest(driverName, samples);
    navigator.clipboard.writeText(text);
    playSuccessChime();
    hapticTap('medium');
    onToast(`Feuille de tournée de ${driverName} copiée pour WhatsApp.`);
  };

  // Copy El Feth Pricing manifest
  const handleCopyElFethManifest = () => {
    const text = formatElFethPricingManifest(samples);
    navigator.clipboard.writeText(text);
    playSuccessChime();
    hapticTap('medium');
    onToast('Bordereau de tarification El Feth copié pour partage.');
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
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(59, 130, 246, 0.08)',
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
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
              }}
            >
              <IconBag size={24} />
            </div>
            <div>
              <div className="font-extrabold text-base text-white flex items-center gap-2">
                <span>Échantillons & Agents à Tourner</span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    backgroundColor: 'rgba(168, 85, 247, 0.15)',
                    color: '#c084fc',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    fontWeight: 700,
                  }}
                >
                  Règle 1 Showroom • 1 El Feth • N Chauffeurs
                </span>
              </div>
              <div className="text-xs text-muted mt-0.5">
                Distribution d'arrivage conteneurs • Évaluation transportabilité dépôt • Fixation prix El Feth
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
            padding: '10px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            className={`apple-segmented-tab ${activeTab === 'arrival_sampling' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('arrival_sampling');
              hapticTap('selection');
            }}
            style={{ minHeight: 40 }}
          >
            <IconBox size={15} />
            <span>Arrivage & Échantillonnage ({candidates.length})</span>
          </button>
          <button
            type="button"
            className={`apple-segmented-tab ${activeTab === 'chauffeur_kits' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('chauffeur_kits');
              hapticTap('selection');
            }}
            style={{ minHeight: 40 }}
          >
            <IconTruck size={15} />
            <span>Mallettes Chauffeurs ({filteredChauffeurSamples.length})</span>
          </button>
          <button
            type="button"
            className={`apple-segmented-tab ${activeTab === 'el_feth_pricing' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('el_feth_pricing');
              hapticTap('selection');
            }}
            style={{ minHeight: 40 }}
          >
            <IconTrendingUp size={15} />
            <span>Tarification El Feth ({elFethSamples.length})</span>
          </button>
          <button
            type="button"
            className={`apple-segmented-tab ${activeTab === 'showroom' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('showroom');
              hapticTap('selection');
            }}
            style={{ minHeight: 40 }}
          >
            <IconStore size={15} />
            <span>Vitrine Showroom ({showroomSamples.length})</span>
          </button>
        </div>

        {/* Modal Body Container */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* TAB 1: ARRIVAGE & ÉCHANTILLONNAGE */}
          {activeTab === 'arrival_sampling' && (
            <div className="flex flex-col gap-4">
              {/* Co-Decision Consultation Header Box */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IconUsers size={16} className="text-accent" />
                    <span className="font-extrabold text-xs uppercase tracking-wider text-white">
                      Co-Décision & Consultation de Quai (Transportabilité)
                    </span>
                  </div>
                  <span className="text-[11px] text-muted">
                    Conformité : Les chauffeurs ne transportent que les articles compacts
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Manager Input */}
                  <div>
                    <label className="text-[11px] font-bold text-muted uppercase flex items-center gap-1 mb-1">
                      <IconUser size={12} />
                      <span>Responsable Dépôt (Validation)</span>
                    </label>
                    <input
                      type="text"
                      className="input input-sm w-full font-bold"
                      value={managerName}
                      onChange={(e) => setManagerName(e.target.value)}
                      placeholder="Nom du responsable"
                      style={{ borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>

                  {/* Consulted Worker Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-muted uppercase flex items-center gap-1">
                        <IconUser size={12} className="text-emerald-400" />
                        <span>Préparateur Consulté (Manipulateur Colis)</span>
                      </label>
                      <button
                        type="button"
                        className="text-[10px] text-accent hover:underline flex items-center gap-0.5"
                        onClick={() => setShowAddWorker(!showAddWorker)}
                      >
                        <IconPlus size={10} />
                        <span>Ajouter préparateur</span>
                      </button>
                    </div>

                    {showAddWorker ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="input input-sm flex-1 text-xs"
                          placeholder="Ex: Hichem (Zone B)"
                          value={newWorkerInput}
                          onChange={(e) => setNewWorkerInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddNewWorker()}
                          style={{ borderRadius: 10 }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={handleAddNewWorker}
                          style={{ borderRadius: 10 }}
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <select
                        className="select select-sm w-full font-bold"
                        value={consultedWorker}
                        onChange={(e) => setConsultedWorker(e.target.value)}
                        style={{ borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {preparateurs.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Source Selection: Container Session vs Manual */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: 'rgba(59, 130, 246, 0.05)',
                  border: '1px solid rgba(59, 130, 246, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-accent">
                  <IconTruck size={14} />
                  <span>Importer depuis Réception Conteneur :</span>
                </div>
                <select
                  className="select select-sm flex-1 font-bold text-xs"
                  value={selectedSessionId || ''}
                  onChange={(e) => setSelectedSessionId(e.target.value ? parseInt(e.target.value, 10) : null)}
                  style={{ borderRadius: 10, minWidth: 240 }}
                >
                  <option value="">Sélectionner une session d'arrivage...</option>
                  {receptionSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.containerNumber || 'Conteneur'} - {s.supplierName || 'Fournisseur'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Fast Manual Product Entry Form */}
              <form
                onSubmit={handleAddManualCandidate}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div className="text-xs font-bold text-muted flex items-center gap-1">
                  <IconPlus size={13} />
                  <span>Ajout Rapide :</span>
                </div>
                <input
                  type="text"
                  className="input input-sm font-mono text-xs uppercase"
                  placeholder="RÉF (ex: STY-202)"
                  value={manualRef}
                  onChange={(e) => setManualRef(e.target.value)}
                  style={{ width: 140, borderRadius: 10 }}
                />
                <input
                  type="text"
                  className="input input-sm text-xs flex-1"
                  placeholder="Désignation (ex: Trousse Oxford Bleu Marine)"
                  value={manualDesignation}
                  onChange={(e) => setManualDesignation(e.target.value)}
                  style={{ minWidth: 200, borderRadius: 10 }}
                />
                <select
                  className="select select-sm text-xs"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value as any)}
                  style={{ width: 130, borderRadius: 10 }}
                >
                  <option value="scolaire">Scolaire</option>
                  <option value="bureautique">Bureautique</option>
                  <option value="autre">Autre</option>
                </select>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary flex items-center gap-1"
                  style={{ borderRadius: 10, fontWeight: 700 }}
                >
                  <IconPlus size={14} />
                  <span>Ajouter</span>
                </button>
              </form>

              {/* Candidate Products List with Transportability Decision Toggles */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-muted font-bold px-1">
                  <span>Articles à échantillonner ({candidates.length})</span>
                  <span>Chauffeurs actifs éligibles : {drivers.length} ({drivers.join(', ')})</span>
                </div>

                {candidates.length === 0 ? (
                  <div
                    style={{
                      padding: 32,
                      textAlign: 'center',
                      borderRadius: 16,
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px dashed rgba(255, 255, 255, 0.1)',
                      color: 'var(--muted)',
                    }}
                  >
                    <IconBox size={32} className="mx-auto mb-2 opacity-40 text-accent" />
                    <div className="font-bold text-sm text-white">Aucun article dans la liste d'échantillonnage</div>
                    <div className="text-xs mt-1">
                      Sélectionnez une session conteneur ci-dessus ou saisissez manuellement les nouveaux articles.
                    </div>
                  </div>
                ) : (
                  candidates.map((cand, idx) => {
                    const isTransportable = cand.transportability === 'easily_transportable';
                    return (
                      <div
                        key={`${cand.reference}-${idx}`}
                        style={{
                          padding: '12px 16px',
                          borderRadius: 16,
                          backgroundColor: isTransportable ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
                          border: isTransportable
                            ? '1px solid rgba(16, 185, 129, 0.2)'
                            : '1px solid rgba(239, 68, 68, 0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-extrabold text-sm text-white">{cand.reference}</span>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '2px 8px',
                                  borderRadius: 9999,
                                  backgroundColor: 'rgba(255,255,255,0.06)',
                                  color: 'var(--muted)',
                                  textTransform: 'uppercase',
                                  fontWeight: 700,
                                }}
                              >
                                {cand.category || 'scolaire'}
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-white/90 mt-0.5">{cand.designation}</div>
                          </div>

                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-circle text-muted hover:text-danger"
                            onClick={() => {
                              hapticTap('light');
                              setCandidates((prev) => prev.filter((_, i) => i !== idx));
                            }}
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>

                        {/* Transportability Decision Toggle */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-muted">Transportabilité :</span>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                className={`btn btn-xs ${isTransportable ? 'btn-success text-white' : 'btn-ghost'}`}
                                onClick={() => handleToggleTransportability(idx, 'easily_transportable')}
                                style={{
                                  borderRadius: 9999,
                                  fontWeight: 700,
                                  fontSize: '0.72rem',
                                  padding: '3px 10px',
                                }}
                              >
                                <IconCheck size={12} />
                                <span>Facilement Transportable (Sacoche)</span>
                              </button>
                              <button
                                type="button"
                                className={`btn btn-xs ${!isTransportable ? 'btn-danger text-white' : 'btn-ghost'}`}
                                onClick={() => handleToggleTransportability(idx, 'bulky_refused')}
                                style={{
                                  borderRadius: 9999,
                                  fontWeight: 700,
                                  fontSize: '0.72rem',
                                  padding: '3px 10px',
                                }}
                              >
                                <IconWarning size={12} />
                                <span>Encombrant / Lourd (Refusé Chauffeurs)</span>
                              </button>
                            </div>
                          </div>

                          {/* Allocation Breakdown Badge */}
                          <div className="text-[11px] font-mono font-bold flex items-center gap-1.5">
                            <span className="text-muted">Allocation :</span>
                            <span className="text-emerald-400">1 Showroom</span>
                            <span className="text-muted">•</span>
                            <span className="text-purple-400">1 El Feth</span>
                            <span className="text-muted">•</span>
                            {isTransportable ? (
                              <span className="text-blue-400">{drivers.length} Chauffeurs</span>
                            ) : (
                              <span className="text-rose-400">0 Chauffeur (Exclu)</span>
                            )}
                          </div>
                        </div>

                        {/* Worker Evaluation Note Input */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted uppercase font-bold shrink-0">Avis Préparateur :</span>
                          <input
                            type="text"
                            className="input input-xs flex-1 text-xs"
                            value={cand.workerEvaluationNote || ''}
                            onChange={(e) => handleUpdateCandidateNote(idx, e.target.value)}
                            placeholder="Note de transportabilité..."
                            style={{ borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)' }}
                          />
                          <select
                            className="select select-xs text-[11px]"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) handleUpdateCandidateNote(idx, e.target.value);
                            }}
                            style={{ borderRadius: 8, width: 140 }}
                          >
                            <option value="">Presets note...</option>
                            {TRANSPORTABILITY_NOTE_PRESETS.map((note) => (
                              <option key={note} value={note}>
                                {note.slice(0, 32)}...
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Big Primary Action: Generate Sample Allocations */}
              {candidates.length > 0 && (
                <div
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    padding: '12px 0 0 0',
                    background: 'linear-gradient(180deg, rgba(18,20,26,0) 0%, rgba(18,20,26,0.95) 40%, #12141a 100%)',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-primary w-full flex items-center justify-center gap-2"
                    style={{
                      minHeight: 48,
                      borderRadius: 16,
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)',
                    }}
                    onClick={handleGenerateSamples}
                  >
                    <IconSparkles size={18} />
                    <span>
                      Générer & Enregistrer les Échantillons (1 Showroom + 1 El Feth + Chauffeurs Éligibles)
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MALLETTES CHAUFFEURS */}
          {activeTab === 'chauffeur_kits' && (
            <div className="flex flex-col gap-4">
              {/* Driver Selector Pills */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    className={`btn btn-xs ${selectedDriver === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => {
                      setSelectedDriver('all');
                      hapticTap('selection');
                    }}
                    style={{ borderRadius: 9999, fontWeight: 700 }}
                  >
                    Tous les Chauffeurs ({samples.filter((s) => s.destination === 'agent_tourner').length})
                  </button>
                  {drivers.map((drv) => {
                    const count = samples.filter((s) => s.destination === 'agent_tourner' && s.assignedAgentName === drv).length;
                    return (
                      <button
                        key={drv}
                        type="button"
                        className={`btn btn-xs ${selectedDriver === drv ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => {
                          setSelectedDriver(drv);
                          hapticTap('selection');
                        }}
                        style={{ borderRadius: 9999, fontWeight: 700 }}
                      >
                        <IconUser size={11} />
                        <span>{drv} ({count})</span>
                      </button>
                    );
                  })}
                </div>

                {selectedDriver !== 'all' && (
                  <button
                    type="button"
                    className="btn btn-xs btn-outline flex items-center gap-1"
                    onClick={() => handleCopyDriverManifest(selectedDriver)}
                    style={{ borderRadius: 10, fontWeight: 700 }}
                  >
                    <IconClipboardCheck size={12} />
                    <span>Feuille Tournée WhatsApp ({selectedDriver})</span>
                  </button>
                )}
              </div>

              {/* Samples List for Driver */}
              {filteredChauffeurSamples.length === 0 ? (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    borderRadius: 16,
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    color: 'var(--muted)',
                  }}
                >
                  <IconTruck size={32} className="mx-auto mb-2 opacity-40 text-blue-400" />
                  <div className="font-bold text-sm text-white">Aucun échantillon alloué</div>
                  <div className="text-xs mt-1">
                    Générez des échantillons depuis l'onglet "Arrivage & Échantillonnage" pour garnir les mallettes des chauffeurs.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {filteredChauffeurSamples.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 16,
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-sm text-white">{s.reference}</span>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                padding: '2px 8px',
                                borderRadius: 9999,
                                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                color: '#60a5fa',
                                fontWeight: 700,
                              }}
                            >
                              Chauffeur : {s.assignedAgentName}
                            </span>
                            {s.elFethRetailPrice && (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '2px 8px',
                                  borderRadius: 9999,
                                  backgroundColor: 'rgba(168, 85, 247, 0.15)',
                                  color: '#c084fc',
                                  fontWeight: 700,
                                }}
                              >
                                Tarif El Feth : {s.elFethRetailPrice} DA
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-white/90 mt-0.5">{s.designation}</div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className={`btn btn-xs ${s.status === 'given_to_agent' ? 'btn-success' : 'btn-ghost'}`}
                            onClick={() => handleUpdateStatus(s, s.status === 'given_to_agent' ? 'allocated' : 'given_to_agent')}
                            style={{ borderRadius: 8, fontWeight: 700, fontSize: '0.72rem' }}
                          >
                            <IconBag size={11} />
                            <span>{s.status === 'given_to_agent' ? 'En Sacoche' : 'Remettre'}</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-circle text-muted hover:text-danger"
                            onClick={async () => {
                              if (s.id) {
                                await deleteProductSample(s.id);
                                refreshData();
                              }
                            }}
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Feedback Notes */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs">
                        <div className="text-muted flex items-center gap-1.5 truncate">
                          <IconTag size={12} className="text-accent shrink-0" />
                          <span className="truncate">
                            {s.agentVendorFeedback
                              ? `Retour librairies : ${s.agentVendorFeedback}`
                              : 'Aucun retour client enregistré'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="text-[11px] text-accent hover:underline shrink-0"
                          onClick={() => {
                            setFeedbackEditingId(s.id || null);
                            setAgentFeedbackText(s.agentVendorFeedback || '');
                          }}
                        >
                          {s.agentVendorFeedback ? 'Modifier avis' : '+ Noter retour librairie'}
                        </button>
                      </div>

                      {/* Inline Feedback Editor */}
                      {feedbackEditingId === s.id && (
                        <div className="flex gap-2 pt-1">
                          <input
                            type="text"
                            className="input input-xs flex-1 text-xs"
                            placeholder="Ex: Librairie El Manar veut 5 cartons pour samedi..."
                            value={agentFeedbackText}
                            onChange={(e) => setAgentFeedbackText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveDriverFeedback(s)}
                            style={{ borderRadius: 8 }}
                          />
                          <button
                            type="button"
                            className="btn btn-xs btn-primary"
                            onClick={() => handleSaveDriverFeedback(s)}
                            style={{ borderRadius: 8 }}
                          >
                            Sauvegarder
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            onClick={() => setFeedbackEditingId(null)}
                            style={{ borderRadius: 8 }}
                          >
                            Annuler
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TARIFICATION LIBRAIRIE EL FETH */}
          {activeTab === 'el_feth_pricing' && (
            <div className="flex flex-col gap-4">
              {/* Partner Banner */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div className="font-extrabold text-sm text-purple-300 flex items-center gap-2">
                    <IconTrendingUp size={16} />
                    <span>Librairie El Feth • Partenaire Référent & Décision Prix</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    El Feth teste la qualité des articles et définit les prix de vente conseillés (Gros & Public) pour le réseau.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-primary flex items-center gap-1"
                  onClick={handleCopyElFethManifest}
                  style={{ borderRadius: 10, fontWeight: 700 }}
                >
                  <IconClipboardCheck size={12} />
                  <span>Partager Bordereau El Feth</span>
                </button>
              </div>

              {/* El Feth Samples Grid */}
              {elFethSamples.length === 0 ? (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    borderRadius: 16,
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    color: 'var(--muted)',
                  }}
                >
                  <IconTrendingUp size={32} className="mx-auto mb-2 opacity-40 text-purple-400" />
                  <div className="font-bold text-sm text-white">Aucun article alloué pour El Feth</div>
                  <div className="text-xs mt-1">
                    Chaque nouvel arrivage génère automatiquement 1 échantillon dédié pour la Librairie El Feth.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {elFethSamples.map((s) => {
                    const isPriced = s.elFethRetailPrice !== null && s.elFethRetailPrice !== undefined;
                    return (
                      <div
                        key={s.id}
                        style={{
                          padding: '14px 16px',
                          borderRadius: 16,
                          backgroundColor: isPriced ? 'rgba(168, 85, 247, 0.04)' : 'rgba(255, 255, 255, 0.03)',
                          border: isPriced
                            ? '1px solid rgba(168, 85, 247, 0.25)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-extrabold text-sm text-white">{s.reference}</span>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '2px 8px',
                                  borderRadius: 9999,
                                  backgroundColor: isPriced ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: isPriced ? 'var(--accent)' : 'var(--warning)',
                                  fontWeight: 700,
                                }}
                              >
                                {isPriced ? 'Prix Fixé' : 'En Attente Avis El Feth'}
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-white/90 mt-0.5">{s.designation}</div>
                          </div>

                          <button
                            type="button"
                            className="btn btn-xs btn-outline flex items-center gap-1"
                            onClick={() => {
                              setEditingElFethId(s.id || null);
                              setElFethWholesale(s.elFethWholesalePrice ? String(s.elFethWholesalePrice) : '');
                              setElFethRetail(s.elFethRetailPrice ? String(s.elFethRetailPrice) : '');
                              setElFethNote(s.elFethMarketNote || '');
                            }}
                            style={{ borderRadius: 8, fontWeight: 700 }}
                          >
                            <IconPencil size={11} />
                            <span>{isPriced ? 'Modifier Tarifs' : 'Fixer Tarifs'}</span>
                          </button>
                        </div>

                        {/* Current Pricing Badges */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center">
                          <div
                            style={{
                              padding: '6px 10px',
                              borderRadius: 10,
                              backgroundColor: 'rgba(0,0,0,0.3)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <div className="text-[10px] text-muted uppercase font-bold">Prix de Gros Conseillé</div>
                            <div className="font-mono font-extrabold text-xs text-white">
                              {s.elFethWholesalePrice ? `${s.elFethWholesalePrice} DA` : 'Non défini'}
                            </div>
                          </div>
                          <div
                            style={{
                              padding: '6px 10px',
                              borderRadius: 10,
                              backgroundColor: 'rgba(168, 85, 247, 0.1)',
                              border: '1px solid rgba(168, 85, 247, 0.2)',
                            }}
                          >
                            <div className="text-[10px] text-purple-300 uppercase font-bold">Prix Détail / Public Conseillé</div>
                            <div className="font-mono font-extrabold text-xs text-purple-200">
                              {s.elFethRetailPrice ? `${s.elFethRetailPrice} DA` : 'Non défini'}
                            </div>
                          </div>
                          <div
                            className="col-span-2 md:col-span-1"
                            style={{
                              padding: '6px 10px',
                              borderRadius: 10,
                              backgroundColor: 'rgba(0,0,0,0.3)',
                              border: '1px solid rgba(255,255,255,0.06)',
                              textAlign: 'left',
                            }}
                          >
                            <div className="text-[10px] text-muted uppercase font-bold">Avis Marché El Feth</div>
                            <div className="text-xs text-white truncate">
                              {s.elFethMarketNote || 'En attente d\'avis...'}
                            </div>
                          </div>
                        </div>

                        {/* Pricing Edit Form */}
                        {editingElFethId === s.id && (
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 12,
                              backgroundColor: 'rgba(0,0,0,0.4)',
                              border: '1px solid rgba(168, 85, 247, 0.3)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                            }}
                          >
                            <div className="font-bold text-xs text-purple-300 flex items-center gap-1.5">
                              <IconTag size={13} />
                              <span>Enregistrement des Tarifs & Recommandations El Feth</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-muted uppercase font-bold block mb-0.5">
                                  Prix de Gros (DA)
                                </label>
                                <input
                                  type="number"
                                  className="input input-sm w-full font-mono font-bold"
                                  placeholder="Ex: 240"
                                  value={elFethWholesale}
                                  onChange={(e) => setElFethWholesale(e.target.value)}
                                  style={{ borderRadius: 8 }}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted uppercase font-bold block mb-0.5">
                                  Prix Public / Détail Conseillé (DA)
                                </label>
                                <input
                                  type="number"
                                  className="input input-sm w-full font-mono font-bold"
                                  placeholder="Ex: 350"
                                  value={elFethRetail}
                                  onChange={(e) => setElFethRetail(e.target.value)}
                                  style={{ borderRadius: 8 }}
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] text-muted uppercase font-bold block mb-0.5">
                                Avis & Potentiel Commercial (Rentrée Scolaire / Qualité)
                              </label>
                              <input
                                type="text"
                                className="input input-sm w-full text-xs"
                                placeholder="Ex: Excellente finition, forte demande anticipée chez les librairies"
                                value={elFethNote}
                                onChange={(e) => setElFethNote(e.target.value)}
                                style={{ borderRadius: 8 }}
                              />
                            </div>

                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost"
                                onClick={() => setEditingElFethId(null)}
                                style={{ borderRadius: 8 }}
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-primary flex items-center gap-1"
                                onClick={() => handleSaveElFethReview(s)}
                                style={{ borderRadius: 8, fontWeight: 700 }}
                              >
                                <IconCheck size={12} />
                                <span>Valider Tarifs & Diffuser</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VITRINE SHOWROOM */}
          {activeTab === 'showroom' && (
            <div className="flex flex-col gap-4">
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                <div className="font-extrabold text-sm text-emerald-300 flex items-center gap-2">
                  <IconStore size={16} />
                  <span>Vitrine Showroom Dépôt • Échantillons Physiques Permanents</span>
                </div>
                <div className="text-xs text-muted mt-0.5">
                  1 exemplaire physique de chaque référence arrivage est conservé en vitrine au dépôt central pour démonstration aux clients en visite directe.
                </div>
              </div>

              {showroomSamples.length === 0 ? (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    borderRadius: 16,
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    color: 'var(--muted)',
                  }}
                >
                  <IconStore size={32} className="mx-auto mb-2 opacity-40 text-emerald-400" />
                  <div className="font-bold text-sm text-white">Aucun échantillon en vitrine pour l'instant</div>
                  <div className="text-xs mt-1">
                    Générez des échantillons depuis l'onglet "Arrivage & Échantillonnage" pour garnir le showroom.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {showroomSamples.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-extrabold text-sm text-white">{s.reference}</span>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '2px 8px',
                            borderRadius: 9999,
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: 'var(--accent)',
                            fontWeight: 700,
                          }}
                        >
                          En Vitrine Dépôt
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white/90">{s.designation}</div>
                      <div className="text-[11px] text-muted flex items-center justify-between pt-2 border-t border-white/5">
                        <span>Quantité : 1 pièce</span>
                        {s.elFethRetailPrice ? (
                          <span className="font-mono font-bold text-purple-300">
                            Conseillé : {s.elFethRetailPrice} DA
                          </span>
                        ) : (
                          <span className="italic">Prix en cours</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
