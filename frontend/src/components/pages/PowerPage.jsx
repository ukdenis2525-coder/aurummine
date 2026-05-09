import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/index.js';
import { fmt, fmtK } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';
import { useInterstitialAd } from '../../hooks/useInterstitialAd.js';

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'uk', label: 'UA' },
  { code: 'ar', label: 'AR' },
];

export default function PowerPage() {
  const { user, mining, fetchMining, collect, setTab, isAdmin } = useStore();
  const { t, i18n } = useTranslation();
  const [showLang, setShowLang] = useState(false);
  const { showAdThen } = useInterstitialAd();

  const changeLang = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('aurummine_lang', code);
    setShowLang(false);
  };
  const [collecting, setCollecting] = useState(false);
  const [collected, setCollected] = useState(null);
  const [liveHashes, setLiveHashes] = useState(0);

  useEffect(() => { fetchMining(); }, []);

  useEffect(() => {
    if (!mining) return;
    setLiveHashes(parseFloat(mining.hashes || 0));
    const hps = (mining.hashes_per_day || 0) / 86400;
    const interval = setInterval(() => setLiveHashes(prev => prev + hps), 1000);
    return () => clearInterval(interval);
  }, [mining]);

  const doExchange = async () => {
    if (collecting) return;

    // If no hashes — go straight to withdraw
    if (liveHashes <= 0) {
      setTab('withdraw');
      return;
    }

    setCollecting(true);
    try {
      const res = await collect();
      setCollected(res.ton_earned);
      setLiveHashes(0);
      setTimeout(() => setTab('withdraw'), 1500);
    } finally {
      setCollecting(false);
    }
  };

  // Show interstitial ad before exchange
  const handleCollectAndWithdraw = () => {
    if (collecting) return;
    showAdThen(doExchange);
  };

  const power = parseFloat(user?.power || 0);
  const tonBalance = parseFloat(user?.ton_balance || 0);
  const hashesPerDay = mining?.hashes_per_day || 0;

  return (
    <div className="page">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, animation: 'pulse 3s ease-in-out infinite'
          }}>⚡</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)', letterSpacing: 1.5 }}>{t('power.brand')}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5 }}>{t('power.subtitle')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isAdmin && (
            <button onClick={() => setTab('admin')} style={{
              background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 12, padding: '8px 12px', cursor: 'pointer',
              fontSize: 16, lineHeight: 1
            }}>🛡️</button>
          )}
          {/* Language switcher */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowLang(!showLang)} className="lang-btn">
              🌐 {LANGS.find(l => l.code === i18n.language)?.label || 'EN'}
            </button>
            {showLang && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                background: 'rgba(18,18,26,0.98)', backdropFilter: 'blur(20px)',
                border: '1px solid var(--border-gold)', borderRadius: 12,
                padding: 4, zIndex: 50, minWidth: 80,
                animation: 'fadeIn 0.2s ease'
              }}>
                {LANGS.map(l => (
                  <button key={l.code} onClick={() => changeLang(l.code)} style={{
                    display: 'block', width: '100%', padding: '8px 14px',
                    background: i18n.language === l.code ? 'rgba(212,175,55,0.12)' : 'transparent',
                    border: 'none', borderRadius: 8,
                    color: i18n.language === l.code ? 'var(--gold)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    textAlign: 'left', transition: 'var(--transition)'
                  }}>{l.label}</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setTab('withdraw')} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-gold)',
          borderRadius: 14, padding: '8px 14px', cursor: 'pointer', textAlign: 'right'
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5 }}>{t('power.balance')}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold-light)' }}>{fmt(tonBalance, 4)} TON</div>
        </button>
        </div>
      </div>

      {/* ── Mining Orb ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        marginBottom: 24, position: 'relative'
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,175,55,0.15) 0%, transparent 70%)',
          filter: 'blur(30px)', top: -20
        }} />

        {/* Outer ring */}
        <div style={{
          width: 160, height: 160, borderRadius: '50%',
          background: `conic-gradient(var(--gold) ${Math.min(power / 10000, 100)}%, transparent 0)`,
          padding: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: power > 0 ? 'glow 3s ease-in-out infinite' : 'none',
          position: 'relative'
        }}>
          {/* Inner circle */}
          <div style={{
            width: '100%', height: '100%', borderRadius: '50%',
            background: 'linear-gradient(135deg, #0a0a10, #12121a)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 4 }}>{t('power.power_label')}</div>
            <div style={{
              fontSize: 32, fontWeight: 900, color: 'var(--gold-light)',
              lineHeight: 1, animation: 'countUp 0.5s ease'
            }}>
              {fmtK(Math.floor(power))}
            </div>
            {power > 0 && (
              <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'blink 2s infinite' }} />
                {t('power.mining_active')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Earnings Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: t('power.day'), val: fmt(mining?.ton_per_day, 5) },
          { label: t('power.month'), val: fmt(mining?.ton_per_month, 4) },
          { label: t('power.three_months'), val: fmt(mining?.ton_per_3months, 3) },
        ].map(item => (
          <div key={item.label} className="stat-pill">
            <div className="label">{item.label}</div>
            <div className="value">{item.val}</div>
            <div className="sub">TON</div>
          </div>
        ))}
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <button className="btn-gold" onClick={() => setTab('shop')}>
          {t('power.buy_power')}
        </button>
        <button className="btn-outline" onClick={() => setTab('tasks')}>
          {t('power.free_power')}
        </button>
      </div>

      {/* ── Hashes Card ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>⛏️</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: 1, fontWeight: 600 }}>{t('power.mined')}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {hashesPerDay.toFixed(1)} {t('power.h_per_day')}
          </div>
        </div>

        <div style={{
          fontSize: 28, fontWeight: 900, color: 'var(--gold)',
          fontFamily: "'Inter', monospace", letterSpacing: -0.5, marginBottom: 2
        }}>
          {liveHashes.toFixed(8)}
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 6 }}>{t('power.hashes')}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
          ≈ {(liveHashes * (mining?.ton_per_hash || 0)).toFixed(8)} TON
        </div>

        {/* Success toast */}
        {collected !== null && (
          <div style={{
            background: 'var(--green-bg)', border: '1px solid rgba(52,211,153,0.3)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 14,
            color: 'var(--green)', fontWeight: 600, textAlign: 'center',
            fontSize: 14, animation: 'fadeIn 0.3s ease'
          }}>
            {t('power.collected_success', { amount: fmt(collected, 6) })}
          </div>
        )}

        <button
          className="btn-gold"
          onClick={handleCollectAndWithdraw}
          disabled={collecting || (liveHashes <= 0 && tonBalance <= 0)}
        >
          {collecting ? t('power.exchanging') : t('power.exchange_btn')}
        </button>
      </div>
    </div>
  );
}
