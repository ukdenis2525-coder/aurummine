import React, { useEffect, useState, useRef } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';
import { fmtK } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';

const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID || '29774';

const typeIcons = {
  subscribe_channel: '📢',
  invite_friends: '👥',
  daily: '📅',
  adsgram: '🎬',
  default: '⚡'
};

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [completing, setCompleting] = useState(null);
  const [adWatching, setAdWatching] = useState(false);
  const [adCooldown, setAdCooldown] = useState(0);
  const [adMsg, setAdMsg] = useState(null);
  const { refreshUser } = useStore();
  const { t } = useTranslation();
  const adControllerRef = useRef(null);

  useEffect(() => { api.get('/tasks').then(r => setTasks(r.data)); }, []);

  // Initialize Adsgram
  useEffect(() => {
    if (ADSGRAM_BLOCK_ID && window.Adsgram) {
      try {
        adControllerRef.current = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
      } catch (e) {
        console.error('[Adsgram] Init error:', e);
      }
    }
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (adCooldown <= 0) return;
    const timer = setInterval(() => {
      setAdCooldown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [adCooldown]);

  // Load ad cooldown from server
  useEffect(() => {
    api.get('/tasks/ad-status').then(r => {
      if (r.data.cooldown > 0) setAdCooldown(r.data.cooldown);
    }).catch(() => {});
  }, []);

  const complete = async (task) => {
    if (task.completed || completing === task.id) return;
    if (task.link) window.Telegram?.WebApp?.openLink(task.link);
    setCompleting(task.id);
    try {
      await api.post(`/tasks/${task.id}/complete`);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: true } : t));
      await refreshUser();
    } catch (e) {
      console.error(e);
    } finally {
      setCompleting(null);
    }
  };

  const watchAd = async () => {
    if (adWatching || adCooldown > 0) return;
    if (!adControllerRef.current) {
      setAdMsg('⚠️ Ads not available');
      setTimeout(() => setAdMsg(null), 2000);
      return;
    }

    setAdWatching(true);
    try {
      const result = await adControllerRef.current.show();
      // Ad watched successfully — claim reward
      if (result.done) {
        const { data } = await api.post('/tasks/ad-reward');
        setAdMsg(`✅ +${fmtK(data.reward)} POWER!`);
        setAdCooldown(data.cooldown || 60);
        await refreshUser();
      }
    } catch (e) {
      // User skipped or ad failed
      console.log('[Adsgram] Ad skipped/failed:', e);
      setAdMsg('⚡ Watch the full ad to get a reward');
    } finally {
      setAdWatching(false);
      setTimeout(() => setAdMsg(null), 3000);
    }
  };

  const active = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  const formatCooldown = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <div className="page-title" style={{ color: 'var(--gold)' }}>{t('tasks.title')}</div>
        <div className="page-subtitle">{t('tasks.subtitle')}</div>
      </div>

      {/* Adsgram Ad Task */}
      {ADSGRAM_BLOCK_ID && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            🎬 WATCH & EARN
          </div>
          <div className="card" style={{
            padding: '16px 18px',
            border: '1px solid rgba(212,175,55,0.3)',
            background: 'linear-gradient(135deg, rgba(212,175,55,0.06), rgba(184,134,11,0.03))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.05))',
                border: '1px solid var(--border-gold)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24
              }}>🎬</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>Watch Ad</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Watch a short video and earn POWER
                </div>
                <div style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700, marginTop: 4 }}>
                  +POWER reward
                </div>
              </div>
              <button
                onClick={watchAd}
                disabled={adWatching || adCooldown > 0}
                style={{
                  padding: '10px 18px', borderRadius: 12,
                  background: adCooldown > 0
                    ? 'rgba(255,255,255,0.05)'
                    : 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                  color: adCooldown > 0 ? 'var(--text-muted)' : '#000',
                  fontWeight: 700, fontSize: 12, border: 'none',
                  cursor: adCooldown > 0 ? 'default' : 'pointer',
                  flexShrink: 0, transition: 'var(--transition)',
                  minWidth: 70, textAlign: 'center'
                }}
              >
                {adWatching ? '⏳' : adCooldown > 0 ? formatCooldown(adCooldown) : '▶️ Watch'}
              </button>
            </div>

            {adMsg && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                textAlign: 'center',
                background: adMsg.startsWith('✅') ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)',
                color: adMsg.startsWith('✅') ? 'var(--green)' : 'var(--orange)',
                animation: 'fadeIn 0.2s ease'
              }}>
                {adMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {tasks.length === 0 && !ADSGRAM_BLOCK_ID && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{t('tasks.coming_soon')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('tasks.follow_updates')}</div>
        </div>
      )}

      {/* Active tasks */}
      {active.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            {t('tasks.available', { count: active.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {active.map((task, i) => (
              <div key={task.id} className="card" style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                border: '1px solid var(--border-gold)',
                animation: `fadeIn 0.3s ease ${i * 0.06}s both`
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
                  border: '1px solid var(--border-gold)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                }}>
                  {typeIcons[task.type] || typeIcons.default}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{task.title}</div>
                  {task.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.description}</div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, marginTop: 4 }}>
                    +{fmtK(task.reward_power)} POWER
                  </div>
                </div>
                <button onClick={() => complete(task)} style={{
                  padding: '8px 16px', borderRadius: 10,
                  background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                  color: '#000', fontWeight: 700, fontSize: 12, border: 'none',
                  cursor: 'pointer', flexShrink: 0, transition: 'var(--transition)'
                }}>
                  {completing === task.id ? '⏳' : t('tasks.start')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed tasks */}
      {done.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            {t('tasks.completed', { count: done.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {done.map(task => (
              <div key={task.id} className="card" style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                opacity: 0.5
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
                }}>✅</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{task.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--green)' }}>+{fmtK(task.reward_power)} POWER</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
