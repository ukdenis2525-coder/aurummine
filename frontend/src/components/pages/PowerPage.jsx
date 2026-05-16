import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../../store/index.js';
import { fmt, fmtK } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';
import { useInterstitialAd } from '../../hooks/useInterstitialAd.js';
import api from '../../utils/api.js';

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'uk', label: 'UA' },
  { code: 'ar', label: 'AR' },
];

// Floating particle component
function Particles({ count = 20, active }) {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 3 + Math.random() * 4,
      size: 2 + Math.random() * 3,
      opacity: 0.15 + Math.random() * 0.35,
    }));
  }, [count]);

  if (!active) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: '50%' }}>
      {particles.map(p => (
        <div key={p.id} className="anim-particle" style={{
          position: 'absolute',
          left: `${p.left}%`,
          bottom: '-10%',
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: 'var(--gold)',
          opacity: p.opacity,
          animationDuration: `${p.duration}s`,
          animationDelay: `${p.delay}s`,
        }} />
      ))}
    </div>
  );
}

// Isolated hash counter — updates every second WITHOUT re-rendering parent
const LiveHashCounter = React.memo(function LiveHashCounter({ mining, tonPerHash }) {
  const [liveHashes, setLiveHashes] = useState(0);

  useEffect(() => {
    if (!mining) return;
    setLiveHashes(parseFloat(mining.hashes || 0));
    const hps = (mining.hashes_per_day || 0) / 86400;
    if (hps <= 0) return;
    const interval = setInterval(() => setLiveHashes(prev => prev + hps), 1000);
    return () => clearInterval(interval);
  }, [mining]);

  return (
    <>
      <div style={{
        fontSize: 32, fontWeight: 900,
        background: 'linear-gradient(135deg, var(--gold-light), var(--gold))',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        fontFamily: "'Inter', monospace", letterSpacing: -0.5, marginBottom: 4,
        position: 'relative',
      }}>
        {liveHashes.toFixed(8)}
        <span style={{
          fontSize: 12, fontWeight: 500, marginLeft: 6,
          WebkitTextFillColor: 'var(--text-muted)',
        }}>hashes</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
        ≈ {(liveHashes * (tonPerHash || 0)).toFixed(8)} TON
      </div>
    </>
  );
});

// Track hash value via ref (no re-renders) for button logic
function useHashRef(mining) {
  const ref = useRef(0);
  useEffect(() => {
    if (!mining) return;
    ref.current = parseFloat(mining.hashes || 0);
    const hps = (mining.hashes_per_day || 0) / 86400;
    if (hps <= 0) return;
    const iv = setInterval(() => { ref.current += hps; }, 1000);
    return () => clearInterval(iv);
  }, [mining]);
  return ref;
}

export default function PowerPage() {
  const { user, mining, fetchMining, collect, setTab, isAdmin, ambassadorVisible } = useStore();
  const { t, i18n } = useTranslation();
  const [showLang, setShowLang] = useState(false);
  const { showAdThen: monetagShowAd } = useInterstitialAd();

  // Adsgram interstitial
  const adsgramIntRef = useRef(null);

  useEffect(() => {
    api.get('/tasks/ad-config').then(r => {
      const blockId = r.data?.adsgram_interstitial_block_id;
      if (!blockId) return;
      const tryInit = () => {
        if (window.Adsgram) {
          try {
            adsgramIntRef.current = window.Adsgram.init({ blockId });
            console.log('[Adsgram] Interstitial init OK, blockId:', blockId);
          } catch (e) { console.error('[Adsgram] Interstitial init error:', e); }
          return true;
        }
        return false;
      };
      if (!tryInit()) {
        const iv = setInterval(() => { if (tryInit()) clearInterval(iv); }, 500);
        setTimeout(() => clearInterval(iv), 5000);
      }
    }).catch(() => {});
  }, []);

  const showAdThen = useCallback(async (callback) => {
    if (adsgramIntRef.current) {
      try {
        await adsgramIntRef.current.show();
        console.log('[Adsgram] Interstitial shown');
      } catch (e) {
        console.log('[Adsgram] Interstitial skipped:', e);
      }
    }
    callback();
  }, []);

  const changeLang = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('aurummine_lang', code);
    setShowLang(false);
  };
  const [collecting, setCollecting] = useState(false);
  const [collected, setCollected] = useState(null);
  const [orbPulse, setOrbPulse] = useState(false);
  const hashRef = useHashRef(mining);

  useEffect(() => { fetchMining(); }, []);

  const doExchange = async () => {
    if (collecting) return;
    if (hashRef.current <= 0) { setTab('withdraw'); return; }
    setCollecting(true);
    setOrbPulse(true);
    try {
      const res = await collect();
      setCollected(res.ton_earned);
      setTimeout(() => setTab('withdraw'), 1500);
    } finally {
      setCollecting(false);
      setTimeout(() => setOrbPulse(false), 600);
    }
  };

  const handleCollectAndWithdraw = () => {
    if (collecting) return;
    monetagShowAd(doExchange);
  };

  const power = parseFloat(user?.power || 0);
  const tonBalance = parseFloat(user?.ton_balance || 0);
  const hashesPerDay = mining?.hashes_per_day || 0;
  const powerPct = Math.min(power / 10000, 100);

  return (
    <div className="page" style={{ position: 'relative' }}>

      {/* ── Ambient background effects ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 50%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', top: '30%', left: '-20%', width: '140%', height: '60%',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(212,175,55,0.03) 0%, transparent 60%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, position: 'relative', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
          }}>⚡</div>
          <div>
            <div style={{
              fontSize: 18, fontWeight: 900, letterSpacing: 2.5,
              background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{t('power.brand')}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1 }}>{t('power.subtitle')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isAdmin && (
            <button onClick={() => setTab('admin')} style={{
              background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 12, padding: '8px 12px', cursor: 'pointer',
              fontSize: 16, lineHeight: 1
            }}>🛡️</button>
          )}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowLang(!showLang)} className="lang-btn">
              🌐 {LANGS.find(l => l.code === i18n.language)?.label || 'EN'}
            </button>
            {showLang && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                background: 'rgba(18,18,26,0.98)',
                border: '1px solid var(--border-gold)', borderRadius: 12,
                padding: 4, zIndex: 100, minWidth: 80,
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
        </div>
      </div>

      {/* ── Balance Card ── */}
      <div onClick={() => showAdThen(() => setTab('withdraw'))} style={{
        background: 'linear-gradient(135deg, rgba(212,175,55,0.06), rgba(212,175,55,0.02))',
        border: '1px solid rgba(212,175,55,0.12)',
        borderRadius: 16, padding: '14px 18px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', position: 'relative', zIndex: 1, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>💎</div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{t('power.balance')}</div>
            <div style={{
              fontSize: 20, fontWeight: 900,
              background: 'linear-gradient(135deg, var(--gold-light), var(--gold))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{fmt(tonBalance, 4)} <span style={{ fontSize: 13, fontWeight: 700 }}>TON</span></div>
          </div>
        </div>
        <div style={{
          fontSize: 18, color: 'var(--gold)', opacity: 0.5,
        }}>›</div>
      </div>

      {/* ── Ambassador Button ── */}
      {ambassadorVisible && (
      <button onClick={() => setTab('ambassador')} style={{
        width: '100%', padding: '12px 18px', marginBottom: 20,
        borderRadius: 14, border: '1px solid rgba(59,130,246,0.2)',
        background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.06))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', position: 'relative', zIndex: 1, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>🤝</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#3b82f6' }}>{t('power.ambassador', 'Амбассадор')}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.5 }}>{t('power.ambassador_desc', 'Стань партнёром — зарабатывай больше')}</div>
          </div>
        </div>
        <div style={{ fontSize: 18, color: '#3b82f6', opacity: 0.5 }}>›</div>
      </button>
      )}

      {/* ── Mining Orb ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        marginBottom: 24, position: 'relative', zIndex: 1,
        padding: '10px 0',
        isolation: 'isolate',
      }}>
        {/* Multi-layer background glow */}
        <div className="anim-glow" style={{
          position: 'absolute', width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,175,55,0.12) 0%, rgba(212,175,55,0.04) 40%, transparent 70%)',
          filter: 'blur(40px)', top: -40,
        }} />
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,175,55,0.18) 0%, transparent 60%)',
          filter: 'blur(25px)', top: 0,
        }} />

        {/* Rotating ring — outer */}
        {power > 0 && (
          <div className="anim-spin-slow" style={{
            position: 'absolute', width: 210, height: 210, borderRadius: '50%',
            border: '1px solid rgba(212,175,55,0.06)',
            top: -5,
          }}>
            <div style={{
              position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)',
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--gold)', boxShadow: '0 0 12px var(--gold)',
            }} />
            <div style={{
              position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)',
              width: 4, height: 4, borderRadius: '50%',
              background: 'var(--gold)', opacity: 0.5, boxShadow: '0 0 8px var(--gold)',
            }} />
          </div>
        )}

        {/* Rotating ring — inner dashed */}
        {power > 0 && (
          <div className="anim-spin-reverse" style={{
            position: 'absolute', width: 230, height: 230, borderRadius: '50%',
            border: '1px dashed rgba(212,175,55,0.04)',
            top: -15,
          }} />
        )}

        {/* Outer SVG ring (replaces conic-gradient — Android WebView safe) */}
        <div className={orbPulse ? 'anim-orb-collect' : (power > 0 ? 'anim-float' : '')} style={{
          width: 185, height: 185, borderRadius: '50%',
          position: 'relative',
          boxShadow: power > 0
            ? '0 0 40px rgba(212,175,55,0.15), 0 0 80px rgba(212,175,55,0.05)'
            : 'none',
          transition: 'box-shadow 0.5s ease',
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}>
          {/* SVG progress ring */}
          <svg width="185" height="185" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
            {/* Background track */}
            <circle cx="92.5" cy="92.5" r="88" fill="none"
              stroke="rgba(255,255,255,0.03)" strokeWidth="5" />
            {/* Progress arc */}
            <circle cx="92.5" cy="92.5" r="88" fill="none"
              stroke="var(--gold)" strokeWidth="5"
              strokeDasharray={`${(powerPct / 100) * 2 * Math.PI * 88} ${2 * Math.PI * 88}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.5s ease' }} />
          </svg>

          {/* Particles */}
          <Particles count={18} active={power > 0} />

          {/* Inner circle */}
          <div style={{
            position: 'absolute', inset: 5, borderRadius: '50%',
            background: 'linear-gradient(145deg, #0a0a12, #12121c)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 1,
          }}>
            {/* Inner subtle ring */}
            <div style={{
              position: 'absolute', inset: 6, borderRadius: '50%',
              border: '1px solid rgba(212,175,55,0.06)',
            }} />
            {/* Second inner ring */}
            <div style={{
              position: 'absolute', inset: 10, borderRadius: '50%',
              border: '1px solid rgba(212,175,55,0.03)',
            }} />

            <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 6, fontWeight: 600 }}>
              POWER
            </div>
            <div style={{
              fontSize: 42, fontWeight: 900, lineHeight: 1,
              background: 'linear-gradient(180deg, var(--gold-light) 0%, var(--gold) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 2px 10px rgba(212,175,55,0.35))',
            }}>
              {fmtK(Math.floor(power))}
            </div>
            {power > 0 && (
              <div style={{
                fontSize: 9, color: 'var(--green)', marginTop: 10,
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 12px', borderRadius: 20,
                background: 'rgba(52,211,153,0.08)',
                border: '1px solid rgba(52,211,153,0.1)',
              }}>
                <span className="anim-blink" style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--green)',
                  boxShadow: '0 0 6px var(--green)',
                }} />
                {t('power.mining_active')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Earnings Grid ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
        marginBottom: 14, position: 'relative', zIndex: 1,
      }}>
        {[
          { label: t('power.day'), val: fmt(mining?.ton_per_day, 5), icon: '📅' },
          { label: t('power.month'), val: fmt(mining?.ton_per_month, 4), icon: '📆' },
          { label: t('power.three_months'), val: fmt(mining?.ton_per_3months, 3), icon: '🗓️' },
        ].map((item, i) => (
          <div key={item.label} style={{
            animation: `fadeIn 0.4s ease ${i * 0.1}s both`,
            background: 'linear-gradient(145deg, rgba(212,175,55,0.05), rgba(0,0,0,0.25))',
            border: '1px solid rgba(212,175,55,0.08)',
            borderRadius: 14, padding: '14px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 6 }}>{item.label}</div>
            <div style={{
              fontSize: 15, fontWeight: 800,
              background: 'linear-gradient(135deg, var(--gold-light), var(--gold))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{item.val}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>TON</div>
          </div>
        ))}
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14, position: 'relative', zIndex: 1 }}>
        <button className="btn-gold" onClick={() => setTab('shop')} style={{
          padding: '14px 16px', fontSize: 13, borderRadius: 14,
          boxShadow: '0 4px 20px rgba(212,175,55,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span>⚡</span> {t('power.buy_power')}
          <span style={{ fontSize: 14, marginLeft: 2, opacity: 0.6 }}>›</span>
        </button>
        <button className="btn-outline" onClick={() => setTab('tasks')} style={{
          padding: '14px 16px', fontSize: 13, borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(52,211,153,0.06), rgba(52,211,153,0.02))',
          borderColor: 'rgba(52,211,153,0.2)', color: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span>🎁</span> {t('power.free_power')}
          <span style={{ fontSize: 14, marginLeft: 2, opacity: 0.6 }}>›</span>
        </button>
      </div>

      {/* ── Hashes Card ── */}
      <div style={{
        marginBottom: 16, position: 'relative', zIndex: 1, overflow: 'hidden',
        background: 'linear-gradient(145deg, rgba(212,175,55,0.04), rgba(0,0,0,0.3))',
        border: '1px solid rgba(212,175,55,0.1)',
        borderRadius: 20, padding: 20,
      }}>
        {/* Shimmer effect on card */}
        {power > 0 && (
          <div className="anim-shimmer" style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.03), transparent)',
            backgroundSize: '200% 100%',
            pointerEvents: 'none',
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 11,
              background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>⛏️</div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', letterSpacing: 1, fontWeight: 700 }}>{t('power.mined')}</span>
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)',
            padding: '4px 12px', borderRadius: 20,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {hashesPerDay.toFixed(1)} {t('power.h_per_day')}
          </div>
        </div>

        <LiveHashCounter mining={mining} tonPerHash={mining?.ton_per_hash} />

        {/* Success toast */}
        {collected !== null && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(52,211,153,0.1), rgba(52,211,153,0.05))',
            border: '1px solid rgba(52,211,153,0.25)',
            borderRadius: 12, padding: '14px 16px', marginBottom: 14,
            color: 'var(--green)', fontWeight: 700, textAlign: 'center',
            fontSize: 14, animation: 'fadeIn 0.3s ease',
            boxShadow: '0 4px 20px rgba(52,211,153,0.1)',
          }}>
            {t('power.collected_success', { amount: fmt(collected, 6) })}
          </div>
        )}

        <button
          className="btn-gold"
          onClick={handleCollectAndWithdraw}
          disabled={collecting || (parseFloat(mining?.hashes || 0) <= 0 && tonBalance <= 0)}
          style={{
            boxShadow: parseFloat(mining?.hashes || 0) > 0 ? '0 4px 24px rgba(212,175,55,0.25)' : 'none',
            position: 'relative', overflow: 'hidden', borderRadius: 14,
          }}
        >
          {/* Button shimmer */}
          {power > 0 && (
            <span className="anim-shimmer-fast" style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
              backgroundSize: '200% 100%',
            }} />
          )}
          <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span>💎</span>
            {collecting ? t('power.exchanging') : t('power.exchange_btn')}
          </span>
        </button>
      </div>
    </div>
  );
}
