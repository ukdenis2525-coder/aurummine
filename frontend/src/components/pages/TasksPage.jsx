import React, { useEffect, useState, useRef, useCallback } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';
import { fmtK } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';
import createAdHandler from 'monetag-tg-sdk';

const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID || '29776';
const ADSGRAM_TASK_ID = import.meta.env.VITE_ADSGRAM_TASK_ID || 'task-29788';
const MONETAG_ZONE_ID = import.meta.env.VITE_MONETAG_ZONE_ID || '10984603';

const typeIcons = {
  subscribe_channel: '📢',
  start_bot: '🤖',
  invite_friends: '👥',
  daily: '📅',
  adsgram: '🎬',
  link: '🔗',
  default: '⚡'
};

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [completing, setCompleting] = useState(null);
  const [taskError, setTaskError] = useState(null); // { taskId, msg }
  const [adWatching, setAdWatching] = useState(false);
  const [adCooldown, setAdCooldown] = useState(0);
  const [adMsg, setAdMsg] = useState(null);
  const [adAvailable, setAdAvailable] = useState(false);
  const [opened, setOpened] = useState({}); // taskId -> true (user clicked "Go")

  // Monetag state
  const [monetagWatching, setMonetagWatching] = useState(false);
  const [monetagCooldown, setMonetagCooldown] = useState(0);
  const [monetagMsg, setMonetagMsg] = useState(null);
  const [monetagAvailable, setMonetagAvailable] = useState(false);
  const monetagHandlerRef = useRef(null);

  const { refreshUser, user } = useStore();
  const { t } = useTranslation();
  const adControllerRef = useRef(null);

  // Order state
  const [showOrder, setShowOrder] = useState(false);
  const [orderConfig, setOrderConfig] = useState(null);
  const [orderForm, setOrderForm] = useState({ type: 'subscribe_channel', link: '', count: 100, title: '' });
  const [ordering, setOrdering] = useState(false);
  const [orderMsg, setOrderMsg] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [orderPayment, setOrderPayment] = useState(null); // { memo, amount, wallet, expires_at }

  useEffect(() => { api.get('/tasks').then(r => setTasks(r.data)); }, []);
  useEffect(() => {
    api.get('/tasks/order-config').then(r => setOrderConfig(r.data)).catch(() => {});
    api.get('/tasks/my-orders').then(r => setMyOrders(r.data)).catch(() => {});
  }, []);

  // Initialize Adsgram
  useEffect(() => {
    const tryInit = () => {
      if (ADSGRAM_BLOCK_ID && window.Adsgram) {
        try {
          adControllerRef.current = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
          setAdAvailable(true);
        } catch (e) { console.error('[Adsgram] Init error:', e); }
        return true;
      }
      return false;
    };
    if (!tryInit()) {
      const interval = setInterval(() => { if (tryInit()) clearInterval(interval); }, 500);
      const timeout = setTimeout(() => clearInterval(interval), 5000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, []);

  // Initialize Monetag
  useEffect(() => {
    if (!MONETAG_ZONE_ID) return;
    try {
      monetagHandlerRef.current = createAdHandler(MONETAG_ZONE_ID);
      setMonetagAvailable(true);
    } catch (e) { console.error('[Monetag] Init error:', e); }
  }, []);

  // Adsgram cooldown timer
  useEffect(() => {
    if (adCooldown <= 0) return;
    const timer = setInterval(() => {
      setAdCooldown(prev => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [adCooldown]);

  // Monetag cooldown timer
  useEffect(() => {
    if (monetagCooldown <= 0) return;
    const timer = setInterval(() => {
      setMonetagCooldown(prev => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [monetagCooldown]);

  // Load cooldowns from server
  useEffect(() => {
    api.get('/tasks/ad-status').then(r => { if (r.data.cooldown > 0) setAdCooldown(r.data.cooldown); }).catch(() => {});
    api.get('/tasks/monetag-status').then(r => { if (r.data.cooldown > 0) setMonetagCooldown(r.data.cooldown); }).catch(() => {});
  }, []);

  // Open task link (step 1)
  const openTask = (task) => {
    if (task.link) {
      if (task.type === 'start_bot') {
        window.Telegram?.WebApp?.openTelegramLink(task.link);
      } else if (task.type === 'subscribe_channel') {
        window.Telegram?.WebApp?.openTelegramLink(task.link);
      } else {
        window.Telegram?.WebApp?.openLink(task.link);
      }
    }
    setOpened(prev => ({ ...prev, [task.id]: true }));
    setTaskError(null);
  };

  // Complete task (step 2 — verify)
  const complete = async (task) => {
    if (task.completed || completing === task.id) return;
    setCompleting(task.id);
    setTaskError(null);
    try {
      const { data } = await api.post(`/tasks/${task.id}/complete`);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: true } : t));
      await refreshUser();
    } catch (e) {
      const errCode = e.response?.data?.error;
      if (errCode === 'not_subscribed') {
        setTaskError({ taskId: task.id, msg: t('tasks.not_subscribed') });
      } else if (errCode === 'Already completed') {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: true } : t));
      } else {
        setTaskError({ taskId: task.id, msg: t('tasks.task_error') });
      }
    } finally {
      setCompleting(null);
    }
  };

  const watchAd = async () => {
    if (adWatching || adCooldown > 0) return;
    if (!adControllerRef.current) { setAdMsg('⚠️ Ads not available'); setTimeout(() => setAdMsg(null), 2000); return; }
    setAdWatching(true);
    try {
      const result = await adControllerRef.current.show();
      if (result.done) {
        const { data } = await api.post('/tasks/ad-reward');
        setAdMsg(t('tasks.ad_reward_msg', { reward: fmtK(data.reward) }));
        setAdCooldown(data.cooldown || 60);
        await refreshUser();
      }
    } catch (e) { setAdMsg(t('tasks.watch_full_ad')); }
    finally { setAdWatching(false); setTimeout(() => setAdMsg(null), 3000); }
  };

  const watchMonetagAd = useCallback(async () => {
    if (monetagWatching || monetagCooldown > 0) return;
    if (!monetagHandlerRef.current) { setMonetagMsg('⚠️ Monetag not available'); setTimeout(() => setMonetagMsg(null), 2000); return; }
    setMonetagWatching(true);
    try {
      await monetagHandlerRef.current();
      const { data } = await api.post('/tasks/monetag-reward');
      setMonetagMsg(t('tasks.ad_reward_msg', { reward: fmtK(data.reward) }));
      setMonetagCooldown(data.cooldown || 60);
      await refreshUser();
    } catch (e) {
      if (e.response?.status === 429) {
        setMonetagCooldown(e.response.data?.cooldown || 30);
        setMonetagMsg(t('tasks.daily_limit_msg'));
      } else { setMonetagMsg(t('tasks.watch_full_ad')); }
    } finally { setMonetagWatching(false); setTimeout(() => setMonetagMsg(null), 3000); }
  }, [monetagWatching, monetagCooldown, refreshUser, t]);

  const active = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  const formatCooldown = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  };

  // Determine button label and action for a task
  const getTaskAction = (task) => {
    const isOpened = opened[task.id];
    const needsVerify = task.type === 'subscribe_channel';

    if (needsVerify) {
      if (!isOpened) {
        return { label: t('tasks.go'), action: () => openTask(task), style: 'go' };
      }
      return { label: completing === task.id ? '⏳' : t('tasks.check'), action: () => complete(task), style: 'check' };
    }

    // For start_bot / link — open first, then complete
    if (task.link && !isOpened) {
      return { label: t('tasks.go'), action: () => openTask(task), style: 'go' };
    }

    return {
      label: completing === task.id ? '⏳' : t('tasks.start'),
      action: () => {
        if (task.link && !isOpened) openTask(task);
        complete(task);
      },
      style: 'start'
    };
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <div className="page-title" style={{ color: 'var(--gold)' }}>{t('tasks.title')}</div>
        <div className="page-subtitle">{t('tasks.subtitle')}</div>
      </div>

      {/* Adsgram Ad Task */}
      {adAvailable && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            🎬 {t('tasks.watch_earn')}
          </div>
          <div className="card" style={{
            padding: '16px 18px', border: '1px solid rgba(212,175,55,0.3)',
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
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{t('tasks.watch_ad')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('tasks.watch_desc')}</div>
                <div style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700, marginTop: 4 }}>{t('tasks.watch_reward')}</div>
              </div>
              <button onClick={watchAd} disabled={adWatching || adCooldown > 0} style={{
                padding: '10px 18px', borderRadius: 12,
                background: adCooldown > 0 ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                color: adCooldown > 0 ? 'var(--text-muted)' : '#000',
                fontWeight: 700, fontSize: 12, border: 'none',
                cursor: adCooldown > 0 ? 'default' : 'pointer', flexShrink: 0, minWidth: 70, textAlign: 'center'
              }}>
                {adWatching ? '⏳' : adCooldown > 0 ? formatCooldown(adCooldown) : `▶️ ${t('tasks.watch_btn')}`}
              </button>
            </div>
            {adMsg && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, textAlign: 'center',
                background: adMsg.startsWith('✅') ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)',
                color: adMsg.startsWith('✅') ? 'var(--green)' : 'var(--orange)', animation: 'fadeIn 0.2s ease'
              }}>{adMsg}</div>
            )}
          </div>
        </div>
      )}

      {/* Monetag Ad Task */}
      {monetagAvailable && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            💎 {t('tasks.monetag_section')}
          </div>
          <div className="card" style={{
            padding: '16px 18px', border: '1px solid rgba(139,92,246,0.3)',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(109,40,217,0.03))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.05))',
                border: '1px solid rgba(139,92,246,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24
              }}>💎</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{t('tasks.monetag_title')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('tasks.monetag_desc')}</div>
                <div style={{ fontSize: 13, color: '#8b5cf6', fontWeight: 700, marginTop: 4 }}>{t('tasks.monetag_reward')}</div>
              </div>
              <button onClick={watchMonetagAd} disabled={monetagWatching || monetagCooldown > 0} style={{
                padding: '10px 18px', borderRadius: 12,
                background: monetagCooldown > 0 ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
                color: monetagCooldown > 0 ? 'var(--text-muted)' : '#fff',
                fontWeight: 700, fontSize: 12, border: 'none',
                cursor: monetagCooldown > 0 ? 'default' : 'pointer', flexShrink: 0, minWidth: 70, textAlign: 'center'
              }}>
                {monetagWatching ? '⏳' : monetagCooldown > 0 ? formatCooldown(monetagCooldown) : `▶️ ${t('tasks.watch_btn')}`}
              </button>
            </div>
            {monetagMsg && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, textAlign: 'center',
                background: monetagMsg.startsWith('✅') ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)',
                color: monetagMsg.startsWith('✅') ? 'var(--green)' : 'var(--orange)', animation: 'fadeIn 0.2s ease'
              }}>{monetagMsg}</div>
            )}
          </div>
        </div>
      )}

      {tasks.length === 0 && !adAvailable && !monetagAvailable && !ADSGRAM_TASK_ID && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{t('tasks.coming_soon')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('tasks.follow_updates')}</div>
        </div>
      )}

      {/* Adsgram Publisher Tasks */}
      {ADSGRAM_TASK_ID && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            📋 {t('tasks.sponsored')}
          </div>
          <adsgram-task data-block-id={ADSGRAM_TASK_ID} data-debug="false" style={{
            '--adsgram-task-bg': 'rgba(18, 18, 26, 0.95)', '--adsgram-task-color': '#e8e8e8',
            '--adsgram-task-btn-bg': 'linear-gradient(135deg, #b8860b, #d4af37)',
            '--adsgram-task-btn-color': '#000', '--adsgram-task-border-radius': '14px',
            width: '100%', display: 'block',
          }}></adsgram-task>
        </div>
      )}

      {/* Active tasks */}
      {active.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            {t('tasks.available', { count: active.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {active.map((task, i) => {
              const { label, action, style } = getTaskAction(task);
              const btnBg = style === 'check'
                ? 'linear-gradient(135deg, #059669, #10b981)'
                : style === 'go'
                  ? 'linear-gradient(135deg, #2563eb, #3b82f6)'
                  : 'linear-gradient(135deg, var(--gold-dark), var(--gold))';
              const btnColor = style === 'go' || style === 'check' ? '#fff' : '#000';

              return (
                <div key={task.id} className="card" style={{
                  padding: '14px 16px', border: '1px solid var(--border-gold)',
                  animation: `fadeIn 0.3s ease ${i * 0.06}s both`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
                    <button onClick={action} style={{
                      padding: '8px 16px', borderRadius: 10, background: btnBg,
                      color: btnColor, fontWeight: 700, fontSize: 12, border: 'none',
                      cursor: 'pointer', flexShrink: 0, transition: 'var(--transition)', minWidth: 70, textAlign: 'center'
                    }}>
                      {label}
                    </button>
                  </div>

                  {/* Error message for this task */}
                  {taskError?.taskId === task.id && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                      textAlign: 'center', background: 'rgba(248,113,113,0.1)', color: 'var(--red)',
                      animation: 'fadeIn 0.2s ease'
                    }}>
                      {taskError.msg}
                    </div>
                  )}

                  {/* Hint for subscribe tasks after opening */}
                  {task.type === 'subscribe_channel' && opened[task.id] && !taskError?.taskId && (
                    <div style={{
                      marginTop: 8, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
                      animation: 'fadeIn 0.3s ease'
                    }}>
                      {t('tasks.subscribe_hint')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed tasks */}
      {done.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            {t('tasks.completed', { count: done.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {done.map(task => (
              <div key={task.id} className="card" style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', opacity: 0.5
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

      {/* ═══ ORDER ADVERTISING ═══ */}
      {orderConfig && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            📣 {t('tasks.order_section')}
          </div>

          <div className="card" style={{
            padding: '16px 18px',
            border: '1px solid rgba(59,130,246,0.3)',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(37,99,235,0.03))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{t('tasks.order_title')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('tasks.order_desc')}</div>
              </div>
              <button onClick={() => setShowOrder(!showOrder)} style={{
                padding: '8px 16px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                background: showOrder ? 'rgba(248,113,113,0.15)' : 'linear-gradient(135deg, #2563eb, #3b82f6)',
                color: showOrder ? 'var(--red)' : '#fff',
              }}>
                {showOrder ? '✕' : `+ ${t('tasks.order_btn')}`}
              </button>
            </div>

            {showOrder && (() => {
              const selectedType = orderConfig.types.find(t => t.type === orderForm.type) || orderConfig.types[0];
              const totalPrice = (selectedType.price_per_user * orderForm.count).toFixed(4);

              return (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                  {/* Type selector */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {orderConfig.types.map(tp => (
                      <button key={tp.type} onClick={() => setOrderForm({ ...orderForm, type: tp.type })} style={{
                        flex: 1, padding: '10px 6px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                        background: orderForm.type === tp.type ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                        color: orderForm.type === tp.type ? '#3b82f6' : 'var(--text-muted)',
                      }}>{tp.label}</button>
                    ))}
                  </div>

                  {/* Title */}
                  <input type="text" value={orderForm.title} onChange={e => setOrderForm({ ...orderForm, title: e.target.value })}
                    placeholder={t('tasks.order_name_placeholder')}
                    style={{ marginBottom: 8, fontSize: 13, padding: '10px 14px' }} />

                  {/* Link */}
                  <input type="text" value={orderForm.link} onChange={e => setOrderForm({ ...orderForm, link: e.target.value })}
                    placeholder={selectedType.placeholder}
                    style={{ marginBottom: 6, fontSize: 13, padding: '10px 14px' }} />

                  {/* Bot admin hint for subscribe_channel */}
                  {orderForm.type === 'subscribe_channel' && (
                    <div style={{
                      fontSize: 10, color: 'var(--orange)', marginBottom: 10, padding: '6px 10px',
                      background: 'rgba(251,191,36,0.08)', borderRadius: 8, lineHeight: 1.4
                    }}>
                      ⚠️ {t('tasks.bot_admin_hint')}
                    </div>
                  )}

                  {/* Count */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('tasks.order_count')}</span>
                      <span style={{ fontWeight: 700 }}>{orderForm.count}</span>
                    </div>
                    <input type="range" min="10" max="1000" step="10" value={orderForm.count}
                      onChange={e => setOrderForm({ ...orderForm, count: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: '#3b82f6' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>10</span><span>1000</span>
                    </div>
                  </div>

                  {/* Price summary */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12,
                    padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 12
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{t('tasks.order_price_per')}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)' }}>{selectedType.price_per_user} TON</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{t('tasks.order_total')}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--orange)' }}>{totalPrice} TON</div>
                    </div>
                  </div>

                  {orderMsg && (
                    <div style={{
                      marginBottom: 10, padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, textAlign: 'center',
                      background: orderMsg.startsWith('✅') ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                      color: orderMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)',
                      animation: 'fadeIn 0.2s ease'
                    }}>{orderMsg}</div>
                  )}

                  <button onClick={async () => {
                    if (!orderForm.link || ordering) return;
                    setOrdering(true);
                    setOrderMsg(null);
                    try {
                      const { data } = await api.post('/tasks/order', orderForm);
                      if (data.payment) {
                        setOrderPayment(data.payment);
                        setShowOrder(false);
                      }
                    } catch (e) {
                      const err = e.response?.data?.error;
                      const msg = e.response?.data?.message;
                      if (err === 'bot_not_admin') {
                        setOrderMsg(`❌ ${t('tasks.bot_not_admin_error')}`);
                      } else {
                        setOrderMsg(`❌ ${msg || err || t('tasks.task_error')}`);
                      }
                    } finally { setOrdering(false); setTimeout(() => setOrderMsg(null), 5000); }
                  }} disabled={ordering || !orderForm.link} style={{
                    width: '100%', padding: 12, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    background: !orderForm.link ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #2563eb, #3b82f6)',
                    color: !orderForm.link ? 'var(--text-muted)' : '#fff',
                  }}>
                    {ordering ? '⏳...' : `💳 ${t('tasks.order_pay')} ${totalPrice} TON`}
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Payment info card */}
          {orderPayment && (
            <div className="card" style={{
              padding: '16px 18px', marginTop: 12,
              border: '1px solid rgba(52,211,153,0.4)',
              background: 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(16,185,129,0.03))',
              animation: 'fadeIn 0.3s ease'
            }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>💎</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{t('tasks.send_ton')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('tasks.send_ton_desc')}</div>
              </div>

              {/* Amount */}
              <div style={{
                textAlign: 'center', padding: 12, background: 'rgba(255,255,255,0.03)',
                borderRadius: 12, marginBottom: 10
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{t('tasks.order_total')}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{orderPayment.amount} TON</div>
              </div>

              {/* Wallet */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{t('tasks.wallet_address')}</div>
                <div onClick={() => { navigator.clipboard.writeText(orderPayment.wallet); }} style={{
                  padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10,
                  fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', cursor: 'pointer',
                  border: '1px solid var(--border)'
                }}>
                  {orderPayment.wallet}
                  <span style={{ float: 'right', color: 'var(--gold)' }}>📋</span>
                </div>
              </div>

              {/* Memo */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>MEMO ({t('tasks.memo_important')})</div>
                <div onClick={() => { navigator.clipboard.writeText(orderPayment.memo); }} style={{
                  padding: '10px 12px', background: 'rgba(212,175,55,0.08)', borderRadius: 10,
                  fontSize: 16, fontWeight: 800, fontFamily: 'monospace', textAlign: 'center', cursor: 'pointer',
                  border: '1px solid var(--border-gold)', color: 'var(--gold)', letterSpacing: 2
                }}>
                  {orderPayment.memo}
                  <span style={{ float: 'right', fontSize: 12 }}>📋</span>
                </div>
              </div>

              <div style={{ fontSize: 10, color: 'var(--orange)', textAlign: 'center', marginBottom: 10 }}>
                ⚠️ {t('tasks.memo_warning')}
              </div>

              <button onClick={() => {
                setOrderPayment(null);
                api.get('/tasks/my-orders').then(r => setMyOrders(r.data));
              }} style={{
                width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, cursor: 'pointer'
              }}>
                ✕ {t('tasks.close_payment')}
              </button>
            </div>
          )}
          {/* My orders */}
          {myOrders.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                {t('tasks.my_orders')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {myOrders.map(o => {
                  const statusMap = { pending: '⏳', active: '✅', completed: '🏁', rejected: '❌' };
                  const colorMap = { pending: 'var(--orange)', active: 'var(--green)', completed: 'var(--gold)', rejected: 'var(--red)' };
                  return (
                    <div key={o.id} className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{statusMap[o.status] || '📋'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.title || o.link}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {o.completed_count || 0}/{o.max_completions} • {parseFloat(o.total_paid).toFixed(4)} TON
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: colorMap[o.status] }}>{o.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
