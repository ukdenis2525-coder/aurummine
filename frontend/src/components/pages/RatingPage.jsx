import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';

const fmtK = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : n;

export default function RatingPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/leaderboard').then(r => setData(r.data));
  }, []);

  if (!data) return <div className="page" style={{ color: '#888' }}>Загрузка...</div>;

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#D4AF37' }}>🏆 Рейтинг</div>
        {data.my_rank && (
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            Ваша позиция: <span style={{ color: '#D4AF37', fontWeight: 700 }}>#{data.my_rank}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.leaderboard.map((u, i) => (
          <div key={u.id} className="card" style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            background: i < 3 ? 'linear-gradient(135deg, #1a1400, #2a2000)' : '#1a1a1a',
            border: i === 0 ? '1px solid #D4AF37' : i < 3 ? '1px solid #3a3000' : '1px solid #2a2a2a'
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: i === 0 ? '#D4AF37' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#2a2a2a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: i < 3 ? 16 : 13, fontWeight: 800,
              color: i < 3 ? '#000' : '#666'
            }}>
              {i < 3 ? ['🥇','🥈','🥉'][i] : u.rank}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {u.first_name || u.username || `User #${u.id}`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#D4AF37' }}>
                {fmtK(Math.floor(u.power))}
              </div>
              <div style={{ fontSize: 10, color: '#666' }}>POWER</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
