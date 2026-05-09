import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { fmtK } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';

const medals = ['🥇', '🥈', '🥉'];
const topColors = ['#D4AF37', '#C0C0C0', '#CD7F32'];

export default function RatingPage() {
  const [data, setData] = useState(null);
  const { t } = useTranslation();

  useEffect(() => { api.get('/leaderboard').then(r => setData(r.data)); }, []);

  if (!data) return <div className="page" style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 60 }}>{t('common.loading')}</div>;

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <div className="page-title" style={{ color: 'var(--gold)' }}>{t('rating.title')}</div>
        {data.my_rank && (
          <div className="page-subtitle">
            {t('rating.your_position', { rank: data.my_rank })}
          </div>
        )}
      </div>

      {/* Top 3 podium */}
      {data.leaderboard.length >= 3 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 8, marginBottom: 24 }}>
          {[1, 0, 2].map(idx => {
            const u = data.leaderboard[idx];
            const isFirst = idx === 0;
            return (
              <div key={u.id} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                animation: `fadeIn 0.4s ease ${idx * 0.15}s both`
              }}>
                <div style={{ fontSize: isFirst ? 28 : 22 }}>{medals[idx]}</div>
                <div style={{
                  width: isFirst ? 56 : 46, height: isFirst ? 56 : 46, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${topColors[idx]}88, ${topColors[idx]})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isFirst ? 20 : 16, fontWeight: 800, color: '#000',
                  boxShadow: isFirst ? `0 0 24px ${topColors[idx]}44` : 'none'
                }}>
                  {(u.first_name || u.username || '?')[0].toUpperCase()}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.first_name || u.username || `#${u.id}`}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 800, color: topColors[idx],
                  background: `${topColors[idx]}15`, borderRadius: 8, padding: '2px 8px'
                }}>
                  {fmtK(Math.floor(u.power))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rest of leaderboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.leaderboard.slice(3).map((u, i) => (
          <div key={u.id} className="card" style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            animation: `fadeIn 0.3s ease ${(i + 3) * 0.04}s both`
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--text-muted)'
            }}>{u.rank}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.first_name || u.username || `User #${u.id}`}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)' }}>{fmtK(Math.floor(u.power))}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>POWER</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
