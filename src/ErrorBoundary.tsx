import React, { Component, ErrorInfo, ReactNode } from 'react';
import { IconWarning, IconUndo } from './icons';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px 18px',
          margin: '20px auto',
          maxWidth: 480,
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-card, 16px)',
          textAlign: 'center',
          color: 'var(--text-primary, #fff)',
        }}>
          <div style={{ color: 'var(--danger, #ef4444)', marginBottom: 12 }}>
            <IconWarning size={36} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>
            {this.props.fallbackTitle || "Une interruption d'affichage est survenue"}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: 16 }}>
            {this.state.error?.message || "Une erreur inattendue s'est produite lors du rendu."}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={this.handleReset}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <IconUndo size={15} /> Réessayer
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                window.location.hash = '#/';
                window.location.reload();
              }}
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
