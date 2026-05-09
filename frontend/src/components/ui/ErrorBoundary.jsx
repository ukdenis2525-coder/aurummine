import React from 'react';
import i18n from '../../i18n/index.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const t = i18n.t.bind(i18n);
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#0F0F0F',
          padding: 24, gap: 16
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#F44336' }}>
            {t('common.error_title')}
          </div>
          <div style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>
            {t('common.error_text')}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn-gold"
            style={{ maxWidth: 240, marginTop: 8 }}
          >
            🔄 {t('common.reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
