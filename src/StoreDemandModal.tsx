import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { StoreDemand, StoreDemandSignalType } from './types';
import {
  IconX,
  IconPlus,
  IconShare,
  IconCamera,
  IconTrash,
  IconFlame,
  IconAlertTriangle,
  IconSparkles,
  IconPackage,
  IconCheck,
  IconChat,
  IconStore,
} from './icons';

interface StoreDemandModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClient?: string;
  knownClients?: string[];
  activeOperator?: string | null;
  onToast?: (msg: string) => void;
}

export const StoreDemandModal: React.FC<StoreDemandModalProps> = ({
  isOpen,
  onClose,
  initialClient,
  knownClients = [],
  activeOperator,
  onToast,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [client, setClient] = useState(initialClient || '');
  const [designation, setDesignation] = useState('');
  const [productReference, setProductReference] = useState('');
  const [signalType, setSignalType] = useState<StoreDemandSignalType>('high_demand');
  const [requestedQty, setRequestedQty] = useState('');
  const [note, setNote] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const demands = useLiveQuery(() => db.storeDemands.reverse().sortBy('createdAt'), []) || [];

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!designation.trim()) return;

    const now = new Date().toISOString();
    const newDemand: StoreDemand = {
      client: client.trim() || 'Surface non spécifiée',
      designation: designation.trim(),
      productReference: productReference.trim() || null,
      signalType,
      requestedQty: requestedQty ? parseInt(requestedQty, 10) : null,
      note: note.trim() || null,
      reportedBy: activeOperator || 'Vendeur / Dépôt',
      status: 'pending',
      imageUrl: imageUrl || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.storeDemands.add(newDemand);
    setIsAdding(false);
    setDesignation('');
    setProductReference('');
    setRequestedQty('');
    setNote('');
    setImageUrl(null);
    onToast?.('Remontée magasin enregistrée avec succès');
  };

  const handleUpdateStatus = async (id: number, status: StoreDemand['status']) => {
    await db.storeDemands.update(id, {
      status,
      updatedAt: new Date().toISOString(),
    });
    onToast?.(`Statut mis à jour : ${status}`);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Supprimer cette remontée ?')) {
      await db.storeDemands.delete(id);
      onToast?.('Remontée supprimée');
    }
  };

  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setImageUrl(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const filteredDemands = demands.filter((d) => {
    if (filterType !== 'all' && d.signalType !== filterType) return false;
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    return true;
  });

  const getSignalBadge = (type: StoreDemandSignalType) => {
    switch (type) {
      case 'high_demand':
        return { label: 'Forte Demande', icon: <IconFlame size={12} />, bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
      case 'out_of_stock':
        return { label: 'Rupture Urgente', icon: <IconAlertTriangle size={12} />, bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' };
      case 'model_request':
        return { label: 'Modèle Réclamé', icon: <IconSparkles size={12} />, bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' };
      case 'replenish_urgent':
        return { label: 'Réassort Immédiat', icon: <IconPackage size={12} />, bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' };
      default:
        return { label: 'Signal', icon: <IconSparkles size={12} />, bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280' };
    }
  };

  const handleShareWhatsApp = () => {
    if (filteredDemands.length === 0) return;
    let msg = `*REMONTÉES DE DEMANDE & RÉASSORT MAGASINS (SURFACE)*\n`;
    msg += `Date : ${new Date().toLocaleDateString('fr-FR')}\n`;
    msg += `------------------------------------\n\n`;

    filteredDemands.forEach((d, idx) => {
      const badge = getSignalBadge(d.signalType);
      msg += `${idx + 1}. *${d.client}*\n`;
      msg += `   Type : ${badge.label}\n`;
      msg += `   Article : *${d.designation}*${d.productReference ? ` (Réf: ${d.productReference})` : ''}\n`;
      if (d.requestedQty) msg += `   Qté souhaitée : ${d.requestedQty} pcs\n`;
      if (d.note) msg += `   Remarque vendeur : ${d.note}\n`;
      msg += `\n`;
    });

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 950,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(8px, 2vw, 16px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content card"
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-modal, 26px)',
          backdropFilter: 'var(--glass-blur)',
          padding: 'clamp(14px, 3vw, 20px)',
        }}
      >
        <div className="flex justify-between items-center mb-3.5">
          <h2 className="text-base font-bold flex items-center gap-2">
            <IconStore size={18} className="text-accent" />
            <span>Remontées Magasin</span>
            <span className="badge badge-exact text-xs">{demands.length}</span>
          </h2>
          <button className="btn btn-ghost btn-xs btn-icon" onClick={onClose} style={{ borderRadius: 9999 }}>
            <IconX size={16} />
          </button>
        </div>

        {/* Action bar: Add new & WhatsApp share */}
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            className={`btn btn-xs ${isAdding ? 'btn-secondary' : 'btn-primary'} flex items-center gap-1.5`}
            style={{ borderRadius: 9999, padding: '6px 14px', height: 34 }}
            onClick={() => setIsAdding(!isAdding)}
          >
            <IconPlus size={14} />
            <span>{isAdding ? 'Fermer' : 'Noter un besoin'}</span>
          </button>
          {filteredDemands.length > 0 && (
            <button
              type="button"
              className="btn btn-xs flex items-center gap-1.5 ml-auto"
              style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 9999, padding: '6px 12px', height: 34, fontWeight: 700 }}
              onClick={handleShareWhatsApp}
              title="Envoyer le récapitulatif par WhatsApp au commercial"
            >
              <IconShare size={13} />
              <span>Partager WhatsApp</span>
            </button>
          )}
        </div>

        {/* Add Form */}
        {isAdding && (
          <form
            onSubmit={handleSave}
            className="p-3 mb-4"
            style={{
              borderRadius: 14,
              background: 'var(--bg-card)',
              border: '1px solid var(--accent)',
            }}
          >
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>
              Nouveau signal vendeur
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] font-bold text-muted uppercase block mb-0.5">
                  Magasin / Surface *
                </label>
                <input
                  type="text"
                  required
                  list="known-clients-list"
                  className="input input-xs w-full"
                  placeholder="Ex: Uno, Nakhil..."
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                />
                <datalist id="known-clients-list">
                  {knownClients.map((c, i) => (
                    <option key={i} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted uppercase block mb-0.5">
                  Type de signal *
                </label>
                <select
                  className="input input-xs w-full"
                  value={signalType}
                  onChange={(e) => setSignalType(e.target.value as StoreDemandSignalType)}
                >
                  <option value="high_demand">Forte Demande</option>
                  <option value="out_of_stock">Rupture Urgente</option>
                  <option value="model_request">Modèle / Variante Réclamé</option>
                  <option value="replenish_urgent">Demande de Réassort</option>
                </select>
              </div>
            </div>

            <div className="mb-2">
              <label className="text-[10px] font-bold text-muted uppercase block mb-0.5">
                Désignation de l'article *
              </label>
              <input
                type="text"
                required
                className="input input-sm w-full"
                placeholder="Ex: Sac à dos 22L 4 MO ou Stylo Correcteur..."
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] font-bold text-muted uppercase block mb-0.5">
                  Réf / Code (Optionnel)
                </label>
                <input
                  type="text"
                  className="input input-xs w-full"
                  placeholder="Ex: 71662"
                  value={productReference}
                  onChange={(e) => setProductReference(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted uppercase block mb-0.5">
                  Quantité Souhaitée
                </label>
                <input
                  type="number"
                  min="1"
                  className="input input-xs w-full"
                  placeholder="Ex: 50 pcs"
                  value={requestedQty}
                  onChange={(e) => setRequestedQty(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-2">
              <label className="text-[10px] font-bold text-muted uppercase block mb-0.5">
                Remarque ou consigne du vendeur
              </label>
              <input
                type="text"
                className="input input-xs w-full"
                placeholder="Ex: Les clients demandent couleur noir, vendeur dit 2 cartons min..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {/* Photo capture */}
            <div className="flex items-center gap-3 mb-3">
              <label className="btn btn-xs btn-secondary flex items-center gap-1.5 cursor-pointer">
                <IconCamera size={13} />
                <span>{imageUrl ? 'Changer la photo' : 'Photo article / étiquette rayon'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  style={{ display: 'none' }}
                  onChange={handleImageCapture}
                />
              </label>
              {imageUrl && (
                <div className="relative">
                  <img
                    src={imageUrl}
                    alt="Aperçu"
                    style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--accent)' }}
                  />
                  <button
                    type="button"
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 text-[10px] flex items-center justify-center w-4 h-4 shadow-sm"
                    onClick={() => setImageUrl(null)}
                  >
                    <IconX size={10} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-xs btn-secondary flex-1"
                onClick={() => setIsAdding(false)}
              >
                Annuler
              </button>
              <button type="submit" className="btn btn-xs btn-primary flex-1 font-bold">
                Enregistrer la remontée
              </button>
            </div>
          </form>
        )}

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1.5 mb-2.5">
          <button
            type="button"
            className={`btn btn-xs ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.74rem', padding: '4px 10px', height: 28 }}
            onClick={() => setFilterType('all')}
          >
            Tous types
          </button>
          <button
            type="button"
            className={`btn btn-xs flex items-center gap-1 ${filterType === 'high_demand' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.74rem', padding: '4px 10px', height: 28 }}
            onClick={() => setFilterType('high_demand')}
          >
            <IconFlame size={12} />
            <span>Forte Demande</span>
          </button>
          <button
            type="button"
            className={`btn btn-xs flex items-center gap-1 ${filterType === 'out_of_stock' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.74rem', padding: '4px 10px', height: 28 }}
            onClick={() => setFilterType('out_of_stock')}
          >
            <IconAlertTriangle size={12} />
            <span>Ruptures</span>
          </button>
          <button
            type="button"
            className={`btn btn-xs flex items-center gap-1 ${filterType === 'replenish_urgent' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.74rem', padding: '4px 10px', height: 28 }}
            onClick={() => setFilterType('replenish_urgent')}
          >
            <IconPackage size={12} />
            <span>Réassort</span>
          </button>
        </div>

        {/* Status filter segmented bar */}
        <div
          className="flex gap-1 mb-3 p-0.5"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 9999,
          }}
        >
          <button
            type="button"
            className={`btn btn-xs flex-1 ${filterStatus === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 9999, fontSize: '0.74rem', height: 28 }}
            onClick={() => setFilterStatus('pending')}
          >
            En attente
          </button>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${filterStatus === 'treated' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 9999, fontSize: '0.74rem', height: 28 }}
            onClick={() => setFilterStatus('treated')}
          >
            Traités
          </button>
          <button
            type="button"
            className={`btn btn-xs flex-1 ${filterStatus === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 9999, fontSize: '0.74rem', height: 28 }}
            onClick={() => setFilterStatus('all')}
          >
            Tous
          </button>
        </div>

        {/* List of items */}
        {filteredDemands.length === 0 ? (
          <div className="text-center py-8 text-muted text-xs">
            Aucune remontée enregistrée pour ce filtre.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredDemands.map((d) => {
              const badge = getSignalBadge(d.signalType);
              return (
                <div
                  key={d.id}
                  className="p-3.5 transition-all"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-card, 20px)',
                    backdropFilter: 'var(--glass-blur)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="badge text-[10px] font-bold inline-flex items-center gap-1"
                          style={{ background: badge.bg, color: badge.color, borderRadius: 9999, padding: '3px 8px' }}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                        <span className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                          {d.client}
                        </span>
                      </div>
                      <div className="font-bold text-sm mt-1.5">{d.designation}</div>
                      {d.productReference && (
                        <div className="text-xs text-muted font-mono mt-0.5">
                          Réf: {d.productReference}
                        </div>
                      )}
                    </div>
                    {d.imageUrl && (
                      <img
                        src={d.imageUrl}
                        alt="Photo"
                        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--radius-button, 14px)', flexShrink: 0 }}
                      />
                    )}
                  </div>

                  {d.requestedQty && (
                    <div className="text-xs font-semibold text-accent mt-1">
                      Qté réclamée : {d.requestedQty} pcs
                    </div>
                  )}

                  {d.note && (
                    <div
                      className="text-xs p-2 rounded-xl mt-2 flex items-start gap-1.5"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
                    >
                      <IconChat size={13} className="shrink-0 mt-0.5 text-muted" />
                      <span>{d.note}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[var(--border)] text-[11px] text-muted">
                    <span>Par {d.reportedBy || 'Dépôt'} • {new Date(d.createdAt).toLocaleDateString('fr-FR')}</span>
                    <div className="flex items-center gap-1.5">
                      {d.status === 'pending' ? (
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost text-emerald-500 font-bold inline-flex items-center gap-1"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: 9999 }}
                          onClick={() => handleUpdateStatus(d.id!, 'treated')}
                        >
                          <IconCheck size={12} />
                          <span>Traité</span>
                        </button>
                      ) : (
                        <span className="text-emerald-500 font-bold text-[11px] inline-flex items-center gap-1">
                          <IconCheck size={12} />
                          <span>Traité</span>
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost text-red-400"
                        style={{ padding: '2px 6px' }}
                        onClick={() => handleDelete(d.id!)}
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
