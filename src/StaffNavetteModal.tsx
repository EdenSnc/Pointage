import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import {
  IconX,
  IconTruck,
  IconUser,
  IconPhone,
  IconClock,
  IconMapPin,
  IconBus,
  IconSparkles,
  IconUsers,
  IconChat,
} from './icons';

interface StaffNavetteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StaffNavetteModal: React.FC<StaffNavetteModalProps> = ({ isOpen, onClose }) => {
  const trips = useLiveQuery(() => db.shipmentTrips.reverse().sortBy('dispatchedAt'), []) || [];

  if (!isOpen) return null;

  // Today's trips or active dispatched trips
  const todayStr = new Date().toISOString().split('T')[0];
  const activeTrips = trips.filter((t) => {
    if (!t.dispatchedAt) return false;
    return t.dispatchedAt.startsWith(todayStr) || t.status === 'dispatched';
  });

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
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--glass-border-subtle)',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-modal, 26px)',
          backdropFilter: 'var(--glass-blur)',
          padding: 20,
        }}
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <IconBus size={18} className="text-accent" />
              <span>Navette & Covoiturage Chauffeurs</span>
              <span className="badge badge-exact text-xs">{activeTrips.length}</span>
            </h2>
            <div className="text-xs text-muted">
              Départs camions du dépôt & retours vers vos quartiers
            </div>
          </div>
          <button className="btn btn-ghost btn-xs btn-icon" onClick={onClose} aria-label="Fermer">
            <IconX size={16} />
          </button>
        </div>

        {/* Informational banner */}
        <div
          className="p-3.5 mb-3 flex items-start gap-2.5 text-xs"
          style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.22)',
            borderRadius: 'var(--radius-card, 20px)',
            color: 'var(--text-primary)',
          }}
        >
          <IconSparkles size={18} className="text-blue-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-blue-400 mb-0.5">Entraide Transport Ouvriers / Dépôt</div>
            <div>
              Profitez des rotations et des retours des fourgons de livraison pour rentrer ou vous déplacer sans payer de taxi/Yassir. Les places en cabine sont indiquées ci-dessous.
            </div>
          </div>
        </div>

        {activeTrips.length === 0 ? (
          <div className="text-center py-10 text-muted text-xs">
            <IconTruck size={36} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <div>Aucun départ de camion enregistré pour aujourd'hui.</div>
            <div className="text-[11px] mt-1">Les départs créés au quai s'afficheront ici en temps réel.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {activeTrips.map((t) => {
              const driver = t.driverName || 'Chauffeur non assigné';
              const route = t.destinationRoute || 'Oran / Environs';
              const seats = t.availableSeats ?? 1;
              const hasSeats = seats > 0;
              const dispatchTime = t.dispatchedAt ? new Date(t.dispatchedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

              const phone = t.driverPhone || '';
              const whatsappMsg = encodeURIComponent(
                `Salam khoya ${driver}, rani fel dépôt. Rak rayeh l'${route} ? Kayen blasa m3ak fel fourgon ?`
              );

              return (
                <div
                  key={t.id}
                  className="p-3.5 transition-all"
                  style={{
                    background: 'var(--bg-card)',
                    border: hasSeats ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)',
                    borderRadius: 'var(--radius-card, 20px)',
                    backdropFilter: 'var(--glass-blur)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-accent flex items-center gap-1">
                          <IconUser size={13} />
                          {driver}
                        </span>
                        <span className="badge text-[10px] font-bold" style={{ borderRadius: 9999, background: 'var(--bg-input)' }}>
                          {t.truckPlate || 'Fourgon'}
                        </span>
                        <span
                          className="badge text-[10px] font-bold ml-auto inline-flex items-center gap-1"
                          style={{
                            borderRadius: 9999,
                            padding: '3px 8px',
                            background: hasSeats ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: hasSeats ? '#10b981' : '#ef4444',
                          }}
                        >
                          {hasSeats ? (
                            <>
                              <IconUsers size={11} />
                              <span>{seats} place{seats > 1 ? 's' : ''} libre{seats > 1 ? 's' : ''}</span>
                            </>
                          ) : (
                            <span>Cabine complète</span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-muted mt-1">
                        <IconMapPin size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        <span className="font-semibold text-primary">{route}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted mt-1">
                        <span className="flex items-center gap-1">
                          <IconClock size={11} />
                          Départ : {dispatchTime}
                        </span>
                        <span>•</span>
                        <span>Client : {t.client}</span>
                      </div>
                    </div>
                  </div>

                  {/* Driver contact buttons */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border)]">
                    {phone ? (
                      <>
                        <a
                          href={`tel:${phone}`}
                          className="btn btn-xs btn-secondary flex items-center justify-center gap-1.5 flex-1"
                          style={{ borderRadius: 'var(--radius-button, 14px)', textDecoration: 'none', minHeight: 34 }}
                        >
                          <IconPhone size={12} />
                          <span>Appeler ({phone})</span>
                        </a>
                        <a
                          href={`https://wa.me/213${phone.replace(/^0/, '')}?text=${whatsappMsg}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-xs flex items-center justify-center gap-1.5 flex-1"
                          style={{
                            borderRadius: 'var(--radius-button, 14px)',
                            background: '#25D366',
                            color: '#fff',
                            textDecoration: 'none',
                            fontWeight: 700,
                            minHeight: 34,
                          }}
                        >
                          <IconChat size={13} />
                          <span>WhatsApp</span>
                        </a>
                      </>
                    ) : (
                      <div className="text-[11px] text-muted italic">
                        Demander à {driver} directement sur le quai d'expédition
                      </div>
                    )}
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
