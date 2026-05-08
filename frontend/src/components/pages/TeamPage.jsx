import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';

export default function TeamPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/referrals').then(r => setData(r.data));
  }, []);

  const copyLink = () => {
    if (!data?.ref_link) return;
    navigator.clipboard.writeText(data.ref_link);
    window.Telegram?.WebApp?.showAlert('Ссылка скопирована!');
  };

  const share = () => {
    if (!data?.ref_link) return;
    window.Telegram?.WebApp?.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(data.ref_link)}&text=${encodeURIComponent('⚡ Майни TON вместе со мной в AurumMine!')}`
    );
  };

  if (!data) return <div className="page" style={{ color: '#888' }}>Загрузка...</div>;

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#D4AF37' }}>👥 Команда</div>
      </div>

      {/* Ref rewards card */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #1a1400, #2a2000)',
        border: '1px solid #3a3000', marginBottom: 16
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16 }}>
          Ваши реферальные награды
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { icon: '⭐', val: '+6,000', sub: 'POWER', label: 'premium user' },
            { icon: '👤', val: '+3,000', sub: 'POWER', label: 'per referral' },
            { icon: '%', val: '15%', sub: 'COMM', label: 'с покупок' },
          ].map(item => (
            <div key={item.label} style={{
              background: '#1a1a00', borderRadius: 12, padding: '12px 8px', textAlign: 'center',
              border: '1px solid #3a3000'
            }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#F5D76E' }}>{item.val}</div>
              <div style={{ fontSize: 10, color: '#D4AF37' }}>{item.sub}</div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { val: data.stats.total, label: 'ПРИГЛАШЁН' },
            { val: data.stats.confirmed, label: 'ПОДТВЕРЖДЁН' },
            { val: data.stats.pending, label: 'В ОЖИДАНИИ' },
            { val: `${Math.floor(data.rewards.total_power / 1000)}K`, label: 'POWER' },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: item.label === 'POWER' ? '#D4AF37' : '#fff' }}>
                {item.val}
              </div>
              <div style={{ fontSize: 9, color: '#666' }}>{item.label}</div>
            </div>
          ))}
        </div>

        <button className="btn-gold" onClick={share} style={{ marginBottom: 10 }}>
          📤 Получить рефералов
        </button>
        <button className="btn-outline" onClick={copyLink}>
          📋 Копировать ссылку
        </button>
      </div>

      {/* Team list */}
      {data.team.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 13, color: '#888', marginBottom: 12, letterSpacing: 1 }}>ВАША КОМАНДА</div>
          {data.team.map(member => (
            <div key={member.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '1px solid #1a1a1a'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #B8860B, #D4AF37)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#000'
                }}>
                  {(member.first_name || member.username || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {member.first_name || member.username || 'User'}
                    {member.is_premium && <span style={{ color: '#D4AF37', marginLeft: 6, fontSize: 12 }}>★</span>}
                  </div>
                  <div style={{ fontSize: 11, color: member.is_confirmed ? '#4CAF50' : '#888' }}>
                    {member.is_confirmed ? '✓ Подтверждён' : '⏳ Ожидание'}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#D4AF37', fontWeight: 700 }}>
                  {(parseFloat(member.power) / 1000).toFixed(1)}K
                </div>
                <div style={{ fontSize: 10, color: '#666' }}>POWER</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
