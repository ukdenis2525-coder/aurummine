import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';
import { fmtK } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';
import PaymentPage from './PaymentPage.jsx';

export default function ShopPage() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const { refreshUser } = useStore();
  const { t } = useTranslation();

  useEffect(() => {
    api.get('/shop/packages').then(r => setPackages(r.data));
    checkExistingOrder();
  }, []);

  const checkExistingOrder = async () => {
    try {
      const { data: order } = await api.get('/shop/order-status');
      if (order) {
        const { data: pkgs } = await api.get('/shop/packages');
        const pkg = pkgs.find(p => p.id === order.package_id);
        if (pkg) setPaymentData({ order, pkg, wallet: order.wallet || '', expiresAt: order.expires_at });
      }
    } catch (e) {}
  };

  const handleBuy = async (pkg) => {
    const tg = window.Telegram?.WebApp;
    const confirmText = t('shop.confirm_buy', { power: fmtK(pkg.power_amount), price: pkg.price_ton });
    const confirmed = await new Promise(resolve => {
      if (tg) tg.showConfirm(confirmText, resolve);
      else resolve(window.confirm(confirmText));
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      const { data } = await api.post('/shop/create-order', { package_id: pkg.id });
      setPaymentData({ order: data.order, pkg: data.package, wallet: data.wallet, expiresAt: data.expires_at });
    } catch (e) {
      const tg = window.Telegram?.WebApp;
      tg ? tg.showAlert(t('shop.order_error')) : alert(t('shop.order_error'));
    } finally { setLoading(false); }
  };

  if (paymentData) {
    return <PaymentPage {...paymentData} onCancel={() => setPaymentData(null)} onSuccess={async () => { await refreshUser(); setPaymentData(null); }} />;
  }

  const tonPerDay = (power) => ((power / 100000) * 0.036).toFixed(4);
  const payback = (power, price) => Math.ceil(price / tonPerDay(power));
  const badges = ['', '', t('shop.badge_hit'), t('shop.badge_top')];

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <div className="page-title" style={{ color: 'var(--gold)' }}>{t('shop.title')}</div>
        <div className="page-subtitle">{t('shop.subtitle')}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {packages.map((pkg, i) => {
          const perDay = tonPerDay(pkg.power_amount);
          const pb = payback(pkg.power_amount, pkg.price_ton);
          const badge = badges[i];
          return (
            <div key={pkg.id} className="card" style={{
              position: 'relative', overflow: 'hidden',
              border: i >= 2 ? '1px solid var(--border-gold)' : '1px solid var(--border)',
              animation: `fadeIn 0.3s ease ${i * 0.08}s both`
            }}>
              {/* Badge */}
              {badge && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                  borderRadius: 8, padding: '3px 10px',
                  fontSize: 11, fontWeight: 700, color: '#000'
                }}>{badge}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>{pkg.name}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--gold-light)', lineHeight: 1 }}>
                    {fmtK(pkg.power_amount)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: 2, fontWeight: 600 }}>POWER</div>
                </div>
                <div style={{
                  background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                  borderRadius: 12, padding: '8px 16px', marginTop: 4,
                  fontSize: 16, fontWeight: 800, color: '#000'
                }}>
                  {pkg.price_ton} TON
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { label: t('shop.daily'), val: `${perDay}`, unit: 'TON' },
                  { label: t('shop.thirty_days'), val: `${(perDay * 30).toFixed(3)}`, unit: 'TON' },
                  { label: t('shop.payback'), val: t('shop.payback_days', { days: pb }), color: 'var(--green)' },
                ].map(item => (
                  <div key={item.label} className="stat-pill">
                    <div className="label">{item.label}</div>
                    <div className="value" style={{ color: item.color || 'var(--gold-light)', fontSize: 13 }}>{item.val}</div>
                    {item.unit && <div className="sub">{item.unit}</div>}
                  </div>
                ))}
              </div>

              <button className="btn-gold" onClick={() => handleBuy(pkg)} disabled={loading}>
                {loading ? t('shop.creating_order') : t('shop.buy_for', { price: pkg.price_ton })}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
