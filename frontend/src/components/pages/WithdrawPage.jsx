import React, { useState, useEffect, useMemo } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';
import { fmt } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';
import { useInterstitialAd } from '../../hooks/useInterstitialAd.js';

// Fee calculation — mirrors backend logic
const calcFee = (amount, settings) => {
  const { withdraw_fee_mode, withdraw_fee_fixed, withdraw_fee_percent, withdraw_fee_hybrid_threshold } = settings;
  if (!amount || amount <= 0 || withdraw_fee_mode === 'none') return 0;
  let fee = 0;
  if (withdraw_fee_mode === 'fixed') {
    fee = withdraw_fee_fixed;
  } else if (withdraw_fee_mode === 'percent') {
    fee = amount * (withdraw_fee_percent / 100);
  } else if (withdraw_fee_mode === 'hybrid') {
    if (amount <= withdraw_fee_hybrid_threshold) {
      fee = withdraw_fee_fixed;
    } else {
      fee = amount * (withdraw_fee_percent / 100);
    }
  }
  return Math.min(fee, amount);
};

export default function WithdrawPage() {
  const { user, refreshUser, setTab, appSettings } = useStore();
  const { t } = useTranslation();
  const [wallet, setWallet] = useState('');
  const [amount, setAmount] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const { showAdThen } = useInterstitialAd();

  const MIN_WITHDRAW = appSettings?.min_withdraw_ton || 0.1;
  const balance = parseFloat(user?.ton_balance || 0);

  // Calculate fee preview
  const amt = parseFloat(amount) || 0;
  const fee = useMemo(() => calcFee(amt, appSettings), [amt, appSettings]);
  const netAmount = Math.max(0, amt - fee);
  const hasFee = appSettings?.withdraw_fee_mode && appSettings.withdraw_fee_mode !== 'none';

  useEffect(() => {
    api.get('/withdraw/history').then(r => setHistory(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setError(null);
    if (!wallet || wallet.length < 48) return setError(t('withdraw.invalid_address'));
    if (!amt || amt < MIN_WITHDRAW) return setError(t('withdraw.min_error', { min: MIN_WITHDRAW }));
    if (amt > balance) return setError(t('withdraw.insufficient'));
    if (netAmount <= 0) return setError(t('withdraw.fee_exceeds'));

    setLoading(true);
    try {
      await api.post('/withdraw', { wallet_address: wallet, ton_amount: amt });
      setSuccess(netAmount);
      setAmount('');
      await refreshUser();
      const { data } = await api.get('/withdraw/history');
      setHistory(data);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e.response?.data?.error || t('withdraw.withdraw_error'));
    } finally { setLoading(false); }
  };

  // Fee mode label for display
  const feeLabel = useMemo(() => {
    if (!hasFee || amt <= 0) return null;
    const mode = appSettings.withdraw_fee_mode;
    if (mode === 'fixed') return `${t('withdraw.fee_fixed')}: ${fmt(appSettings.withdraw_fee_fixed, 4)} TON`;
    if (mode === 'percent') return `${t('withdraw.fee_percent')}: ${appSettings.withdraw_fee_percent}%`;
    if (mode === 'hybrid') {
      if (amt <= appSettings.withdraw_fee_hybrid_threshold) {
        return `${t('withdraw.fee_fixed')}: ${fmt(appSettings.withdraw_fee_fixed, 4)} TON (≤${appSettings.withdraw_fee_hybrid_threshold})`;
      }
      return `${t('withdraw.fee_percent')}: ${appSettings.withdraw_fee_percent}% (>${appSettings.withdraw_fee_hybrid_threshold})`;
    }
    return null;
  }, [hasFee, amt, appSettings, t]);

  const statusConfig = {
    pending:   { color: 'var(--orange)', label: t('withdraw.status_pending'), bg: 'rgba(251,191,36,0.1)' },
    completed: { color: 'var(--green)',  label: t('withdraw.status_completed'), bg: 'var(--green-bg)' },
    rejected:  { color: 'var(--red)',    label: t('withdraw.status_rejected'), bg: 'var(--red-bg)' }
  };

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => setTab('power')} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, color: '#fff', padding: '10px 14px', fontSize: 16, cursor: 'pointer'
        }}>←</button>
        <div>
          <div className="page-title" style={{ color: 'var(--gold)', fontSize: 20 }}>{t('withdraw.title')}</div>
          <div className="page-subtitle">{t('withdraw.subtitle')}</div>
        </div>
      </div>

      {/* Balance */}
      <div className="card" style={{
        border: '1px solid var(--border-gold)', marginBottom: 16, textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(212,175,55,0.06), rgba(212,175,55,0.02))'
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 6 }}>{t('withdraw.available')}</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: 'var(--gold-light)' }}>
          {fmt(balance, 4)} <span style={{ fontSize: 16, color: 'var(--gold)' }}>TON</span>
        </div>
      </div>

      {/* Alerts */}
      {success !== null && (
        <div style={{
          background: 'var(--green-bg)', border: '1px solid rgba(52,211,153,0.3)',
          borderRadius: 14, padding: '14px', marginBottom: 14, textAlign: 'center',
          color: 'var(--green)', fontWeight: 600, animation: 'fadeIn 0.3s ease'
        }}>{t('withdraw.request_created', { amount: fmt(success, 4) })}</div>
      )}
      {error && (
        <div style={{
          background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 14, padding: '14px', marginBottom: 14, textAlign: 'center',
          color: 'var(--red)', fontWeight: 600, fontSize: 13, animation: 'fadeIn 0.3s ease'
        }}>❌ {error}</div>
      )}

      {/* Form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{t('withdraw.wallet_address')}</div>
        <input type="text" value={wallet} onChange={e => setWallet(e.target.value.trim())}
          placeholder="UQ... or EQ..." style={{ marginBottom: 16, fontFamily: "'Inter', monospace", fontSize: 13 }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{t('withdraw.amount')}</span>
          <button onClick={() => setAmount(String(fmt(balance, 8)))} style={{
            background: 'rgba(212,175,55,0.1)', border: '1px solid var(--border-gold)',
            borderRadius: 8, color: 'var(--gold)', padding: '4px 12px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer'
          }}>MAX</button>
        </div>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder={t('withdraw.min_amount', { min: MIN_WITHDRAW })} step="0.01"
          style={{ marginBottom: 8, fontSize: 18, fontWeight: 700 }} />

        {/* Fee preview */}
        {hasFee && amt > 0 && (
          <div style={{
            background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
            borderRadius: 10, padding: '10px 12px', marginBottom: 10, animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{feeLabel}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>−{fmt(fee, 4)} TON</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('withdraw.you_receive')}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{fmt(netAmount, 4)} TON</span>
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
          {t('withdraw.processing_time', { min: MIN_WITHDRAW })}
        </div>

        <button className="btn-gold" onClick={() => showAdThen(handleSubmit)}
          disabled={loading || balance < MIN_WITHDRAW}
        >
          {loading ? t('withdraw.processing') : t('withdraw.withdraw_btn')}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            {t('withdraw.history', { count: history.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((w, i) => {
              const cfg = statusConfig[w.status] || statusConfig.pending;
              const wFee = parseFloat(w.fee_amount || 0);
              return (
                <div key={w.id} className="card" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', animation: `fadeIn 0.3s ease ${i * 0.05}s both`
                }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gold-light)' }}>
                      {fmt(w.ton_amount, 4)} TON
                    </div>
                    {wFee > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--orange)' }}>
                        {t('withdraw.fee_label')}: {fmt(wFee, 4)} TON
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {w.wallet_address?.slice(0, 6)}...{w.wallet_address?.slice(-4)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: cfg.color,
                      background: cfg.bg, borderRadius: 6, padding: '2px 8px', marginBottom: 2
                    }}>{cfg.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {new Date(w.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
