import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { StoreDemand, StoreDemandSignalType } from './types';
import { IconX, IconPlus, IconShare, IconCamera, IconTrash } from './icons';

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
        return { label: '🔥 Forte Demande', bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
      case 'out_of_stock':
        return { label: '⚠️ Rupture Urgente', bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' };
      case 'model_request':
        return { label: '💡 Modèle Réclamé', bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' };
      case 'replenish_urgent':
        return { label: '📦 Réassort Immédiat', bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' };
      default:
        return { label: 'Signal', bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280' };
    }
  };

  const handleShareWhatsApp = () => {
    if (filteredDemands.length === 0) return;
    let msg = `*📋 REMONTÉES DE DEMANDE & RÉASSORT MAGASINS (SURFACE)*\n`;
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
          maxWidth: 540,
          maxHeight: '92vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--glass-border-subtle)',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-lg)',
          padding: 20,
        }}
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <span>Remontées Magasin & Besoins Surface</span>
              <span className="badge badge-exact text-xs">{demands.length}</span>
            </h2>
            <div className="text-xs text-muted">
              Demandes des vendeurs, ruptures urgentes et réassorts
            </div>
          </div>
          <button className="btn btn-ghost btn-xs btn-icon" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        {/* Action bar: Add new & WhatsApp share */}
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            className={`btn btn-xs ${isAdding ? 'btn-secondary' : 'btn-primary'} flex items-center gap-1.5`}
            onClick={() => setIsAdding(!isAdding)}
          >
            <IconPlus size={14} />
            <span>{isAdding ? 'Fermer le formulaire' : 'Noter un besoin vendeur'}</span>
          </button>
          {filteredDemands.length > 0 && (
            <button
              type="button"
              className="btn btn-xs btn-secondary flex items-center gap-1.5 ml-auto"
              style={{ background: '#25D366', color: '#fff', border: 'none' }}
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
                  <option value="high_demand">🔥 Forte Demande</option>
                  <option value="out_of_stock">⚠️ Rupture Urgente</option>
                  <option value="model_request">💡 Modèle / Variante Réclamé</option>
                  <option value="replenish_urgent">📦 Demande de Réassort</option>
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
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 text-[10px]"
                    onClick={() => setImageUrl(null)}
                  >
                    ✕
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
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-3">
          <button
            type="button"
            className={`btn btn-xs ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.72rem', padding: '3px 8px' }}
            onClick={() => setFilterType('all')}
          >
            Tous types
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filterType === 'high_demand' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.72rem', padding: '3px 8px' }}
            onClick={() => setFilterType('high_demand')}
          >
            🔥 Forte Demande
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filterType === 'out_of_stock' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.72rem', padding: '3px 8px' }}
            onClick={() => setFilterType('out_of_stock')}
          >
            ⚠️ Ruptures
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filterType === 'replenish_urgent' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.72rem', padding: '3px 8px' }}
            onClick={() => setFilterType('replenish_urgent')}
          >
            📦 Réassort
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-3">
          <span className="text-[10px] text-muted font-bold uppercase mr-1">Statut :</span>
          <button
            type="button"
            className={`btn btn-xs ${filterStatus === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.7rem', padding: '2px 7px' }}
            onClick={() => setFilterStatus('pending')}
          >
            En attente
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filterStatus === 'treated' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.7rem', padding: '2px 7px' }}
            onClick={() => setFilterStatus('treated')}
          >
            Traités
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filterStatus === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 9999, fontSize: '0.7rem', padding: '2px 7px' }}
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
                  className="p-3 rounded-xl transition-all"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="badge text-[10px] font-bold"
                          style={{ background: badge.bg, color: badge.color, borderRadius: 9999 }}
                        >
                          {badge.label}
                        </span>
                        <span className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                          {d.client}
                        </span>
                      </div>
                      <div className="font-bold text-sm mt-1">{d.designation}</div>
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
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
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
                      className="text-xs p-1.5 rounded mt-1.5"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
                    >
                      💬 {d.note}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)] text-[11px] text-muted">
                    <span>Par {d.reportedBy || 'Dépôt'} • {new Date(d.createdAt).toLocaleDateString('fr-FR')}</span>
                    <div className="flex items-center gap-1.5">
                      {d.status === 'pending' ? (
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost text-emerald-500 font-bold"
                          style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                          onClick={() => handleUpdateStatus(d.id!, 'treated')}
                        >
                          ✓ Traité
                        </button>
                      ) : (
                        <span className="text-emerald-500 font-bold text-[10px]">Traité ✓</span>
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
