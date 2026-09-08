import React, { useState, useEffect } from 'react';
import type { OrderLine, ProductProfile } from './types';
import { db } from './db';
import { linkLegacyReference } from './hooks';
import { normalizeDesignation, areDesignationsMatching } from './logic';
import { IconHistory, IconTag, IconX, IconCheck, IconTrash, IconSearch } from './icons';
import { playSuccessChime, hapticTap } from './audio';

interface LegacyCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  line: OrderLine;
  onLinked?: (newCode: string | null) => void;
}

export const LegacyCodeModal: React.FC<LegacyCodeModalProps> = ({
  isOpen,
  onClose,
  line,
  onLinked,
}) => {
  if (!isOpen) return null;

  const [inputCode, setInputCode] = useState(line.historicalReference || '');
  const [suggestions, setSuggestions] = useState<ProductProfile[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchHistoricalMatches() {
      try {
        setLoadingSuggestions(true);
        const norm = normalizeDesignation(line.designation);
        const allProfiles = await db.productProfiles.toArray();

        // Filter profiles that have a reference and match designation similarity
        const matches = allProfiles.filter((p) => {
          if (!p.reference) return false;
          if (line.reference && p.reference.toLowerCase() === line.reference.toLowerCase()) {
            return false;
          }
          if (p.normalizedDesignation && areDesignationsMatching(norm, p.normalizedDesignation)) {
            return true;
          }
          if (p.designation && areDesignationsMatching(norm, normalizeDesignation(p.designation))) {
            return true;
          }
          return false;
        });

        if (isMounted) {
          setSuggestions(matches.slice(0, 8));
        }
      } catch (err) {
        console.warn('Failed to search historical profiles:', err);
      } finally {
        if (isMounted) setLoadingSuggestions(false);
      }
    }

    fetchHistoricalMatches();
    return () => {
      isMounted = false;
    };
  }, [line.designation, line.reference]);

  const handleSave = async (codeToLink: string | null) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const clean = codeToLink ? codeToLink.trim().toUpperCase() : null;
      await linkLegacyReference(line.id!, clean);
      playSuccessChime();
      hapticTap('medium');
      if (onLinked) onLinked(clean);
      onClose();
    } catch (err) {
      console.error('Failed to link legacy reference:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 970,
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
          maxHeight: '92vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 24,
          padding: 22,
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: 'rgba(245, 158, 11, 0.16)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b',
                flexShrink: 0,
              }}
            >
              <IconHistory size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="font-bold text-xs uppercase tracking-wider" style={{ color: '#f59e0b' }}>
                Historique & Ancien Code
              </div>
              <div className="font-bold text-sm truncate" title={line.designation}>
                {line.designation}
              </div>
              <div className="text-xs text-muted">
                {line.reference ? `Réf actuelle : ${line.reference}` : 'Sans référence sur ce bon'} • N°{line.no}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-icon"
            style={{ borderRadius: 9999 }}
            onClick={onClose}
            aria-label="Fermer"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Current Association Banner */}
        <div
          className="p-3 mb-4 text-xs"
          style={{
            borderRadius: 16,
            background: line.historicalReference ? 'rgba(245, 158, 11, 0.10)' : 'var(--bg-card)',
            border: `1px solid ${line.historicalReference ? 'rgba(245, 158, 11, 0.32)' : 'var(--border)'}`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
              <IconTag size={16} style={{ color: line.historicalReference ? '#f59e0b' : 'var(--text-muted)' }} />
              <div>
                <span className="text-muted">Ancien code associé : </span>
                <strong style={{ color: line.historicalReference ? '#f59e0b' : 'inherit', fontSize: '0.85rem' }}>
                  {line.historicalReference || 'Aucun'}
                </strong>
              </div>
            </div>
            {line.historicalReference && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                style={{
                  color: '#ef4444',
                  borderRadius: 9999,
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                }}
                onClick={() => handleSave(null)}
                disabled={isSubmitting}
                title="Délier l'ancien code"
              >
                <IconTrash size={12} />
                <span>Délier</span>
              </button>
            )}
          </div>
          <p className="text-muted text-xs mt-1 mb-0" style={{ lineHeight: 1.4 }}>
            Permet de retrouver ce produit en scannant ou en recherchant son ancienne référence fournisseur, et hérite de son emplacement rayon.
          </p>
        </div>

        {/* Manual Input Form */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-secondary uppercase tracking-wider block mb-1.5">
            Saisir ou modifier l'ancien code
          </label>
          <div className="flex gap-2">
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="input"
                style={{
                  width: '100%',
                  textTransform: 'uppercase',
                  paddingLeft: 34,
                  borderRadius: 9999,
                }}
                placeholder="Ex: 71662, STY-VERT..."
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave(inputCode);
                  }
                }}
              />
              <IconSearch
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              style={{ borderRadius: 9999, padding: '0 16px' }}
              onClick={() => handleSave(inputCode)}
              disabled={isSubmitting || !inputCode.trim()}
            >
              <IconCheck size={16} />
              <span>Lier</span>
            </button>
          </div>
        </div>

        {/* Suggestions Section */}
        <div>
          <div className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Anciens articles similaires détectés</span>
            {suggestions.length > 0 && (
              <span className="badge" style={{ borderRadius: 9999, fontSize: '0.65rem' }}>
                {suggestions.length} trouvé{suggestions.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loadingSuggestions ? (
            <div className="text-xs text-muted p-3 text-center">
              Recherche dans les profils historiques...
            </div>
          ) : suggestions.length === 0 ? (
            <div
              className="p-3 text-xs text-muted text-center"
              style={{
                borderRadius: 16,
                background: 'var(--bg-card)',
                border: '1px dashed var(--border)',
              }}
            >
              Aucun ancien produit identique trouvé automatiquement. Vous pouvez entrer le code manuellement ci-dessus.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {suggestions.map((sug) => {
                const isCurrent = line.historicalReference === sug.reference;
                return (
                  <div
                    key={sug.reference}
                    className="card p-2.5 flex items-center justify-between cursor-pointer"
                    style={{
                      borderRadius: 16,
                      background: isCurrent ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-card)',
                      border: `1px solid ${isCurrent ? 'rgba(245, 158, 11, 0.4)' : 'var(--border)'}`,
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => handleSave(sug.reference)}
                  >
                    <div style={{ minWidth: 0, flex: 1, marginRight: 10 }}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-accent">
                          {sug.reference}
                        </span>
                        {sug.warehouseZone && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 9999,
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: 'var(--accent)',
                            }}
                          >
                            Zone: {sug.warehouseZone}
                          </span>
                        )}
                        {sug.outerPackSize && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 9999,
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: '#3b82f6',
                            }}
                          >
                            Colis: {sug.outerPackSize}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted truncate mt-0.5" title={sug.designation || ''}>
                        {sug.designation || 'Désignation historique'}
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`btn btn-xs ${isCurrent ? 'btn-ghost' : 'btn-secondary'}`}
                      style={{ borderRadius: 9999, flexShrink: 0 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSave(sug.reference);
                      }}
                      disabled={isSubmitting}
                    >
                      {isCurrent ? 'Lié' : 'Associer'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ borderRadius: 9999 }}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};