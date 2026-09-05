// ============================================================
// POINTAGE — Apple Minimalist In-App Interactive Tour
// Guides the user around actual app screens with zero text spam
// Tuned for low attention span & maximum whitespace
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BrandLogo,
  IconScan,
  IconCamera,
  IconCheck,
  IconX,
  IconArrowLeft,
  IconArrowRight,
  IconKey,
} from './icons';

interface WalkthroughProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourStep {
  route: string;
  badge: string;
  title: string;
  text: string;
  icon: React.ReactNode;
}

const STEPS: TourStep[] = [
  {
    route: '/',
    badge: '1 / 4 • Accueil',
    title: 'Bons de livraison',
    text: 'Tous vos bons centralisés. Touchez un bon pour pointer vos articles.',
    icon: <BrandLogo size={32} />,
  },
  {
    route: '/import',
    badge: '2 / 4 • Photo',
    title: 'Numérisation',
    text: 'Photographiez vos bons ou notes. L’IA extrait automatiquement les lignes.',
    icon: <IconCamera size={26} />,
  },
  {
    route: '/scan',
    badge: '3 / 4 • Scanner',
    title: 'Scan code-barres',
    text: 'Scannez un carton pour ouvrir immédiatement son article.',
    icon: <IconScan size={26} />,
  },
  {
    route: '/',
    badge: '4 / 4 • Réglages',
    title: 'Hors-ligne & Quotas',
    text: 'Données stockées localement. Quotas et exports dans les Paramètres.',
    icon: <IconKey size={26} />,
  },
];


export function OnboardingWalkthrough({ isOpen, onClose }: WalkthroughProps) {
  const nav = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  // Navigate to the target route as the step changes
  useEffect(() => {
    if (!isOpen) return;
    const step = STEPS[currentStep];
    if (step) {
      nav(step.route);
    }
  }, [isOpen, currentStep, nav]);

  // Keyboard shortcuts (Left, Right, Escape)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleExit();
      if (e.key === 'ArrowRight' && currentStep < STEPS.length - 1) {
        setCurrentStep((s) => s + 1);
      }
      if (e.key === 'ArrowLeft' && currentStep > 0) {
        setCurrentStep((s) => s - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  const handleExit = () => {
    localStorage.setItem('pointage_onboarded', 'true');
    nav('/');
    onClose();
  };

  const handleNext = () => {
    if (isLast) {
      handleExit();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  return (
    <>
      {/* Subtle non-blocking ambient overlay */}
      <div className="tour-backdrop" onClick={handleExit} />

      {/* Floating Apple Glass Tour Card */}
      <div className="tour-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="tour-header">
          <span className="tour-badge">{step.badge}</span>
          <button
            className="tour-close-btn"
            onClick={handleExit}
            aria-label="Passer le guide"
            title="Passer"
          >
            <IconX size={15} />
          </button>
        </div>

        {/* Spacious Body: Icon + Short Punchy Text */}
        <div className="tour-body">
          <div className="tour-icon-box">{step.icon}</div>
          <div className="tour-content">
            <h2 className="tour-title">{step.title}</h2>
            <p className="tour-text">{step.text}</p>
          </div>
        </div>

        {/* Footer: Dots + Actions */}
        <div className="tour-footer">
          {/* Progress Indicators */}
          <div className="tour-dots">
            {STEPS.map((_, idx) => (
              <button
                key={idx}
                className={`tour-dot ${idx === currentStep ? 'active' : ''}`}
                onClick={() => setCurrentStep(idx)}
                aria-label={`Étape ${idx + 1}`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="tour-actions">
            {currentStep > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handlePrev}
                style={{ padding: '7px 12px', fontSize: '0.78rem' }}
              >
                <IconArrowLeft size={14} /> Retour
              </button>
            )}

            <button
              className="btn btn-primary btn-sm"
              onClick={handleNext}
              style={{ padding: '7px 16px', fontSize: '0.82rem', fontWeight: 800 }}
            >
              {isLast ? (
                <>
                  <IconCheck size={16} /> COMMENCER
                </>
              ) : (
                <>
                  Suivant <IconArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
