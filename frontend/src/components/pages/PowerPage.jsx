import React, { useEffect, useState, useMemo } from 'react';
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
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.left}%`,
          bottom: '-10%',
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: 'var(--gold)',
          opacity: p.opacity,
          animation: `particleRise ${p.duration}s ease-in-out ${p.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

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
  const [orbPulse, setOrbPulse] = useState(false);

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
    if (liveHashes <= 0) { setTab('withdraw'); return; }
    setCollecting(true);
    setOrbPulse(true);
    try {
      const res = await collect();
      setCollected(res.ton_earned);
      setLiveHashes(0);
      setTimeout(() => setTab('withdraw'), 1500);
    } finally {
      setCollecting(false);
      setTimeout(() => setOrbPulse(false), 600);
    }
  };

  const handleCollectAndWithdraw = () => {
    if (collecting) return;
    showAdThen(doExchange);
  };

  const power = parseFloat(user?.power || 0);
  const tonBalance = parseFloat(user?.ton_balance || 0);
  const hashesPerDay = mining?.hashes_per_day || 0;
  const powerPct = Math.min(power / 10000, 100);

  return (
    <div className="page" style={{ position: 'relative' }}>

      {/* ── Ambient background effects ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '100vh',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.06) 0%, transparent 60%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, animation: 'pulse 3s ease-in-out infinite',
            boxShadow: '0 4px 20px rgba(212,175,55,0.25)',
          }}>⚡</div>
          <div>
            <div style={{
              fontSize: 17, fontWeight: 900, letterSpacing: 2,
              background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{t('power.brand')}</div>
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
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowLang(!showLang)} className="lang-btn">
              🌐 {LANGS.find(l => l.code === i18n.language)?.label || 'EN'}
            </button>
            {showLang && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                background: 'rgba(18,18,26,0.98)', backdropFilter: 'blur(20px)',
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
          <button onClick={() => setTab('withdraw')} style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.03))',
            border: '1px solid var(--border-gold)',
            borderRadius: 14, padding: '8px 14px', cursor: 'pointer', textAlign: 'right',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5 }}>{t('power.balance')}</div>
            <div style={{
              fontSize: 15, fontWeight: 800,
              background: 'linear-gradient(135deg, var(--gold), #fff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{fmt(tonBalance, 4)} TON</div>
          </button>
        </div>
      </div>

      {/* ── Mining Orb ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        marginBottom: 28, position: 'relative', zIndex: 1,
      }}>
        {/* Multi-layer background glow */}
        <div style={{
          position: 'absolute', width: 260, height: 260, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,175,55,0.12) 0%, rgba(212,175,55,0.04) 40%, transparent 70%)',
          filter: 'blur(40px)', top: -50,
          animation: 'glow 4s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 180, height: 180, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, transparent 60%)',
          filter: 'blur(20px)', top: -10,
        }} />

        {/* Rotating ring */}
        {power > 0 && (
          <div style={{
            position: 'absolute', width: 190, height: 190, borderRadius: '50%',
            border: '1px solid rgba(212,175,55,0.08)',
            animation: 'spin 20s linear infinite',
            top: -15,
          }}>
            <div style={{
              position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)',
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--gold)', boxShadow: '0 0 10px var(--gold)',
            }} />
          </div>
        )}

        {/* Second rotating ring (opposite) */}
        {power > 0 && (
          <div style={{
            position: 'absolute', width: 210, height: 210, borderRadius: '50%',
            border: '1px dashed rgba(212,175,55,0.05)',
            animation: 'spin 30s linear infinite reverse',
            top: -25,
          }} />
        )}

        {/* Outer conic gradient ring */}
        <div style={{
          width: 168, height: 168, borderRadius: '50%',
          background: `conic-gradient(var(--gold) ${powerPct}%, rgba(255,255,255,0.03) 0)`,
          padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: power > 0
            ? '0 0 30px rgba(212,175,55,0.15), 0 0 60px rgba(212,175,55,0.05), inset 0 0 30px rgba(212,175,55,0.05)'
            : 'none',
          position: 'relative',
          animation: orbPulse ? 'orbCollect 0.6s ease' : (power > 0 ? 'float 6s ease-in-out infinite' : 'none'),
          transition: 'box-shadow 0.5s ease',
        }}>
          {/* Particles */}
          <Particles count={15} active={power > 0} />

          {/* Inner circle */}
          <div style={{
            width: '100%', height: '100%', borderRadius: '50%',
            background: 'linear-gradient(145deg, #0c0c14, #14141e)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 1,
          }}>
            {/* Inner subtle ring */}
            <div style={{
              position: 'absolute', inset: 6, borderRadius: '50%',
              border: '1px solid rgba(212,175,55,0.08)',
            }} />

            <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 4, fontWeight: 600 }}>
              {t('power.power_label')}
            </div>
            <div style={{
              fontSize: 36, fontWeight: 900,
              background: 'linear-gradient(180deg, var(--gold-light) 0%, var(--gold) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              lineHeight: 1, animation: 'countUp 0.5s ease',
              filter: 'drop-shadow(0 2px 8px rgba(212,175,55,0.3))',
            }}>
              {fmtK(Math.floor(power))}
            </div>
            {power > 0 && (
              <div style={{
                fontSize: 9, color: 'var(--green)', marginTop: 8,
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 20,
                background: 'rgba(52,211,153,0.08)',
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--green)',
                  animation: 'blink 2s infinite',
                  boxShadow: '0 0 6px var(--green)',
                }} />
                {t('power.mining_active')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Earnings Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16, position: 'relative', zIndex: 1 }}>
        {[
          { label: t('power.day'), val: fmt(mining?.ton_per_day, 5), icon: '📅' },
          { label: t('power.month'), val: fmt(mining?.ton_per_month, 4), icon: '📆' },
          { label: t('power.three_months'), val: fmt(mining?.ton_per_3months, 3), icon: '🗓️' },
        ].map((item, i) => (
          <div key={item.label} className="stat-pill" style={{
            animation: `fadeIn 0.4s ease ${i * 0.1}s both`,
            background: 'linear-gradient(145deg, rgba(212,175,55,0.04), rgba(0,0,0,0.2))',
            border: '1px solid rgba(212,175,55,0.08)',
          }}>
            <div style={{ fontSize: 12, marginBottom: 2 }}>{item.icon}</div>
            <div className="label">{item.label}</div>
            <div className="value" style={{
              background: 'linear-gradient(135deg, var(--gold-light), var(--gold))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{item.val}</div>
            <div className="sub">TON</div>
          </div>
        ))}
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, position: 'relative', zIndex: 1 }}>
        <button className="btn-gold" onClick={() => setTab('shop')} style={{
          boxShadow: '0 4px 20px rgba(212,175,55,0.2)',
        }}>
          {t('power.buy_power')}
        </button>
        <button className="btn-outline" onClick={() => setTab('tasks')} style={{
          background: 'linear-gradient(135deg, rgba(52,211,153,0.06), rgba(52,211,153,0.02))',
          borderColor: 'rgba(52,211,153,0.2)',
        }}>
          {t('power.free_power')}
        </button>
      </div>

      {/* ── Hashes Card ── */}
      <div className="card" style={{
        marginBottom: 16, position: 'relative', zIndex: 1, overflow: 'hidden',
        background: 'linear-gradient(145deg, rgba(212,175,55,0.03), rgba(0,0,0,0.3))',
        border: '1px solid rgba(212,175,55,0.1)',
      }}>
        {/* Shimmer effect on card */}
        {power > 0 && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.03), transparent)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>⛏️</div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', letterSpacing: 1, fontWeight: 700 }}>{t('power.mined')}</span>
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)',
            padding: '3px 10px', borderRadius: 20,
            background: 'rgba(255,255,255,0.03)',
          }}>
            {hashesPerDay.toFixed(1)} {t('power.h_per_day')}
          </div>
        </div>

        <div style={{
          fontSize: 30, fontWeight: 900,
          background: 'linear-gradient(135deg, var(--gold-light), var(--gold))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          fontFamily: "'Inter', monospace", letterSpacing: -0.5, marginBottom: 4,
          position: 'relative',
        }}>
          {liveHashes.toFixed(8)}
          <span style={{
            fontSize: 12, fontWeight: 500, marginLeft: 6,
            WebkitTextFillColor: 'var(--text-muted)',
          }}>{t('power.hashes')}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
          ≈ {(liveHashes * (mining?.ton_per_hash || 0)).toFixed(8)} TON
        </div>

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
          disabled={collecting || (liveHashes <= 0 && tonBalance <= 0)}
          style={{
            boxShadow: liveHashes > 0 ? '0 4px 24px rgba(212,175,55,0.25)' : 'none',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Button shimmer */}
          {liveHashes > 0 && (
            <span style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s ease-in-out infinite',
            }} />
          )}
          <span style={{ position: 'relative' }}>
            {collecting ? t('power.exchanging') : t('power.exchange_btn')}
          </span>
        </button>
      </div>
    </div>
  );
}
