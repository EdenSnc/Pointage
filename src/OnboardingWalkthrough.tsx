// ============================================================
// POINTAGE — Apple-Inspired Interactive Onboarding Walkthrough
// Designed for Warehouse Floor Operators & Managers
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  BrandLogo,
  IconScan,
  IconImport,
  IconDisk,
  IconClipboard,
  IconBox,
  IconCheck,
  IconX,
  IconBolt,
  IconLayers,
  IconShieldCheck,
  IconArrowLeft,
  IconArrowRight,
  IconSparkles,
} from './icons';

interface WalkthroughProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Slide {
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  highlights: { label: string; detail: string }[];
}

export function OnboardingWalkthrough({ isOpen, onClose }: WalkthroughProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides: Slide[] = [
    {
      badge: 'ARCHITECTURE LOCALE',
      title: 'Bienvenue sur Pointage Pro',
      subtitle: 'Moteur d\'entrepôt 100% autonome & local-first',
      description:
        'Conçu pour fonctionner sans interruption en zone blanche ou sous abri métallique. Toutes vos données sont stockées sur votre appareil.',
      icon: <BrandLogo size={54} />,
      highlights: [
        { label: 'Zéro Latence', detail: 'Base de données locale IndexedDB instantanée' },
        { label: '100% Hors-Ligne', detail: 'Aucun serveur ni connexion internet requis' },
        { label: 'Ergonomie Sombre', detail: 'Noir charbon anti-éblouissement pour Galaxy A54' },
      ],
    },
    {
      badge: 'INGESTION RAPIDE',
      title: 'Import & Ingestion des BL',
      subtitle: 'Collez vos bons de livraison en JSON sans clé API',
      description:
        'Importez plusieurs factures simultanément. Transformez n\'importe quel document papier en JSON grâce à notre prompt IA gratuit.',
      icon: <IconImport size={44} />,
      highlights: [
        { label: 'Zéro Clé API', detail: 'Aucun abonnement cloud ni configuration complexe' },
        { label: 'Prompt IA Gratuit', detail: 'Copiez le prompt dans ChatGPT, Claude ou Gemini' },
        { label: 'Multi-Factures', detail: 'Gestion de centaines de lignes avec détection d\'erreurs' },
      ],
    },
    {
      badge: 'FLUX OPÉRATIONNEL',
      title: 'Les 3 Étapes Entrepôt',
      subtitle: 'Préparation, Chargement & Pointage Qualité',
      description:
        'Un cycle d\'exploitation rigoureux assurant que chaque article préparé est vérifié au chargement puis validé à la réception.',
      icon: <IconClipboard size={44} />,
      highlights: [
        { label: 'PRÉP', detail: 'Prélever et emballer les articles par carton ou vrac' },
        { label: 'CHARG', detail: 'Vérifier la concordance avant départ transporteur' },
        { label: 'POINTAGE', detail: 'Réception finale avec qualification des avaries' },
      ],
    },
    {
      badge: 'PRODUCTIVITÉ AU SOL',
      title: 'Comptage & Colisage',
      subtitle: 'Multiplicateurs de packs & validation en 1 tap',
      description:
        'Gagnez des heures de pointage. Définissez vos conditionnements cartons et saisissez le reliquat instantanément avec SOLDE.',
      icon: <IconBox size={44} />,
      highlights: [
        { label: 'Arithmétique Colis', detail: 'Carton extérieur × sous-conditionnement intégré' },
        { label: 'Bouton SOLDE', detail: 'Comptabilise le reste à pointer en une seule touche' },
        { label: 'Boutons Rapides', detail: '+1, +5, +10, +25 pour un pointage sans clavier' },
      ],
    },
    {
      badge: 'LECTURE CODE-BARRES',
      title: 'Scanner Laser & Caméra',
      subtitle: 'Reconnaissance EAN & liaison des inconnus',
      description:
        'Pointez vos articles avec la caméra de votre smartphone ou un terminal durci. Tout code inconnu peut être relié à la volée.',
      icon: <IconScan size={44} />,
      highlights: [
        { label: 'Reconnaissance Rapide', detail: 'Scan instantané EAN-13, EAN-8 et Code 128' },
        { label: 'Alias Multiples', detail: 'Résolution des références composées (ex: 70380/84)' },
        { label: 'Liaison Directe', detail: 'Associez un code inconnu à une ligne en 2 secondes' },
      ],
    },
    {
      badge: 'SÉCURITÉ & AUDIT',
      title: 'Qualité & Sauvegarde',
      subtitle: 'Traçabilité complète et export de sécurité',
      description:
        'Chaque modification est journalisée dans l\'audit. Exportez vos sauvegardes complètes en un clic vers vos fichiers ou Google Drive.',
      icon: <IconShieldCheck size={44} />,
      highlights: [
        { label: 'Qualification Qualité', detail: 'Ventilation: Conforme, Avarié Accepté, Refusé' },
        { label: 'Cartons Transport', detail: 'Affectation par Carton A, Carton B, Vrac, Dessus' },
        { label: 'Sauvegarde 1-Clic', detail: 'Export/Restauration JSON pour préserver vos données' },
      ],
    },
  ];

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && currentSlide < slides.length - 1) {
        setCurrentSlide((s) => s + 1);
      }
      if (e.key === 'ArrowLeft' && currentSlide > 0) {
        setCurrentSlide((s) => s - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentSlide, slides.length, onClose]);

  if (!isOpen) return null;

  const slide = slides[currentSlide];
  const isLast = currentSlide === slides.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('pointage_onboarded', 'true');
      onClose();
    } else {
      setCurrentSlide((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide((s) => s - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('pointage_onboarded', 'true');
    onClose();
  };

  return (
    <div className="onboarding-overlay" onClick={handleSkip} role="dialog" aria-modal="true">
      <div className="onboarding-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Header Bar */}
        <div className="onboarding-header">
          <div className="onboarding-brand">
            <span className="onboarding-badge">{slide.badge}</span>
            <span className="onboarding-step-counter">
              {currentSlide + 1} / {slides.length}
            </span>
          </div>
          <button
            className="onboarding-close-btn"
            onClick={handleSkip}
            aria-label="Fermer le guide"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Slide Body with Smooth Key Re-render */}
        <div key={currentSlide} className="onboarding-body animate-slide-in">
          <div className="onboarding-icon-wrapper">
            <div className="onboarding-icon-halo" />
            <div className="onboarding-icon-content">{slide.icon}</div>
          </div>

          <h2 className="onboarding-title">{slide.title}</h2>
          <h3 className="onboarding-subtitle">{slide.subtitle}</h3>
          <p className="onboarding-desc">{slide.description}</p>

          {/* Feature Highlights Grid */}
          <div className="onboarding-highlights">
            {slide.highlights.map((h, i) => (
              <div key={i} className="onboarding-highlight-item">
                <div className="onboarding-highlight-dot">
                  <IconSparkles size={13} />
                </div>
                <div>
                  <strong className="onboarding-highlight-label">{h.label}: </strong>
                  <span className="onboarding-highlight-detail">{h.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Apple-Style Navigation Footer */}
        <div className="onboarding-footer">
          {/* Dot Indicators */}
          <div className="onboarding-dots">
            {slides.map((_, idx) => (
              <button
                key={idx}
                className={`onboarding-dot ${idx === currentSlide ? 'active' : ''}`}
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Aller au slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="onboarding-actions">
            {currentSlide > 0 ? (
              <button className="btn btn-secondary onboarding-btn" onClick={handlePrev}>
                <IconArrowLeft size={16} /> PRÉCÉDENT
              </button>
            ) : (
              <button className="btn btn-secondary onboarding-btn" onClick={handleSkip}>
                PASSER
              </button>
            )}

            <button className="btn btn-primary onboarding-btn flex-1" onClick={handleNext}>
              {isLast ? (
                <>
                  <IconCheck size={18} /> DÉMARRER POINTAGE
                </>
              ) : (
                <>
                  SUIVANT <IconArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
