import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/index.js';

const fmt = (n, d = 8) => parseFloat(parseFloat(n || 0).toFixed(d));
const fmtK = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : n;

export default function PowerPage() {
  const { user, mining, fetchMining, collect } = useStore();
  const [collecting, setCollecting] = useState(false);
  const [collected, setCollected] = useState(null);
  const [liveHashes, setLiveHashes] = useState(0);

  useEffect(() => {
    fetchMining();
  }, []);

  useEffect(() => {
    if (!mining) return;
    setLiveHashes(parseFloat(mining.hashes || 0));
    const hps = (mining.hashes_per_day || 0) / 86400;
    const interval = setInterval(() => {
      setLiveHashes(prev => prev + hps);
    }, 1000);
    return () => clearInterval(interval);
  }, [mining]);

  const handleCollect = async () => {
    if (collecting || liveHashes <= 0) return;
    setCollecting(true);
    try {
      const res = await collect();
      setCollected(res.ton_earned);
      setLiveHashes(0);
      setTimeout(() => setCollected(null), 3000);
    } finally {
      setCollecting(false);
    }
  };

  const power = parseFloat(user?.power || 0);
  const tonBalance = parseFloat(user?.ton_balance || 0);

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'linear-gradient(135deg, #B8860B, #D4AF37)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
          }}>⚡</div>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#D4AF37', letterSpacing: 1 }}>AURUMMINE</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#888' }}>Баланс</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#D4AF37' }}>{fmt(tonBalance, 4)} TON</div>
        </div>
      </div>

      {/* Power card */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #1a1400, #2a2000)',
        border: '1px solid #3a3000', marginBottom: 16, textAlign: 'center'
      }}>
        <div style={{ fontSize: 12, color: '#D4AF37', letterSpacing: 2, marginBottom: 8 }}>ВАША POWER</div>
        <div style={{ fontSize: 52, fontWeight: 900, color: '#F5D76E', lineHeight: 1 }}>
          {fmtK(Math.floor(power))}
        </div>
        <div style={{ fontSize: 14, color: '#D4AF37', letterSpacing: 3, marginBottom: 16 }}>POWER</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'ДЕНЬ', val: fmt(mining?.ton_per_day, 5) },
            { label: 'МЕСЯЦ', val: fmt(mining?.ton_per_month, 4) },
            { label: '3 МЕС', val: fmt(mining?.ton_per_3months, 3) },
          ].map(item => (
            <div key={item.label} style={{ background: '#1a1500', borderRadius: 10, padding: '10px 6px' }}>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F5D76E' }}>{item.val}</div>
              <div style={{ fontSize: 10, color: '#666' }}>TON</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="btn-gold" onClick={() => useStore.getState().setTab('shop')}>
            ⚡ Добавить POWER
          </button>
          <button className="btn-outline" onClick={() => useStore.getState().setTab('tasks')}>
            🎁 Бесплатно
          </button>
        </div>
      </div>

      {/* Hashes card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>⛏️</span>
          <span style={{ fontSize: 13, color: '#888', letterSpacing: 1 }}>HASHES ДОБЫТО</span>
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, color: '#D4AF37', marginBottom: 4 }}>
          {liveHashes.toFixed(8)}
        </div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          ≈ {(liveHashes * (mining?.ton_per_hash || 0)).toFixed(8)} TON
        </div>

        {collected !== null && (
          <div style={{
            background: '#1a2a1a', border: '1px solid #4CAF50',
            borderRadius: 10, padding: '10px 16px', marginBottom: 12,
            color: '#4CAF50', fontWeight: 600, textAlign: 'center'
          }}>
            ✅ Получено +{fmt(collected, 6)} TON
          </div>
        )}

        <button
          className="btn-gold"
          onClick={handleCollect}
          disabled={collecting || liveHashes <= 0}
          style={{ opacity: liveHashes <= 0 ? 0.5 : 1 }}
        >
          {collecting ? '⏳ Обработка...' : '▶ НАЧАТЬ ПРОИЗВОДСТВО'}
        </button>

        <button className="btn-outline" style={{ marginTop: 10 }}>
          ⇄ ОБМЕНЯТЬ HASHES
        </button>
      </div>
    </div>
  );
}
