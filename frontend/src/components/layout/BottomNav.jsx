import React from 'react';
import { useStore } from '../../store/index.js';

const tabs = [
  { id: 'shop', label: 'Магазин', icon: '🛒' },
  { id: 'rating', label: 'Рейтинг', icon: '🏆' },
  { id: 'power', label: 'Power', icon: '⚡', main: true },
  { id: 'team', label: 'Команда', icon: '👥' },
  { id: 'tasks', label: 'Задания', icon: '📋' },
];

export default function BottomNav() {
  const { activeTab, setTab } = useStore();

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480,
      background: '#161616', borderTop: '1px solid #2a2a2a',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      padding: '8px 0 12px', zIndex: 100
    }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => setTab(tab.id)} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: tab.main ? '0' : '4px 8px',
          position: 'relative'
        }}>
          {tab.main ? (
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: activeTab === 'power'
                ? 'linear-gradient(135deg, #B8860B, #D4AF37, #F5D76E)'
                : '#2a2a2a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, marginTop: -20,
              boxShadow: activeTab === 'power' ? '0 0 20px rgba(212,175,55,0.5)' : 'none',
              transition: 'all 0.2s'
            }}>
              {tab.icon}
            </div>
          ) : (
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 500,
            color: activeTab === tab.id ? '#D4AF37' : '#666'
          }}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
