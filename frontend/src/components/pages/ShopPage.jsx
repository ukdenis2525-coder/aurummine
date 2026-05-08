import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';

const TON_PER_HASH = 0.0000144;
const fmtK = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : n;

export default function ShopPage() {
  const [packages, setPackages] = useState([]);
  const [selected, setSelected] = useState(null);
  const { refreshUser } = useStore();

  useEffect(() => {
    api.get('/shop/packages').then(r => setPackages(r.data));
  }, []);

  const handleBuy = (pkg) => {
    setSelected(pkg);
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.showConfirm(
        `Купить ${fmtK(pkg.power_amount)} POWER за ${pkg.price_ton} TON?`,
        async (ok) => {
          if (!ok) return;
          // TON Connect payment flow — placeholder
          alert('Підключи TON Connect для оплати');
        }
      );
    }
  };

  const tonPerDay = (power) => ((power / 100000) * 0.036).toFixed(4);
  const payback = (power, price) => Math.ceil(price / tonPerDay(power));

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#D4AF37' }}>⚡ Магазин</div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Купить Power для майнинга</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {packages.map(pkg => {
          const perDay = tonPerDay(pkg.power_amount);
          const pb = payback(pkg.power_amount, pkg.price_ton);
          return (
            <div key={pkg.id} className="card" style={{
              border: selected?.id === pkg.id ? '1.5px solid #D4AF37' : '1px solid #2a2a2a',
              cursor: 'pointer', transition: 'border 0.2s'
            }} onClick={() => setSelected(pkg)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>{pkg.name}</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#F5D76E' }}>
                    {fmtK(pkg.power_amount)}
                  </div>
                  <div style={{ fontSize: 12, color: '#D4AF37', letterSpacing: 2 }}>POWER</div>
                </div>
                <div style={{
                  background: 'linear-gradient(135deg, #B8860B, #D4AF37)',
                  borderRadius: 12, padding: '6px 14px',
                  fontSize: 16, fontWeight: 800, color: '#000'
                }}>
                  {pkg.price_ton} TON
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div style={{ background: '#111', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#666' }}>ЕЖЕДНЕВНО</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{perDay}</div>
                  <div style={{ fontSize: 10, color: '#666' }}>TON</div>
                </div>
                <div style={{ background: '#111', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#666' }}>1 МЕСЯЦ</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{(perDay * 30).toFixed(3)}</div>
                  <div style={{ fontSize: 10, color: '#666' }}>TON</div>
                </div>
                <div style={{ background: '#111', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#4CAF50' }}>ОКУПНОСТЬ</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4CAF50' }}>{pb}</div>
                  <div style={{ fontSize: 10, color: '#4CAF50' }}>дней</div>
                </div>
              </div>

              <button className="btn-gold" onClick={(e) => { e.stopPropagation(); handleBuy(pkg); }}>
                Купить за {pkg.price_ton} TON
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
