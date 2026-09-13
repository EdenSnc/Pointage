// ============================================================
// POINTAGE — Inbound Truck / Container Unloading (Déchargement Quai)
// Amazon-Style Worker Dispatch & Damaged Goods Tracking
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { db } from './db';
import type { DechargementSession, DechargementStatus } from './types';
import { loadOperatorsRoster, getActiveOperator } from './operators';
import { playDockAlertTone, playSuccessChime, playWarningBeep, hapticTap } from './audio';
import {
  IconTruck,
  IconX,
  IconCheck,
  IconCamera,
  IconPlus,
  IconWarning,
  IconMegaphone,
  IconPhone,
  IconBox,
  IconHistory,
  IconBell,
  IconBuilding,
  IconMapPin,
  IconUsers,
  IconAlertTriangle,
} from './icons';

interface DechargementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

const DOCK_OPTIONS = [
  'Quai 1 (Principal)',
  'Quai 2',
  'Cour Extérieure',
  'Entrée Dépôt',
  'Zone Tampon Réception',
];

export const DechargementModal: React.FC<DechargementModalProps> = ({
  isOpen,
  onClose,
  onToast,
}) => {
  const [sessions, setSessions] = useState<DechargementSession[]>([]);
  const [activeSession, setActiveSession] = useState<DechargementSession | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'new' | 'history'>('current');
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 640 : false));

  // New session form states
  const [title, setTitle] = useState('');
  const [truckPlate, setTruckPlate] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [containerNumber, setContainerNumber] = useState('');
  const [dockZone, setDockZone] = useState(DOCK_OPTIONS[0]);
  const [estimatedCartons, setEstimatedCartons] = useState<number>(100);
  const [palletsCount, setPalletsCount] = useState<number>(0);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  // Amazon-style worker dispatch call modal state
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [broadcastToAll, setBroadcastToAll] = useState(true);
  const [customCallMessage, setCustomCallMessage] = useState('');

  const damagePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const roster = loadOperatorsRoster();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadSessions = async () => {
    try {
      const all = await db.dechargementSessions.toArray();
      // Sort newest first
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSessions(all);

      // Look for ongoing / arrived session
      const ongoing = all.find((s) => s.status === 'in_progress' || s.status === 'arrived');
      if (ongoing) {
        setActiveSession(ongoing);
        setActiveTab('current');
      } else if (all.length > 0) {
        setActiveSession(all[0]);
      }
    } catch (e) {
      console.error('Failed to load dechargement sessions', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
      // Request notification permission if not yet granted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      onToast('Veuillez préciser un titre ou fournisseur pour la réception');
      return;
    }

    const now = new Date().toISOString();
    const newSession: DechargementSession = {
      title: title.trim(),
      truckPlate: truckPlate.trim() || null,
      carrierName: carrierName.trim() || null,
      supplierName: supplierName.trim() || null,
      containerNumber: containerNumber.trim() || null,
      dockZone,
      status: 'in_progress',
      estimatedCartons: Number(estimatedCartons) || 0,
      unloadedCartons: 0,
      damagedCartons: 0,
      palletsCount: palletsCount > 0 ? palletsCount : null,
      assignedWorkers: selectedWorkers,
      broadcastToAll: false,
      damagePhotos: [],
      notes: notes.trim() || null,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const id = await db.dechargementSessions.add(newSession);
    newSession.id = id;

    playSuccessChime();
    onToast(`Réception lancée : ${newSession.title} au ${newSession.dockZone}`);
    setActiveSession(newSession);
    setActiveTab('current');
    loadSessions();

    // Reset form
    setTitle('');
    setTruckPlate('');
    setCarrierName('');
    setSupplierName('');
    setContainerNumber('');
    setEstimatedCartons(100);
    setPalletsCount(0);
    setSelectedWorkers([]);
    setNotes('');
  };

  const handleAdjustCount = async (delta: number) => {
    if (!activeSession?.id) return;
    const current = activeSession.unloadedCartons || 0;
    const updatedCount = Math.max(0, current + delta);

    hapticTap(delta > 0 ? 'light' : 'medium');
    playSuccessChime();

    await db.dechargementSessions.update(activeSession.id, {
      unloadedCartons: updatedCount,
      updatedAt: new Date().toISOString(),
    });

    setActiveSession((prev) => (prev ? { ...prev, unloadedCartons: updatedCount } : null));
  };

  const handleAdjustDamaged = async (delta: number) => {
    if (!activeSession?.id) return;
    const current = activeSession.damagedCartons || 0;
    const updatedDamaged = Math.max(0, current + delta);

    playWarningBeep();

    await db.dechargementSessions.update(activeSession.id, {
      damagedCartons: updatedDamaged,
      updatedAt: new Date().toISOString(),
    });

    setActiveSession((prev) => (prev ? { ...prev, damagedCartons: updatedDamaged } : null));
    onToast(`Avarie mise à jour : ${updatedDamaged} carton(s) abîmé(s)`);
  };

  const handleDamagePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSession?.id) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxDim = 900;
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);

        const currentPhotos = activeSession.damagePhotos || [];
        const newPhotos = [...currentPhotos, dataUrl];
        const newDamagedCount = Math.max(activeSession.damagedCartons || 0, newPhotos.length);

        await db.dechargementSessions.update(activeSession.id!, {
          damagePhotos: newPhotos,
          damagedCartons: newDamagedCount,
          updatedAt: new Date().toISOString(),
        });

        setActiveSession((prev) =>
          prev ? { ...prev, damagePhotos: newPhotos, damagedCartons: newDamagedCount } : null
        );
        onToast('Photo de litige carton abîmé enregistrée');
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Amazon-Style Worker Dispatch Call
  const handleDispatchWorkerCall = async () => {
    if (!activeSession?.id) return;

    playDockAlertTone();

    const now = new Date().toISOString();
    await db.dechargementSessions.update(activeSession.id, {
      lastBroadcastAt: now,
      broadcastToAll,
      assignedWorkers: broadcastToAll ? ['Tous'] : selectedWorkers,
      updatedAt: now,
    });

    // Native browser push notification
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`APPEL DÉCHARGEMENT : ${activeSession.dockZone}`, {
          body: `${activeSession.title} (${activeSession.truckPlate || 'Camion'}). Présentez-vous immédiatement au quai !`,
          icon: '/favicon.ico',
        });
      } catch {}
    }

    // In-app custom event so top-level app shows active alert banner
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dock-worker-call', {
          detail: {
            sessionId: activeSession.id,
            title: activeSession.title,
            dockZone: activeSession.dockZone,
            truckPlate: activeSession.truckPlate,
            targetAudience: broadcastToAll ? 'all' : selectedWorkers,
            timestamp: now,
          },
        })
      );
    }

    setShowDispatchModal(false);
    onToast(`Appel déchargement diffusé aux équipes pour le ${activeSession.dockZone}`);
    setActiveSession((prev) => (prev ? { ...prev, lastBroadcastAt: now, broadcastToAll } : null));
  };

  const getWhatsAppDispatchUrl = () => {
    if (!activeSession) return '';
    const teamText = broadcastToAll
      ? 'TOUS LES PRÉPARATEURS & MANUTENTIONNAIRES'
      : selectedWorkers.join(', ') || 'Équipe Quai';
    const text = `*APPEL DÉCHARGEMENT QUAI (URGENT)*\n• Emplacement : ${activeSession.dockZone}\n• Arrivage : ${activeSession.title} (${activeSession.truckPlate || 'Camion'})\n• Équipe appelée : ${teamText}\n• Cartons prévus : ~${activeSession.estimatedCartons}\n${customCallMessage ? `• Consigne : ${customCallMessage}\n` : ''}→ Merci de vous présenter immédiatement au quai pour la descente.`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const handleCompleteSession = async () => {
    if (!activeSession?.id) return;
    const now = new Date().toISOString();
    await db.dechargementSessions.update(activeSession.id, {
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    });

    playSuccessChime();
    onToast(`Déchargement clôturé avec succès (${activeSession.unloadedCartons} cartons descendus)`);
    setActiveSession((prev) => (prev ? { ...prev, status: 'completed', completedAt: now } : null));
    loadSessions();
  };

  const getWhatsAppReportUrl = () => {
    if (!activeSession) return '';
    const text = `*RAPPORT DE RÉCEPTION / DÉCHARGEMENT QUAI*\n• Quai : ${activeSession.dockZone}\n• Arrivage : ${activeSession.title}\n• Matricule : ${activeSession.truckPlate || 'N/A'}\n• Transporteur : ${activeSession.carrierName || 'N/A'}\n• Fournisseur : ${activeSession.supplierName || 'N/A'}\n• Cartons déchargés : ${activeSession.unloadedCartons} / ${activeSession.estimatedCartons} (${activeSession.estimatedCartons > 0 ? Math.round((activeSession.unloadedCartons / activeSession.estimatedCartons) * 100) : 100}%)\n• Cartons abîmés : ${activeSession.damagedCartons} ${activeSession.damagePhotos && activeSession.damagePhotos.length > 0 ? `(${activeSession.damagePhotos.length} photos enregistrées)` : ''}\n• Équipe : ${activeSession.assignedWorkers?.join(', ') || 'Équipe dépôt'}\n• Statut : Clôturé le ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const percentComplete =
    activeSession && activeSession.estimatedCartons > 0
      ? Math.min(100, Math.round((activeSession.unloadedCartons / activeSession.estimatedCartons) * 100))
      : 0;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 965,
        display: 'flex',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 540,
          height: isMobile ? '100%' : 'auto',
          maxHeight: isMobile ? '100vh' : '92vh',
          borderRadius: isMobile ? 0 : 24,
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: isMobile ? 'none' : '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
          padding: isMobile ? '16px 14px' : 22,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                background: 'rgba(59, 130, 246, 0.16)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
                flexShrink: 0,
              }}
            >
              <IconTruck size={24} />
            </div>
            <div>
              <div className="font-extrabold text-sm flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <span>Déchargement Quai & Réception Inbound</span>
              </div>
              <div className="text-xs text-muted">
                Pointage descente camion • Constat avaries • Appel manutentionnaires
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-icon"
            style={{ borderRadius: 9999 }}
            onClick={onClose}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          className="flex gap-1 mb-3 p-1"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 9999,
          }}
        >
          <button
            type="button"
            className={`btn btn-xs flex-1 ${activeTab === 'current' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 9999, fontSize: '0.76rem', padding: '6px 8px' }}
            onClick={() => setActiveTab('current')}
          >
            Déchargement en cours
          </button>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${activeTab === 'new' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 9999, fontSize: '0.76rem', padding: '6px 8px' }}
            onClick={() => setActiveTab('new')}
          >
            + Nouvelle Arrivée
          </button>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 9999, fontSize: '0.76rem', padding: '6px 8px' }}
            onClick={() => setActiveTab('history')}
          >
            Historique ({sessions.length})
          </button>
        </div>

        {/* TAB 1: CURRENT DECHARGEMENT CONSOLE */}
        {activeTab === 'current' && (
          <div className="flex flex-col gap-3">
            {activeSession ? (
              <>
                {/* Active Session Info Card */}
                <div
                  className="card p-3"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-base text-accent">
                        {activeSession.title}
                      </div>
                      <div className="text-xs font-semibold text-muted mt-0.5 flex items-center gap-1">
                        <IconMapPin size={12} className="text-accent shrink-0" />
                        <span>{activeSession.dockZone} • {activeSession.truckPlate ? `Immat: ${activeSession.truckPlate}` : 'Camion non immatriculé'}</span>
                      </div>
                      {activeSession.supplierName && (
                        <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                          <IconBuilding size={11} className="shrink-0" />
                          <span>Provenance: {activeSession.supplierName}</span>
                        </div>
                      )}
                    </div>
                    <span
                      className="badge font-bold uppercase"
                      style={{
                        background:
                          activeSession.status === 'completed'
                            ? 'rgba(16, 185, 129, 0.2)'
                            : 'rgba(59, 130, 246, 0.2)',
                        color: activeSession.status === 'completed' ? 'var(--accent)' : '#60a5fa',
                      }}
                    >
                      {activeSession.status === 'completed' ? 'Terminé' : 'En cours'}
                    </span>
                  </div>

                  {/* Amazon-Style Appel Déchargement Button */}
                  <div className="mt-3 pt-2 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--glass-border-subtle)' }}>
                    <button
                      type="button"
                      className="btn btn-sm flex-1 flex items-center justify-center gap-2 font-extrabold text-xs"
                      style={{
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#000',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
                      }}
                      onClick={() => setShowDispatchModal(true)}
                    >
                      <IconMegaphone size={16} />
                      <span>Appel Déchargement Quai</span>
                    </button>
                  </div>
                </div>

                {/* Big Visual Tally Counter */}
                <div
                  className="card p-4 flex flex-col items-center justify-center text-center"
                  style={{
                    background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(0, 0, 0, 0.2) 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 20,
                  }}
                >
                  <span className="text-xs font-extrabold uppercase tracking-wider text-accent mb-1">
                    Cartons Descendus du Camion
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span style={{ fontSize: '3.2rem', fontWeight: 900, lineHeight: 1, color: 'var(--text-primary)' }}>
                      {activeSession.unloadedCartons}
                    </span>
                    <span className="text-xl font-bold text-muted">
                      / {activeSession.estimatedCartons || '?'}
                    </span>
                  </div>

                  {/* Progress Gauge */}
                  <div
                    style={{
                      width: '100%',
                      height: 10,
                      background: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: 9999,
                      overflow: 'hidden',
                      marginTop: 10,
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${percentComplete}%`,
                        background: percentComplete >= 100 ? 'var(--accent)' : '#3b82f6',
                        borderRadius: 9999,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <div className="text-[11px] font-bold text-muted mt-1.5">
                    {percentComplete}% du chargement descendu
                  </div>

                  {/* Rapid Increment Keypad Buttons */}
                  <div className="flex items-center gap-2 mt-4 w-full">
                    <button
                      type="button"
                      className="btn btn-secondary flex-1 font-extrabold text-sm"
                      style={{ borderRadius: 14, minHeight: 46 }}
                      onClick={() => handleAdjustCount(-1)}
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary flex-2 font-black text-lg"
                      style={{ borderRadius: 14, minHeight: 46, flex: 2 }}
                      onClick={() => handleAdjustCount(1)}
                    >
                      +1 Carton
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary flex-1 font-bold text-sm"
                      style={{ borderRadius: 14, minHeight: 46 }}
                      onClick={() => handleAdjustCount(5)}
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary flex-1 font-bold text-sm"
                      style={{ borderRadius: 14, minHeight: 46 }}
                      onClick={() => handleAdjustCount(10)}
                    >
                      +10
                    </button>
                  </div>
                </div>

                {/* Damaged Cartons & Quality Inspection */}
                <div
                  className="card p-3"
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.28)',
                    borderRadius: 16,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-danger">
                      <IconWarning size={16} />
                      <span>Cartons Abîmés / Écrasés (Litige Fournisseur)</span>
                    </div>
                    <span className="badge badge-danger font-extrabold">
                      {activeSession.damagedCartons || 0} abîmé(s)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-xs btn-outline text-danger flex-1"
                      style={{ borderRadius: 10, borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      onClick={() => handleAdjustDamaged(1)}
                    >
                      +1 Carton Abîmé
                    </button>
                    {activeSession.damagedCartons > 0 && (
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost text-muted"
                        onClick={() => handleAdjustDamaged(-1)}
                      >
                        -1
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary flex items-center gap-1.5 font-bold"
                      style={{ borderRadius: 10 }}
                      onClick={() => damagePhotoInputRef.current?.click()}
                    >
                      <IconCamera size={14} />
                      <span>+ Photo Avarie</span>
                    </button>
                    <input
                      ref={damagePhotoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={handleDamagePhotoUpload}
                    />
                  </div>

                  {/* Damaged Photos Gallery */}
                  {activeSession.damagePhotos && activeSession.damagePhotos.length > 0 && (
                    <div className="flex gap-2 mt-2.5 overflow-x-auto no-scrollbar pt-1">
                      {activeSession.damagePhotos.map((p, idx) => (
                        <div
                          key={idx}
                          style={{
                            width: 60,
                            height: 60,
                            borderRadius: 10,
                            overflow: 'hidden',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            flexShrink: 0,
                          }}
                        >
                          <img src={p} alt={`Avarie ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Finish & WhatsApp Report Actions */}
                <div className="flex items-center gap-2 mt-2">
                  {activeSession.status !== 'completed' ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-success flex-1 font-bold flex items-center justify-center gap-1.5"
                      style={{ borderRadius: 14, padding: '10px 14px' }}
                      onClick={handleCompleteSession}
                    >
                      <IconCheck size={16} />
                      <span>Clôturer Réception</span>
                    </button>
                  ) : (
                    <div className="text-xs font-bold text-accent text-center flex-1 inline-flex items-center justify-center gap-1.5">
                      <IconCheck size={14} />
                      <span>Réception terminée</span>
                    </div>
                  )}

                  <a
                    href={getWhatsAppReportUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-secondary flex items-center gap-1 font-bold text-xs"
                    style={{ borderRadius: 14, padding: '10px 14px' }}
                  >
                    <span>Partager Rapport WhatsApp</span>
                  </a>
                </div>
              </>
            ) : (
              <div className="text-center p-8 text-muted">
                <IconBox size={40} style={{ opacity: 0.4, margin: '0 auto 10px' }} />
                <div className="font-bold text-sm">Aucun déchargement actif</div>
                <div className="text-xs mt-1">Créez une nouvelle arrivée pour commencer le pointage quai.</div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary mt-3 font-bold"
                  style={{ borderRadius: 9999 }}
                  onClick={() => setActiveTab('new')}
                >
                  + Enregistrer une arrivée camion
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: NEW INBOUND TRUCK ARRIVAL */}
        {activeTab === 'new' && (
          <form onSubmit={handleCreateSession} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">
                Intitulé / Fournisseur (ex: Arrivage Alger, Conteneur Chine)*
              </label>
              <input
                type="text"
                className="input input-sm w-full"
                style={{ borderRadius: 12 }}
                placeholder="Ex: Semi 40T Usine Alger ou Conteneur 40ft"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Matricule Camion</label>
                <input
                  type="text"
                  className="input input-sm w-full"
                  style={{ borderRadius: 12 }}
                  placeholder="Ex: 04561-124-16"
                  value={truckPlate}
                  onChange={(e) => setTruckPlate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Quai d'affectation</label>
                <select
                  className="input input-sm w-full"
                  style={{ borderRadius: 12 }}
                  value={dockZone}
                  onChange={(e) => setDockZone(e.target.value)}
                >
                  {DOCK_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Transporteur / Chauffeur</label>
                <input
                  type="text"
                  className="input input-sm w-full"
                  style={{ borderRadius: 12 }}
                  placeholder="Ex: Transporteur Mourad"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">N° Conteneur (si maritime)</label>
                <input
                  type="text"
                  className="input input-sm w-full"
                  style={{ borderRadius: 12 }}
                  placeholder="Ex: MSCU-984210-4"
                  value={containerNumber}
                  onChange={(e) => setContainerNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Nb Cartons prévus</label>
                <input
                  type="number"
                  className="input input-sm w-full"
                  style={{ borderRadius: 12 }}
                  value={estimatedCartons}
                  onChange={(e) => setEstimatedCartons(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Palettes (optionnel)</label>
                <input
                  type="number"
                  className="input input-sm w-full"
                  style={{ borderRadius: 12 }}
                  value={palletsCount}
                  onChange={(e) => setPalletsCount(Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-muted mb-1 block">
                Équipe quai assignée (sélectionner préparateurs)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {roster.map((op) => {
                  const isChecked = selectedWorkers.includes(op);
                  return (
                    <button
                      key={op}
                      type="button"
                      className={`btn btn-xs ${isChecked ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ borderRadius: 9999, fontSize: '0.72rem', padding: '4px 10px' }}
                      onClick={() => {
                        setSelectedWorkers((prev) =>
                          prev.includes(op) ? prev.filter((w) => w !== op) : [...prev, op]
                        );
                      }}
                    >
                      {isChecked ? (
                        <span className="inline-flex items-center gap-1">
                          <IconCheck size={11} />
                          <span>{op}</span>
                        </span>
                      ) : (
                        op
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-muted mb-1 block">Notes / Instructions particulières</label>
              <input
                type="text"
                className="input input-sm w-full"
                style={{ borderRadius: 12 }}
                placeholder="Ex: Décharger d'abord les gros cartons, ranger en Chambre Nord..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn btn-sm btn-primary font-bold mt-2"
              style={{ borderRadius: 14, padding: '10px' }}
            >
              Lancer le déchargement quai
            </button>
          </form>
        )}

        {/* TAB 3: HISTORY */}
        {activeTab === 'history' && (
          <div className="flex flex-col gap-2">
            {sessions.length === 0 ? (
              <div className="text-center p-6 text-muted text-xs">Aucune réception archivée</div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="p-3 card flex items-center justify-between gap-2"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                  }}
                >
                  <div>
                    <div className="font-bold text-xs">{s.title}</div>
                    <div className="text-[11px] text-muted">
                      {s.dockZone} • {s.unloadedCartons}/{s.estimatedCartons} cartons •{' '}
                      {s.damagedCartons > 0 ? (
                        <span className="text-danger font-bold">{s.damagedCartons} abîmés</span>
                      ) : (
                        <span className="text-accent">0 avarie</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted">
                      {new Date(s.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    style={{ borderRadius: 9999 }}
                    onClick={() => {
                      setActiveSession(s);
                      setActiveTab('current');
                    }}
                  >
                    Ouvrir
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Amazon-Style Worker Dispatch Call Modal */}
      {showDispatchModal && activeSession && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            zIndex: 990,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="card p-4"
            style={{
              maxWidth: 420,
              width: '100%',
              borderRadius: 20,
              backgroundColor: 'var(--bg-surface)',
              border: '2px solid #f59e0b',
            }}
          >
            <div className="flex items-center gap-2 mb-2 font-black text-amber-500 text-sm uppercase tracking-wider">
              <IconMegaphone size={20} />
              <span>Appel Déchargement Quai</span>
            </div>
            <div className="text-xs text-muted mb-3">
              Déclenche une sirène quai, une alerte vibration et une notification à tous les préparateurs pour converger vers le quai.
            </div>

            <div className="p-2.5 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold flex items-center gap-1">
              <IconMapPin size={13} className="text-amber-500 shrink-0" />
              <span>Destination : {activeSession.dockZone} • {activeSession.title}</span>
            </div>

            <div className="mb-3">
              <label className="text-xs font-bold text-muted mb-1 block">Destinataires :</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`btn btn-xs flex-1 inline-flex items-center justify-center gap-1 ${broadcastToAll ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ borderRadius: 9999 }}
                  onClick={() => setBroadcastToAll(true)}
                >
                  <IconMegaphone size={12} />
                  <span>Tout le dépôt</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-xs flex-1 inline-flex items-center justify-center gap-1 ${!broadcastToAll ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ borderRadius: 9999 }}
                  onClick={() => setBroadcastToAll(false)}
                >
                  <IconUsers size={12} />
                  <span>Équipe choisie</span>
                </button>
              </div>
            </div>

            {!broadcastToAll && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-1">
                  {roster.map((op) => {
                    const checked = selectedWorkers.includes(op);
                    return (
                      <button
                        key={op}
                        type="button"
                        className={`btn btn-xs ${checked ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ borderRadius: 9999, fontSize: '0.7rem' }}
                        onClick={() => {
                          setSelectedWorkers((prev) =>
                            prev.includes(op) ? prev.filter((w) => w !== op) : [...prev, op]
                          );
                        }}
                      >
                        {checked ? (
                          <span className="inline-flex items-center gap-1">
                            <IconCheck size={11} />
                            <span>{op}</span>
                          </span>
                        ) : (
                          op
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 mt-4">
              <button
                type="button"
                className="btn btn-sm w-full font-black text-xs inline-flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#000',
                  borderRadius: 14,
                  padding: '12px',
                }}
                onClick={handleDispatchWorkerCall}
              >
                <IconBell size={16} />
                <span>Diffuser l'alerte maintenant</span>
              </button>

              <a
                href={getWhatsAppDispatchUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary w-full text-center font-bold text-xs"
                style={{ borderRadius: 14 }}
              >
                Envoyer au groupe WhatsApp dépôt
              </a>

              <button
                type="button"
                className="btn btn-xs btn-ghost text-muted mt-1"
                onClick={() => setShowDispatchModal(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
