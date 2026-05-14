import React from 'react';
import { useStore } from '../../store/index.js';
import { useTranslation } from 'react-i18next';

export default function BottomNav() {
  const { activeTab, setTab } = useStore();
  const { t } = useTranslation();
  const isHidden = activeTab === 'withdraw' || activeTab === 'admin' || activeTab === 'ambassador';

  if (isHidden) return null;

  const tabs = [
    { id: 'shop', label: t('nav.shop'), icon: '🛒' },
    { id: 'rating', label: t('nav.rating'), icon: '🏆' },
    { id: 'power', label: t('nav.mining'), icon: '⚡', main: true },
    { id: 'team', label: t('nav.team'), icon: '👥' },
    { id: 'tasks', label: t('nav.tasks'), icon: '📋' },
  ];


  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480,
      background: 'rgba(8,8,12,0.92)', backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around',
      padding: '6px 0 10px', zIndex: 100
    }}>
      {tabs.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button key={tab.id} onClick={() => setTab(tab.id)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: tab.main ? '0' : '4px 12px',
            position: 'relative', minWidth: 52
          }}>
            {tab.main ? (
              <div style={{
                width: 54, height: 54, borderRadius: '50%',
                background: active
                  ? 'linear-gradient(135deg, var(--gold-dark), var(--gold), var(--gold-light))'
                  : 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, marginTop: -22,
                boxShadow: active ? '0 4px 24px var(--gold-glow)' : 'none',
                transition: 'all 0.3s ease',
                border: active ? 'none' : '1px solid var(--border)'
              }}>
                {tab.icon}
              </div>
            ) : (
              <div style={{
                fontSize: 22, transition: 'transform 0.2s',
                transform: active ? 'scale(1.15)' : 'scale(1)',
                filter: active ? 'none' : 'grayscale(0.5) opacity(0.6)'
              }}>{tab.icon}</div>
            )}
            <span style={{
              fontSize: 10, fontWeight: active ? 700 : 500,
              color: active ? 'var(--gold)' : 'var(--text-muted)',
              transition: 'color 0.2s'
            }}>{tab.label}</span>
            {active && !tab.main && (
              <div style={{
                position: 'absolute', bottom: -6, width: 4, height: 4,
                borderRadius: '50%', background: 'var(--gold)',
                boxShadow: '0 0 8px var(--gold-glow)'
              }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
