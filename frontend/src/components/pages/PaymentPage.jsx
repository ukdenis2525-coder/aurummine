import React, { useEffect, useState, useRef } from 'react';
import api from '../../utils/api.js';
import { fmtK } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';

const HOUR = 60 * 60;

export default function PaymentPage({ order, pkg, wallet, expiresAt, onCancel, onSuccess }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [status, setStatus] = useState('pending');
  const [copying, setCopying] = useState('');
  const pollRef = useRef(null);
  const { t } = useTranslation();

  useEffect(() => {
    const update = () => {
      const left = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) setStatus('expired');
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get('/shop/order-status');
        if (!data) {
          const hist = await api.get('/shop/order-history');
          if (hist.data?.last_status === 'completed') {
            setStatus('completed');
            setTimeout(onSuccess, 2000);
          }
        }
      } catch (e) {}
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  const copy = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopying(key);
    setTimeout(() => setCopying(''), 1500);
  };

  const handleCancel = async () => {
    await api.post('/shop/cancel-order');
    onCancel();
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = timeLeft / HOUR;

  if (status === 'completed') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, gap: 16
      }}>
        <div style={{ fontSize: 64, animation: 'pulse 1s ease' }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{t('payment.payment_received')}</div>
        <div style={{ fontSize: 15, color: 'var(--text-secondary)', textAlign: 'center' }}>
          {t('payment.power_credited', { power: fmtK(pkg.power_amount) })}
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, gap: 16
      }}>
        <div style={{ fontSize: 64 }}>⏰</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)' }}>{t('payment.time_expired')}</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
          {t('payment.expired_text')}
        </div>
        <button className="btn-outline" onClick={onCancel} style={{ maxWidth: 280, marginTop: 8 }}>
          {t('payment.back_to_shop')}
        </button>
      </div>
    );
  }

  const CopyBtn = ({ value, id, label }) => (
    <button onClick={() => copy(value, id)} style={{
      background: copying === id ? 'var(--green)' : 'var(--bg-card)',
      border: `1px solid ${copying === id ? 'var(--green)' : 'var(--border)'}`,
      borderRadius: 10, padding: '10px 16px', color: '#fff',
      fontSize: 12, fontWeight: 600, width: '100%',
      cursor: 'pointer', transition: 'var(--transition)'
    }}>
      {copying === id ? t('payment.copied') : label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '20px 16px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={handleCancel} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          color: '#fff', padding: '10px 14px', fontSize: 16, cursor: 'pointer'
        }}>←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)' }}>{t('payment.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('payment.subtitle')}</div>
        </div>
      </div>

      {/* Package info */}
      <div className="card" style={{
        border: '1px solid var(--border-gold)', marginBottom: 14, textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.02))'
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{pkg.name}</div>
        <div style={{ fontSize: 40, fontWeight: 900, color: 'var(--gold-light)', lineHeight: 1 }}>
          {fmtK(pkg.power_amount)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--gold)', letterSpacing: 2, marginBottom: 10 }}>POWER</div>
        <div style={{ fontSize: 26, fontWeight: 900 }}>
          {pkg.price_ton} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>TON</span>
        </div>
      </div>

      {/* Timer */}
      <div className="card" style={{ marginBottom: 14, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('payment.time_to_pay')}</span>
          <span style={{
            fontSize: 20, fontWeight: 800, fontFamily: "'Inter', monospace",
            color: timeLeft < 300 ? 'var(--red)' : timeLeft < 600 ? 'var(--orange)' : 'var(--gold)'
          }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 6, width: `${progress * 100}%`,
            background: timeLeft < 300 ? 'var(--red)' : 'linear-gradient(90deg, var(--gold-dark), var(--gold))',
            transition: 'width 1s linear'
          }} />
        </div>
      </div>

      {/* Steps */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 18 }}>{t('payment.instruction')}</div>

        {/* Step 1 */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('payment.step1')}</div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '14px 16px',
            border: '1px solid var(--border-gold)'
          }}>
            <div>
              <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--gold-light)' }}>{pkg.price_ton}</span>
              <span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 6 }}>TON</span>
            </div>
            <CopyBtn value={String(pkg.price_ton)} id="amount" label={t('payment.copy')} />
          </div>
        </div>

        {/* Step 2 */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('payment.step2')}</div>
          <div style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '14px 16px',
            border: '1px solid var(--border)'
          }}>
            <div style={{
              fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all',
              marginBottom: 10, fontFamily: "'Inter', monospace", lineHeight: 1.5
            }}>{wallet}</div>
            <CopyBtn value={wallet} id="wallet" label={t('payment.copy_address')} />
          </div>
        </div>

        {/* Step 3 — MEMO */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('payment.step3')}</div>
          <div style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.03))',
            borderRadius: 14, padding: '16px', border: '2px solid var(--gold)'
          }}>
            <div style={{
              fontSize: 26, fontWeight: 900, color: 'var(--gold-light)',
              letterSpacing: 4, textAlign: 'center', marginBottom: 12,
              fontFamily: "'Inter', monospace"
            }}>{order.memo}</div>
            <CopyBtn value={order.memo} id="memo" label={t('payment.copy_memo')} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8, textAlign: 'center' }}>
            {t('payment.no_memo_warning')}
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="card" style={{
        marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--green-bg)', border: '1px solid rgba(52,211,153,0.15)'
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: 'var(--green)',
          animation: 'blink 1.5s ease-in-out infinite', flexShrink: 0
        }} />
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {t('payment.checking_payment')}
        </div>
      </div>

      {/* Cancel */}
      <button onClick={handleCancel} style={{
        width: '100%', padding: 14, borderRadius: 14,
        background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)',
        color: 'var(--red)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        transition: 'var(--transition)'
      }}>
        {t('payment.cancel_purchase')}
      </button>
    </div>
  );
}
