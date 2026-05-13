import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';
import { fmt, fmtK } from '../../utils/format.js';

const ALL_TABS = [
  { id: 'dashboard', icon: '📊', label: 'Обзор' },
  { id: 'users', icon: '👥', label: 'Юзеры' },
  { id: 'withdrawals', icon: '💸', label: 'Выводы' },
  { id: 'tasks', icon: '📋', label: 'Задания' },
  { id: 'orders', icon: '🛒', label: 'Заказы' },
  { id: 'packages', icon: '📦', label: 'Пакеты' },
  { id: 'ads', icon: '🎬', label: 'Реклама' },
  { id: 'referrals', icon: '🤝', label: 'Рефералы' },
  { id: 'ambassador', icon: '🤝', label: 'Амбассадор' },
  { id: 'promo', icon: '🎟️', label: 'Промокоды' },
  { id: 'broadcast', icon: '📢', label: 'Рассылка' },
  { id: 'multi', icon: '👁', label: 'Мульти' },
  { id: 'admins', icon: '🛡️', label: 'Админы' },
];

export default function AdminPage() {
  const { setTab: setAppTab, adminPerms } = useStore();

  // Filter tabs by permissions
  const visibleTabs = adminPerms === '*'
    ? ALL_TABS
    : ALL_TABS.filter(t => {
        // 'admins' tab only for super admins
        if (t.id === 'admins') return false;
        // Dashboard always visible
        if (t.id === 'dashboard') return true;
        return Array.isArray(adminPerms) && adminPerms.includes(t.id);
      });

  const [tab, setTab] = useState(visibleTabs[0]?.id || 'dashboard');

  // Dynamic grid columns based on tab count
  const cols = visibleTabs.length <= 4 ? visibleTabs.length : visibleTabs.length <= 6 ? 3 : 3;

  return (
    <div className="page" style={{ paddingBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => setAppTab('power')} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          color: '#fff', padding: '10px 14px', fontSize: 16, cursor: 'pointer'
        }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>🛡️ Admin Panel</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Управление приложением</div>
        </div>
      </div>

      {/* Tab grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, marginBottom: 20,
      }}>
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '14px 6px', borderRadius: 14, border: 'none',
            background: tab === t.id
              ? 'linear-gradient(135deg, var(--gold-dark), var(--gold))'
              : 'var(--bg-card)',
            color: tab === t.id ? '#000' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 10, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            transition: 'all 0.2s ease',
            boxShadow: tab === t.id ? '0 4px 12px rgba(212,175,55,0.3)' : 'none',
            border: tab === t.id ? 'none' : '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 22 }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'withdrawals' && <WithdrawalsPanel />}
      {tab === 'tasks' && <TasksPanel />}
      {tab === 'orders' && <OrdersPanel />}
      {tab === 'packages' && <PackagesPanel />}
      {tab === 'ads' && <AdsPanel />}
      {tab === 'referrals' && <ReferralsPanel />}
      {tab === 'broadcast' && <BroadcastPanel />}
      {tab === 'multi' && <MultiAccountPanel />}
      {tab === 'admins' && <AdminsPanel />}
      {tab === 'ambassador' && <AmbassadorAdminPanel />}
      {tab === 'promo' && <PromoCodesPanel />}
    </div>
  );
}

// ═══════════════════ DASHBOARD ═══════════════════
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [topField, setTopField] = useState(null);
  const [topUsers, setTopUsers] = useState([]);
  const [topLoading, setTopLoading] = useState(false);

  const loadStats = async () => {
    try {
      const { data } = await api.get('/admin/stats');
      setStats(data);
    } catch (e) {
      console.error('[Admin] Stats error:', e.message);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const refreshStats = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  if (!stats) return <Loading />;

  const fieldLabels = {
    ton_balance: '💰 TON баланс',
    power: '⚡ Power',
    purchases: '🛒 Покупки',
    revenue: '💵 Выручка',
    referrals: '👥 Рефералы',
    ads_watched: '🎥 Просмотры реклам',
  };

  const openTop = async (field) => {
    setTopField(field);
    setTopLoading(true);
    try {
      const { data } = await api.get(`/admin/stats/top?field=${field}&limit=50`);
      setTopUsers(data);
    } catch (e) { setTopUsers([]); }
    setTopLoading(false);
  };

  const cards = [
    { icon: '👥', label: 'Пользователи', val: stats.total_users, color: 'var(--gold)' },
    { icon: '🆕', label: 'За 24ч', val: stats.new_users_24h, color: 'var(--green)' },
    { icon: '🟢', label: 'Онлайн (5м)', val: stats.online_5min || 0, color: '#22c55e' },
    { icon: '🔵', label: 'Онлайн (1ч)', val: stats.online_1h || 0, color: '#3b82f6' },
    { icon: '⚡', label: 'Power (всего)', val: fmtK(stats.total_power), color: 'var(--gold-light)', field: 'power' },
    { icon: '💰', label: 'TON баланс', val: fmt(stats.total_ton_balance, 2), color: 'var(--orange)', field: 'ton_balance' },
    { icon: '🛒', label: 'Покупок', val: stats.total_purchases, color: 'var(--green)', field: 'purchases' },
    { icon: '💵', label: 'Выручка', val: `${fmt(stats.total_revenue, 2)} TON`, color: 'var(--gold)', field: 'revenue' },
    { icon: '👥', label: 'Рефералы', val: stats.total_referrals || '▸', color: '#a855f7', field: 'referrals' },
    { icon: '🎥', label: 'Ads просмотры', val: stats.total_ads_watched || '▸', color: '#f59e0b', field: 'ads_watched' },
    { icon: '⏳', label: 'Выводы (ожид)', val: stats.pending_withdrawals, color: stats.pending_withdrawals > 0 ? 'var(--red)' : 'var(--text-muted)' },
  ];

  const manualCheck = async () => {
    setChecking(true);
    try {
      const { data } = await api.post('/admin/check-payments');
      setCheckResult(data);
    } catch (e) {
      setCheckResult({ error: e.response?.data?.error || e.message });
    } finally { setChecking(false); }
  };

  return (
    <div>
      <button onClick={refreshStats} disabled={refreshing} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: '100%', padding: 10, marginBottom: 12, borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
        color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}>
        <span style={{ display: 'inline-block', transition: 'transform 0.5s', transform: refreshing ? 'rotate(360deg)' : 'none' }}>🔄</span>
        {refreshing ? 'Обновляю...' : 'Обновить статистику'}
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {cards.map((c, i) => (
          <div key={c.label} className="card" onClick={() => c.field && openTop(c.field)} style={{
            padding: 16, animation: `fadeIn 0.3s ease ${i * 0.05}s both`,
            gridColumn: i === cards.length - 1 && cards.length % 2 !== 0 ? 'span 2' : undefined,
            cursor: c.field ? 'pointer' : 'default',
            transition: 'transform 0.15s ease, border-color 0.15s ease',
            border: c.field ? '1px solid var(--border)' : undefined,
          }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.color }}>{c.val}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {c.label}
              {c.field && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.5 }}>▸</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Top users overlay */}
      {topField && (
        <div className="card" style={{ marginBottom: 16, animation: 'fadeIn 0.2s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{fieldLabels[topField] || topField}</div>
            <button onClick={() => setTopField(null)} style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
              padding: '4px 10px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>✕</button>
          </div>
          {topLoading ? <div style={{ padding: 20, textAlign: 'center' }}><Loading /></div> : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {topUsers.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Нет данных</div>
              )}
              {topUsers.map((u, i) => (
                <div key={u.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: i < 3 ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, color: i < 3 ? 'var(--gold)' : 'var(--text-muted)',
                    }}>{i + 1}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {u.first_name || u.username || 'Noname'}
                        {u.is_premium && <span style={{ fontSize: 8, marginLeft: 3 }}>⭐</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        TG: {u.tg_id}{u.username ? ` • @${u.username}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>
                      {topField === 'ton_balance' && `${parseFloat(u.ton_balance).toFixed(4)} TON`}
                      {topField === 'power' && `${fmtK(u.power)} GH/s`}
                      {topField === 'purchases' && `${u.extra}`}
                      {topField === 'revenue' && `${u.extra}`}
                      {topField === 'referrals' && `${u.extra}`}
                      {topField === 'ads_watched' && `${u.extra}`}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                      {topField !== 'power' && `⚡ ${fmtK(u.power)}`}
                      {topField !== 'ton_balance' && ` 💎 ${parseFloat(u.ton_balance || 0).toFixed(2)}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual payment check */}
      <button className="btn-gold" onClick={manualCheck} disabled={checking}
        style={{ marginBottom: 12, padding: 12, fontSize: 13 }}>
        {checking ? '⏳ Проверяю...' : '🔄 Проверить платежи вручную'}
      </button>

      {checkResult && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: checkResult.error ? 'var(--red)' : 'var(--green)' }}>
            {checkResult.error ? `❌ ${checkResult.error}` : `✅ ${checkResult.message}`}
          </div>
          {checkResult.recent_purchases && (
            <div style={{ fontSize: 11 }}>
              {checkResult.recent_purchases.map(p => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                  borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)'
                }}>
                  <span>#{p.id} memo:{p.memo}</span>
                  <span style={{
                    color: p.status === 'completed' ? 'var(--green)' : p.status === 'pending' ? 'var(--orange)' : 'var(--text-muted)'
                  }}>{p.status} • {p.ton_amount} TON</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      <DashboardCharts />
    </div>
  );
}

function MiniChart({ data, labels, color, title, icon }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data, 1);
  const w = 300, h = 100, px = 30, py = 10;
  const cw = w - px, ch = h - py * 2;
  const points = data.map((v, i) => `${px + (i / (data.length - 1)) * cw},${py + ch - (v / max) * ch}`).join(' ');
  const areaPoints = `${px},${py + ch} ${points} ${px + cw},${py + ch}`;
  const gradId = `g_${title.replace(/\s/g, '')}`;

  return (
    <div className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800 }}>{icon} {title}</div>
        <div style={{ fontSize: 11, color, fontWeight: 700 }}>
          макс: {max} • сейчас: {data[data.length - 1]}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 100 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={px} y1={py + ch * (1 - f)} x2={px + cw} y2={py + ch * (1 - f)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
        ))}
        {/* Y labels */}
        {[0, 0.5, 1].map(f => (
          <text key={f} x={px - 4} y={py + ch * (1 - f) + 3} fill="rgba(255,255,255,0.3)" fontSize="7" textAnchor="end">
            {Math.round(max * f)}
          </text>
        ))}
        {/* X labels (every 4h) */}
        {labels && labels.filter((_, i) => i % 4 === 0).map((l, li) => {
          const idx = li * 4;
          return (
            <text key={l} x={px + (idx / (data.length - 1)) * cw} y={h - 1} fill="rgba(255,255,255,0.3)" fontSize="7" textAnchor="middle">{l}</text>
          );
        })}
        <polygon points={areaPoints} fill={`url(#${gradId})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Current value dot */}
        {data.length > 0 && (
          <circle cx={px + cw} cy={py + ch - (data[data.length - 1] / max) * ch} r="3" fill={color} />
        )}
      </svg>
    </div>
  );
}

function DashboardCharts() {
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats/charts').then(r => setCharts(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 20, fontSize: 11, color: 'var(--text-muted)' }}>📊 Загрузка графиков...</div>;
  if (!charts) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>📊 Графики за 24ч</div>
      <MiniChart data={charts.onlineUsers} labels={charts.labels} color="#22c55e" title="Онлайн" icon="🟢" />
      <MiniChart data={charts.newUsers} labels={charts.labels} color="#3b82f6" title="Новые юзеры" icon="🆕" />
      <MiniChart data={charts.activeUsers} labels={charts.labels} color="#a855f7" title="Активные юзеры" icon="👥" />
      <MiniChart data={charts.purchases} labels={charts.labels} color="#f59e0b" title="Покупки" icon="🛒" />
    </div>
  );
}

// ═══════════════════ USERS ═══════════════════
function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/admin/users?page=${page}&search=${search}`);
    setUsers(data.users);
    setTotal(data.total);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(null), 2500); };

  const handleAdjust = async (userId, power, ton) => {
    await api.post(`/admin/users/${userId}/adjust`, { power: parseFloat(power), ton_balance: parseFloat(ton) });
    setEditing(null);
    showMsg('✅ Баланс обновлён');
    load();
  };

  const toggleBlock = async (userId, block) => {
    await api.post(`/admin/users/${userId}/block`, { blocked: block });
    showMsg(block ? '🚫 Пользователь заблокирован' : '✅ Разблокирован');
    load();
    if (detailData?.user?.id === userId) loadDetails(userId);
  };

  const deleteUser = async (userId) => {
    try {
      await api.delete(`/admin/users/${userId}`);
      showMsg('🗑️ Пользователь удалён');
      setConfirmDelete(null);
      setDetail(null);
      setDetailData(null);
      load();
    } catch {
      showMsg('❌ Ошибка удаления');
    }
  };

  const loadDetails = async (userId) => {
    setDetail(userId);
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/admin/users/${userId}/details`);
      setDetailData(data);
    } catch { showMsg('❌ Ошибка загрузки'); }
    finally { setLoadingDetail(false); }
  };

  // ── Detail View ──
  if (detail && detailData) {
    const u = detailData.user;
    const statCards = [
      { icon: '⚡', label: 'POWER', val: fmtK(Math.floor(u.power)), color: 'var(--gold)' },
      { icon: '💰', label: 'TON', val: fmt(u.ton_balance, 4), color: 'var(--gold-light)' },
      { icon: '🛒', label: 'Покупок', val: detailData.purchases.length, color: 'var(--green)' },
      { icon: '💵', label: 'Потрачено', val: `${fmt(detailData.purchases_total, 2)}`, color: 'var(--orange)' },
      { icon: '👥', label: 'Рефералов', val: detailData.referrals.length, color: 'var(--gold)' },
      { icon: '💸', label: 'Выведено', val: `${fmt(detailData.withdrawals_total, 4)}`, color: 'var(--red)' },
    ];
    return (
      <div>
        {msg && <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, background: msg.startsWith('✅') || msg.startsWith('🗑') ? 'rgba(52,211,153,0.1)' : 'var(--red-bg)', color: msg.startsWith('✅') || msg.startsWith('🗑') ? 'var(--green)' : 'var(--red)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{msg}</div>}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => { setDetail(null); setDetailData(null); }} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, color: '#fff', padding: '8px 12px', fontSize: 14, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {u.first_name || u.username || '—'}
              {u.is_premium && <span style={{ color: 'var(--gold)', marginLeft: 4 }}>★</span>}
              {u.is_blocked && <span style={{ color: 'var(--red)', marginLeft: 6, fontSize: 12 }}>🚫 BLOCKED</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              ID:{u.id} • TG:{u.tg_id} {u.username ? `• @${u.username}` : ''}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
          {statCards.map((c, i) => (
            <div key={c.label} className="card" style={{ padding: 10, textAlign: 'center', animation: `fadeIn 0.2s ease ${i * 0.03}s both` }}>
              <div style={{ fontSize: 14 }}>{c.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: c.color }}>{c.val}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Referrer */}
        {detailData.referrer && (
          <div className="card" style={{ padding: '10px 14px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>👤 ПРИГЛАСИЛ</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {detailData.referrer.first_name || detailData.referrer.username} • TG:{detailData.referrer.tg_id}
            </div>
          </div>
        )}

        {/* Referral rewards */}
        <div className="card" style={{ padding: '10px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>🎁 РЕФЕРАЛЬНЫЙ ДОХОД</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>⚡ {fmtK(detailData.referral_rewards?.total_power || 0)} POWER</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold-light)' }}>💎 {fmt(detailData.referral_rewards?.total_ton || 0, 4)} TON</span>
          </div>
        </div>

        {/* Purchases */}
        {detailData.purchases.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>🛒 ПОКУПКИ ({detailData.purchases.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {detailData.purchases.map(p => (
                <div key={p.id} className="card" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{p.package_name || 'Пакет'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{fmt(p.ton_paid, 2)} TON</div>
                    <div style={{ fontSize: 10, color: 'var(--green)' }}>+{fmtK(p.power_amount)} PW</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Referrals */}
        {detailData.referrals.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>👥 РЕФЕРАЛЫ ({detailData.referrals.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {detailData.referrals.slice(0, 20).map(r => (
                <div key={r.id} className="card" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{r.first_name || r.username || `TG:${r.tg_id}`}</div>
                  <div style={{ fontSize: 11, color: r.is_confirmed ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {r.is_confirmed ? '✓ Актив' : '⏳ Ожид'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Withdrawals */}
        {detailData.withdrawals.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>💸 ВЫВОДЫ ({detailData.withdrawals.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {detailData.withdrawals.map(w => (
                <div key={w.id} className="card" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-light)' }}>{fmt(w.ton_amount, 4)} TON</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{w.wallet_address?.slice(0, 8)}...</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: w.status === 'completed' ? 'var(--green)' : w.status === 'rejected' ? 'var(--red)' : 'var(--orange)' }}>
                    {w.status === 'completed' ? '✅' : w.status === 'rejected' ? '❌' : '⏳'} {w.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>⚙️ ДЕЙСТВИЯ</div>
          <AdjustForm user={u} onSave={(id, pw, ton) => { handleAdjust(id, pw, ton).then(() => loadDetails(id)); }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => toggleBlock(u.id, !u.is_blocked)} style={{
            flex: 1, padding: 12, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            background: u.is_blocked ? 'var(--green-bg)' : 'rgba(251,191,36,0.1)',
            color: u.is_blocked ? 'var(--green)' : 'var(--orange)',
          }}>
            {u.is_blocked ? '✅ Разблокировать' : '🚫 Заблокировать'}
          </button>
          <button onClick={() => setConfirmDelete(u.id)} style={{
            padding: '12px 16px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            background: 'var(--red-bg)', color: 'var(--red)',
          }}>🗑️</button>
        </div>

        {/* Delete confirmation */}
        {confirmDelete === u.id && (
          <div style={{ marginTop: 10, padding: 14, background: 'var(--red-bg)', borderRadius: 14, border: '1px solid rgba(248,113,113,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>⚠️ Удалить пользователя и ВСЕ его данные?</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => deleteUser(u.id)} style={{ padding: '8px 24px', borderRadius: 10, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Да, удалить</button>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '8px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Отмена</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
          Создан: {new Date(u.created_at).toLocaleString()}
        </div>
      </div>
    );
  }

  // ── Users List ──
  return (
    <div>
      {msg && <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, background: msg.startsWith('✅') || msg.startsWith('🗑') ? 'rgba(52,211,153,0.1)' : 'var(--red-bg)', color: msg.startsWith('✅') || msg.startsWith('🗑') ? 'var(--green)' : 'var(--red)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{msg}</div>}

      <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
        placeholder="🔍 Поиск по имени, username, tg_id..."
        style={{ marginBottom: 14, fontSize: 13 }} />

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Всего: {total} • Стр. {page}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {users.map(u => (
          <div key={u.id} className="card" style={{
            padding: '12px 14px',
            opacity: u.is_blocked ? 0.5 : 1,
            border: u.is_blocked ? '1px solid rgba(248,113,113,0.3)' : '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div onClick={() => loadDetails(u.id)} style={{ cursor: 'pointer', flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {u.first_name || u.username || '—'}
                  {u.is_premium && <span style={{ color: 'var(--gold)', marginLeft: 4 }}>★</span>}
                  {u.is_blocked && <span style={{ color: 'var(--red)', marginLeft: 6, fontSize: 10 }}>🚫</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  ID:{u.id} • TG:{u.tg_id}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => loadDetails(u.id)} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--text-muted)', padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}>👁️</button>
                <button onClick={() => setEditing(editing === u.id ? null : u.id)} style={{
                  background: editing === u.id ? 'var(--red-bg)' : 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  color: editing === u.id ? 'var(--red)' : 'var(--text-muted)',
                  padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}>{editing === u.id ? '✕' : '✏️'}</button>
                <button onClick={() => toggleBlock(u.id, !u.is_blocked)} style={{
                  background: u.is_blocked ? 'var(--green-bg)' : 'var(--red-bg)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  color: u.is_blocked ? 'var(--green)' : 'var(--red)',
                  padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}>{u.is_blocked ? '✅' : '🚫'}</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 }}>
              <MiniStat label="POWER" val={fmtK(Math.floor(u.power))} color="var(--gold)" />
              <MiniStat label="HASHES" val={parseFloat(u.hashes).toFixed(2)} />
              <MiniStat label="TON" val={fmt(u.ton_balance, 4)} color="var(--gold-light)" />
            </div>

            {editing === u.id && <AdjustForm user={u} onSave={handleAdjust} />}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
        <PagBtn disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Назад</PagBtn>
        <PagBtn disabled={users.length < 30} onClick={() => setPage(p => p + 1)}>Далее →</PagBtn>
      </div>

      {/* Detail loading overlay */}
      {loadingDetail && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}><Loading /></div>}
    </div>
  );
}

function AdjustForm({ user, onSave }) {
  const [power, setPower] = useState(String(user.power));
  const [ton, setTon] = useState(String(user.ton_balance));
  return (
    <div style={{ marginTop: 10, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>POWER</div>
          <input type="number" value={power} onChange={e => setPower(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 13 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>TON</div>
          <input type="number" value={ton} onChange={e => setTon(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 13 }} />
        </div>
      </div>
      <button className="btn-gold" onClick={() => onSave(user.id, power, ton)}
        style={{ padding: '10px', fontSize: 13 }}>💾 Сохранить</button>
    </div>
  );
}

// ═══════════════════ WITHDRAWALS ═══════════════════
function WithdrawalsPanel() {
  const [filter, setFilter] = useState('pending');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [txHashInputs, setTxHashInputs] = useState({});
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/admin/withdrawals?status=${filter}`);
      setItems(data);
    } catch (e) {
      setMsg('❌ Ошибка загрузки выводов');
      setTimeout(() => setMsg(null), 3000);
    }
  };
  useEffect(() => { load(); }, [filter]);

  const approve = async (id) => {
    setLoading(true);
    try {
      const txHash = txHashInputs[id]?.trim() || ('manual_' + Date.now());
      await api.post(`/admin/withdrawals/${id}/approve`, { tx_hash: txHash });
      setTxHashInputs(prev => { const n = {...prev}; delete n[id]; return n; });
      load();
    } catch (e) {
      setMsg('❌ Ошибка одобрения');
      setTimeout(() => setMsg(null), 3000);
    }
    setLoading(false);
  };

  const reject = async (id) => {
    setLoading(true);
    try {
      await api.post(`/admin/withdrawals/${id}/reject`);
      load();
    } catch (e) {
      setMsg('❌ Ошибка отклонения');
      setTimeout(() => setMsg(null), 3000);
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['pending', 'completed', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: filter === s ? 'var(--gold)' : 'var(--bg-card)',
            color: filter === s ? '#000' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 12, cursor: 'pointer'
          }}>
            {s === 'pending' ? '⏳' : s === 'completed' ? '✅' : '❌'} {s}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          background: msg.startsWith('✅') ? 'rgba(52,211,153,0.1)' : 'var(--red-bg)',
          color: msg.startsWith('✅') ? 'var(--green)' : 'var(--red)',
          fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{msg}</div>
      )}

      {items.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Пусто</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(w => (
          <div key={w.id} className="card" style={{ padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold-light)' }}>
                  {fmt(w.ton_amount, 4)} TON
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {w.first_name || w.username} (TG:{w.tg_id})
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>
                #{w.id}<br/>{new Date(w.created_at).toLocaleString()}
              </div>
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace',
              wordBreak: 'break-all', marginBottom: 10,
              background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 10px'
            }}>
              {w.wallet_address}
            </div>

            {filter === 'pending' && (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <input type="text" value={txHashInputs[w.id] || ''}
                    onChange={e => setTxHashInputs({...txHashInputs, [w.id]: e.target.value})}
                    placeholder="TX hash (опционально)"
                    style={{ fontSize: 11, padding: '6px 10px', fontFamily: 'monospace' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={() => approve(w.id)} disabled={loading} style={{
                    padding: 10, borderRadius: 10, border: 'none',
                    background: 'var(--green-bg)', color: 'var(--green)',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer'
                  }}>✅ Одобрить</button>
                  <button onClick={() => reject(w.id)} disabled={loading} style={{
                    padding: 10, borderRadius: 10, border: 'none',
                    background: 'var(--red-bg)', color: 'var(--red)',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer'
                  }}>❌ Отклонить</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════ TASKS ═══════════════════
function TasksPanel() {
  const [tasks, setTasks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', reward_power: '', type: 'other', link: '', visibility: 'admin' });

  const load = async () => {
    try {
      const { data } = await api.get('/admin/tasks');
      setTasks(data);
    } catch (e) {
      console.error('[Admin] Tasks load error:', e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title || !form.reward_power) return;
    await api.post('/admin/tasks', { ...form, reward_power: parseFloat(form.reward_power) });
    setForm({ title: '', description: '', reward_power: '', type: 'other', link: '', visibility: 'admin' });
    setShowForm(false);
    load();
  };

  const toggle = async (id) => { await api.post(`/admin/tasks/${id}/toggle`); load(); };
  const del = async (id) => { await api.delete(`/admin/tasks/${id}`); load(); };

  const toggleVisibility = async (id, current) => {
    const next = current === 'all' ? 'admin' : 'all';
    await api.post(`/admin/tasks/${id}/visibility`, { visibility: next });
    load();
  };

  return (
    <div>
      <button onClick={() => setShowForm(!showForm)} className="btn-gold" style={{ marginBottom: 14, padding: 10, fontSize: 13 }}>
        {showForm ? '✕ Отмена' : '+ Новое задание'}
      </button>

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})}
            placeholder="Название задания" style={{ marginBottom: 8, fontSize: 13 }} />
          <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            placeholder="Описание (опц.)" style={{ marginBottom: 8, fontSize: 13 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input type="number" value={form.reward_power} onChange={e => setForm({...form, reward_power: e.target.value})}
              placeholder="Power награда" style={{ fontSize: 13 }} />
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
              style={{
                padding: '10px', borderRadius: 16, background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)', color: '#fff', fontSize: 13
              }}>
              <option value="subscribe_channel">📢 Подписка (проверка)</option>
              <option value="start_bot">🤖 Запуск бота</option>
              <option value="link">🔗 Ссылка</option>
            </select>
          </div>
          <input type="text" value={form.link} onChange={e => setForm({...form, link: e.target.value})}
            placeholder="Ссылка (опц.)" style={{ marginBottom: 8, fontSize: 13 }} />

          {/* Visibility selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => setForm({...form, visibility: 'admin'})} style={{
              flex: 1, padding: 10, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              background: form.visibility === 'admin' ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.04)',
              color: form.visibility === 'admin' ? 'var(--red)' : 'var(--text-muted)',
            }}>🔒 Только я</button>
            <button onClick={() => setForm({...form, visibility: 'all'})} style={{
              flex: 1, padding: 10, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              background: form.visibility === 'all' ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
              color: form.visibility === 'all' ? 'var(--green)' : 'var(--text-muted)',
            }}>🌍 Все юзеры</button>
          </div>

          <button className="btn-gold" onClick={create} style={{ padding: 10, fontSize: 13 }}>💾 Создать</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tasks.map(t => (
          <div key={t.id} className="card" style={{
            padding: '12px 14px', opacity: t.is_active ? 1 : 0.5,
            display: 'flex', alignItems: 'center', gap: 10,
            border: t.visibility === 'admin' ? '1px solid rgba(248,113,113,0.2)' : undefined
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</span>
                <span style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 6, fontWeight: 700,
                  background: t.visibility === 'admin' ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)',
                  color: t.visibility === 'admin' ? 'var(--red)' : 'var(--green)',
                }}>{t.visibility === 'admin' ? '🔒 СКРЫТ' : '🌍 ПУБЛ'}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--gold)' }}>+{fmtK(t.reward_power)} POWER</div>
            </div>
            <button onClick={() => toggleVisibility(t.id, t.visibility)} title="Видимость" style={{
              background: t.visibility === 'admin' ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)',
              border: 'none', borderRadius: 8, padding: '4px 8px',
              color: t.visibility === 'admin' ? 'var(--red)' : 'var(--green)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer'
            }}>{t.visibility === 'admin' ? '🔒' : '🌍'}</button>
            <button onClick={() => toggle(t.id)} style={{
              background: t.is_active ? 'var(--green-bg)' : 'var(--red-bg)',
              border: 'none', borderRadius: 8, padding: '4px 10px',
              color: t.is_active ? 'var(--green)' : 'var(--red)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer'
            }}>{t.is_active ? 'ON' : 'OFF'}</button>
            <button onClick={() => del(t.id)} style={{
              background: 'var(--red-bg)', border: 'none', borderRadius: 8,
              padding: '4px 8px', color: 'var(--red)', fontSize: 11, cursor: 'pointer'
            }}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════ TASK ORDERS ═══════════════════
function OrdersPanel() {
  const [orders, setOrders] = useState([]);
  const [processing, setProcessing] = useState(null);

  // Pricing settings
  const [prices, setPrices] = useState({
    order_price_subscribe: '0.01',
    order_price_start_bot: '0.008',
    order_price_link: '0.005',
    order_reward_subscribe: '500',
    order_reward_start_bot: '300',
    order_reward_link: '200',
  });
  const [savingPrices, setSavingPrices] = useState(false);
  const [priceMsg, setPriceMsg] = useState(null);

  const load = async () => {
    const { data } = await api.get('/admin/task-orders');
    setOrders(data);
  };
  const loadPrices = async () => {
    try {
      const { data } = await api.get('/admin/ad-settings');
      // ad-settings returns order_% keys too
      const orderSettings = {};
      data.forEach(s => {
        if (s.key.startsWith('order_')) orderSettings[s.key] = s.value;
      });
      if (Object.keys(orderSettings).length) setPrices(prev => ({ ...prev, ...orderSettings }));
    } catch (e) {}
  };
  useEffect(() => { load(); loadPrices(); }, []);

  const savePrices = async () => {
    setSavingPrices(true);
    try {
      const settings = Object.entries(prices).map(([key, value]) => ({ key, value: String(value) }));
      await api.post('/admin/ad-settings', { settings });
      setPriceMsg('✅ Сохранено');
    } catch (e) { setPriceMsg('❌ Ошибка'); }
    setSavingPrices(false);
    setTimeout(() => setPriceMsg(null), 2000);
  };

  const approve = async (id) => {
    setProcessing(id);
    try { await api.post(`/admin/task-orders/${id}/approve`); load(); } catch (e) { alert('Ошибка'); }
    setProcessing(null);
  };

  const reject = async (id) => {
    setProcessing(id);
    try { await api.post(`/admin/task-orders/${id}/reject`); load(); } catch (e) { alert('Ошибка'); }
    setProcessing(null);
  };

  const deleteOrder = async (id) => {
    if (!window.confirm('Удалить заказ?')) return;
    setProcessing(id);
    try { await api.delete(`/admin/task-orders/${id}`); load(); } catch (e) { alert('Ошибка'); }
    setProcessing(null);
  };

  const typeLabels = { subscribe_channel: '📢 Подписка', start_bot: '🤖 Бот', link: '🔗 Ссылка' };
  const statusColors = { pending: 'var(--orange)', active: 'var(--green)', completed: 'var(--gold)', rejected: 'var(--red)' };
  const statusLabels = { pending: '⏳ Ожидает', active: '✅ Активен', completed: '🏁 Завершён', rejected: '❌ Отклонён' };

  const priceFields = [
    { key: 'order_price_subscribe', label: '📢 Цена подписки (TON)', icon: '💰' },
    { key: 'order_reward_subscribe', label: '📢 Награда за подписку (POWER)', icon: '⚡' },
    { key: 'order_price_start_bot', label: '🤖 Цена запуска бота (TON)', icon: '💰' },
    { key: 'order_reward_start_bot', label: '🤖 Награда за запуск (POWER)', icon: '⚡' },
    { key: 'order_price_link', label: '🔗 Цена перехода (TON)', icon: '💰' },
    { key: 'order_reward_link', label: '🔗 Награда за переход (POWER)', icon: '⚡' },
  ];

  return (
    <div>
      {/* ── Pricing Settings ── */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
        💰 ЦЕНООБРАЗОВАНИЕ ЗАКАЗОВ
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {priceFields.map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{f.label}</div>
              <input type="number" step={f.key.includes('price') ? '0.001' : '1'} value={prices[f.key] || ''}
                onChange={e => setPrices({ ...prices, [f.key]: e.target.value })}
                style={{ fontSize: 13, padding: '8px 10px', width: '100%', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
        <button onClick={savePrices} disabled={savingPrices} style={{
          width: '100%', padding: 10, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          marginTop: 10, background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', color: '#000',
        }}>
          {savingPrices ? '⏳...' : '💾 Сохранить цены'}
        </button>
        {priceMsg && (
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, textAlign: 'center',
            color: priceMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{priceMsg}</div>
        )}
      </div>

      {/* ── Orders List ── */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
        🛒 ЗАКАЗЫ ПОЛЬЗОВАТЕЛЕЙ ({orders.filter(o => o.status === 'pending').length} ожидают)
      </div>

      {orders.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Заказов пока нет</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {orders.map((o, i) => (
          <div key={o.id} className="card" style={{
            padding: '14px', animation: `fadeIn 0.3s ease ${i * 0.04}s both`,
            border: o.status === 'pending' ? '1px solid rgba(251,191,36,0.3)' : undefined
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{typeLabels[o.type]?.slice(0, 2) || '📋'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {typeLabels[o.type] || o.type}
                  {o.title ? ` — ${o.title}` : ''}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {o.username || o.first_name || `ID:${o.user_id}`} (TG:{o.tg_id})
                </div>
              </div>
              <span style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 6, fontWeight: 700,
                background: `${statusColors[o.status]}22`, color: statusColors[o.status],
              }}>{statusLabels[o.status] || o.status}</span>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, wordBreak: 'break-all' }}>
              🔗 {o.link}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)' }}>{fmt(o.total_paid, 4)}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>TON оплата</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{o.max_completions}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Юзеров</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{o.completed_count || 0}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Выполн.</div>
              </div>
            </div>

            {o.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <button onClick={() => approve(o.id)} disabled={processing === o.id} style={{
                  flex: 1, padding: 10, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  background: 'rgba(52,211,153,0.15)', color: 'var(--green)',
                }}>✅ Одобрить</button>
                <button onClick={() => reject(o.id)} disabled={processing === o.id} style={{
                  flex: 1, padding: 10, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  background: 'rgba(248,113,113,0.15)', color: 'var(--red)',
                }}>❌ Отклонить</button>
              </div>
            )}
            <button onClick={() => deleteOrder(o.id)} disabled={processing === o.id} style={{
              width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(248,113,113,0.2)',
              background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, cursor: 'pointer',
            }}>🗑 Удалить</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════ PACKAGES ═══════════════════
function PackagesPanel() {
  const [packages, setPackages] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({ name: '', power_amount: '', price_ton: '' });
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get('/admin/packages');
      setPackages(data);
    } catch (e) {
      console.error('[Admin] Packages load error:', e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: '', power_amount: '', price_ton: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const create = async () => {
    if (!form.name || !form.power_amount || !form.price_ton) return;
    await api.post('/admin/packages', {
      name: form.name, power_amount: parseFloat(form.power_amount), price_ton: parseFloat(form.price_ton)
    });
    resetForm();
    load();
  };

  const startEdit = (pkg) => {
    setEditingId(pkg.id);
    setForm({ name: pkg.name, power_amount: String(pkg.power_amount), price_ton: String(pkg.price_ton) });
    setShowForm(false);
  };

  const saveEdit = async () => {
    if (!form.name || !form.power_amount || !form.price_ton) return;
    await api.put(`/admin/packages/${editingId}`, {
      name: form.name, power_amount: parseFloat(form.power_amount), price_ton: parseFloat(form.price_ton)
    });
    resetForm();
    load();
  };

  const cancelEdit = () => resetForm();

  const toggle = async (id) => { await api.post(`/admin/packages/${id}/toggle`); load(); };

  const del = async (id) => {
    try {
      const { data } = await api.delete(`/admin/packages/${id}`);
      if (data.soft) {
        setMsg('⚠️ Пакет деактивирован (есть покупки)');
        setTimeout(() => setMsg(null), 3000);
      }
    } catch (e) {
      setMsg('❌ Ошибка удаления');
      setTimeout(() => setMsg(null), 3000);
    }
    setConfirmDelete(null);
    load();
  };

  return (
    <div>
      {/* Status message */}
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          background: msg.startsWith('⚠️') ? 'rgba(251,191,36,0.1)' : 'var(--red-bg)',
          color: msg.startsWith('⚠️') ? 'var(--orange)' : 'var(--red)',
          fontSize: 12, fontWeight: 600, textAlign: 'center',
          animation: 'fadeIn 0.3s ease'
        }}>{msg}</div>
      )}

      {/* New / Cancel buttons (hide when editing) */}
      {!editingId && (
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
          className="btn-gold" style={{ marginBottom: 14, padding: 10, fontSize: 13 }}>
          {showForm ? '✕ Отмена' : '+ Новый пакет'}
        </button>
      )}

      {/* Create form */}
      {showForm && !editingId && (
        <div className="card" style={{ marginBottom: 14 }}>
          <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
            placeholder="Название" style={{ marginBottom: 8, fontSize: 13 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <input type="number" value={form.power_amount} onChange={e => setForm({...form, power_amount: e.target.value})}
              placeholder="Power" style={{ fontSize: 13 }} />
            <input type="number" value={form.price_ton} onChange={e => setForm({...form, price_ton: e.target.value})}
              placeholder="Цена TON" step="0.01" style={{ fontSize: 13 }} />
          </div>
          <button className="btn-gold" onClick={create} style={{ padding: 10, fontSize: 13 }}>💾 Создать</button>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="card" style={{
          marginBottom: 14, border: '1px solid rgba(248,113,113,0.4)',
          background: 'rgba(248,113,113,0.06)'
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>
            🗑 Удалить «{packages.find(p => p.id === confirmDelete)?.name}»?
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            Если есть покупки — пакет будет деактивирован вместо удаления
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => setConfirmDelete(null)} style={{
              padding: 10, borderRadius: 10, border: 'none',
              background: 'var(--bg-card)', color: 'var(--text-muted)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer'
            }}>Отмена</button>
            <button onClick={() => del(confirmDelete)} style={{
              padding: 10, borderRadius: 10, border: 'none',
              background: 'var(--red-bg)', color: 'var(--red)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer'
            }}>🗑 Удалить</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {packages.map(p => (
          <div key={p.id} className="card" style={{
            padding: '12px 14px', opacity: p.is_active ? 1 : 0.5,
            border: editingId === p.id ? '1px solid var(--gold)' : undefined,
            transition: 'var(--transition)'
          }}>
            {/* Edit mode */}
            {editingId === p.id ? (
              <div>
                <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
                  ✏️ РЕДАКТИРОВАНИЕ
                </div>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="Название" style={{ marginBottom: 8, fontSize: 13 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>POWER</div>
                    <input type="number" value={form.power_amount} onChange={e => setForm({...form, power_amount: e.target.value})}
                      style={{ fontSize: 13 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>ЦЕНА TON</div>
                    <input type="number" value={form.price_ton} onChange={e => setForm({...form, price_ton: e.target.value})}
                      step="0.01" style={{ fontSize: 13 }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={cancelEdit} style={{
                    padding: 10, borderRadius: 10, border: 'none',
                    background: 'var(--bg-card)', color: 'var(--text-muted)',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer'
                  }}>✕ Отмена</button>
                  <button className="btn-gold" onClick={saveEdit} style={{ padding: 10, fontSize: 13 }}>
                    💾 Сохранить
                  </button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {fmtK(p.power_amount)} POWER • {p.price_ton} TON
                  </div>
                </div>
                <button onClick={() => startEdit(p)} style={{
                  background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 8,
                  padding: '6px 10px', color: 'var(--text-muted)',
                  fontSize: 12, cursor: 'pointer'
                }}>✏️</button>
                <button onClick={() => toggle(p.id)} style={{
                  background: p.is_active ? 'var(--green-bg)' : 'var(--red-bg)',
                  border: 'none', borderRadius: 8, padding: '6px 12px',
                  color: p.is_active ? 'var(--green)' : 'var(--red)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}>{p.is_active ? '✅' : '❌'}</button>
                <button onClick={() => setConfirmDelete(p.id)} style={{
                  background: 'var(--red-bg)', border: 'none', borderRadius: 8,
                  padding: '6px 8px', color: 'var(--red)',
                  fontSize: 12, cursor: 'pointer'
                }}>🗑</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════ REFERRALS ═══════════════════
function ReferralsPanel() {
  const [settings, setSettings] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    const [settingsRes, statsRes] = await Promise.all([
      api.get('/admin/ref-settings'),
      api.get('/admin/ref-stats'),
    ]);
    setSettings(settingsRes.data);
    setStats(statsRes.data);
    const formData = {};
    settingsRes.data.forEach(s => { formData[s.key] = s.value; });
    setForm(formData);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const arr = Object.entries(form).map(([key, value]) => {
        const existing = settings.find(s => s.key === key);
        return { key, value, label: existing?.label || key };
      });
      await api.put('/admin/ref-settings', { settings: arr });
      setMsg('✅ Настройки сохранены');
      setTimeout(() => setMsg(null), 2500);
      load();
    } catch {
      setMsg('❌ Ошибка сохранения');
      setTimeout(() => setMsg(null), 2500);
    } finally { setSaving(false); }
  };

  const FIELDS = [
    { key: 'ref_power_premium', label: '⭐ Power за Premium', icon: '⭐', suffix: 'POWER' },
    { key: 'ref_power_normal', label: '👤 Power за обычного', icon: '👤', suffix: 'POWER' },
    { key: 'ref_commission_pct', label: '💰 Комиссия с покупок', icon: '💰', suffix: '%' },
  ];

  return (
    <div>
      {/* Status message */}
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          background: msg.startsWith('✅') ? 'rgba(52,211,153,0.1)' : 'var(--red-bg)',
          color: msg.startsWith('✅') ? 'var(--green)' : 'var(--red)',
          fontSize: 12, fontWeight: 600, textAlign: 'center',
          animation: 'fadeIn 0.3s ease'
        }}>{msg}</div>
      )}

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { icon: '🤝', label: 'Всего рефералов', val: stats.total_referrals, color: 'var(--gold)' },
            { icon: '✅', label: 'Активных', val: stats.confirmed_referrals, color: 'var(--green)' },
            { icon: '⚡', label: 'Power выдано', val: fmtK(stats.total_power_given), color: 'var(--gold-light)' },
            { icon: '💎', label: 'TON выдано', val: fmt(stats.total_ton_given, 4), color: 'var(--orange)' },
          ].map((c, i) => (
            <div key={c.label} className="card" style={{
              padding: 14, animation: `fadeIn 0.3s ease ${i * 0.05}s both`
            }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{c.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: c.color }}>{c.val}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Settings form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--gold)', letterSpacing: 0.5 }}>
          ⚙️ НАСТРОЙКИ РЕФЕРАЛОВ
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
          Награда за регистрацию начисляется при первой покупке друга (активация)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FIELDS.map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                {f.icon} {f.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  value={form[f.key] || ''}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={{ flex: 1, fontSize: 14, padding: '10px 12px' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, minWidth: 50 }}>
                  {f.suffix}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="btn-gold" onClick={save} disabled={saving}
          style={{ marginTop: 14, padding: 12, fontSize: 13 }}>
          {saving ? '⏳ Сохраняю...' : '💾 Сохранить настройки'}
        </button>
      </div>

      {/* Top referrers */}
      {stats?.top_referrers?.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            🏆 ТОП РЕФЕРЕРЫ
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stats.top_referrers.map((r, i) => (
              <div key={r.id} className="card" style={{
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
                animation: `fadeIn 0.3s ease ${i * 0.05}s both`
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: i < 3 ? 'linear-gradient(135deg, var(--gold-dark), var(--gold))' : 'var(--bg-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: i < 3 ? '#000' : 'var(--text-muted)'
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.first_name || r.username || `ID:${r.id}`}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    TG:{r.tg_id}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)' }}>{r.ref_count}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>рефер. ({r.confirmed_count} актив)</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ ADS SETTINGS ═══════════════════
function AdsPanel() {
  const [settings, setSettings] = useState([]);
  const [monetagSettings, setMonetagSettings] = useState([]);
  const [richadsSettings, setRichadsSettings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get('/admin/ad-settings').then(r => {
      // Adsgram defaults
      const adsgramDefaults = [
        { key: 'adsgram_block_id', value: '29776', label: 'Adsgram Block ID' },
        { key: 'adsgram_task_id', value: 'task-29788', label: 'Adsgram Task ID' },
        { key: 'ad_reward_power', value: '500', label: 'Power за просмотр (Adsgram)' },
        { key: 'ad_cooldown_seconds', value: '60', label: 'Кулдаун между рекламами (сек)' },
        { key: 'ad_daily_limit', value: '50', label: 'Лимит просмотров в день' },
      ];
      // Monetag defaults
      const monetagDefaults = [
        { key: 'monetag_zone_id', value: '10984603', label: 'Monetag Zone ID' },
        { key: 'monetag_reward_power', value: '5', label: 'Power за просмотр (Monetag)' },
      ];
      // RichAds defaults
      const richadsDefaults = [
        { key: 'richads_pub_id', value: '1007971', label: 'RichAds Publisher ID' },
        { key: 'richads_app_id', value: '7369', label: 'RichAds App ID' },
      ];

      const allData = r.data;
      const mergedAdsgram = adsgramDefaults.map(d => {
        const existing = allData.find(s => s.key === d.key);
        return existing || d;
      });
      const mergedMonetag = monetagDefaults.map(d => {
        const existing = allData.find(s => s.key === d.key);
        return existing || d;
      });
      const mergedRichads = richadsDefaults.map(d => {
        const existing = allData.find(s => s.key === d.key);
        return existing || d;
      });

      setSettings(mergedAdsgram);
      setMonetagSettings(mergedMonetag);
      setRichadsSettings(mergedRichads);
    });
  }, []);

  const updateVal = (key, value) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
    setMonetagSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
    setRichadsSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  const save = async () => {
    setSaving(true);
    try {
      const allSettings = [...settings, ...monetagSettings, ...richadsSettings];
      await api.put('/admin/ad-settings', { settings: allSettings });
      setMsg('✅ Настройки рекламы сохранены');
    } catch (e) {
      setMsg('❌ Ошибка сохранения');
    }
    setSaving(false);
    setTimeout(() => setMsg(null), 2500);
  };

  const adsgramFieldMeta = {
    adsgram_block_id: { icon: '🎯', unit: 'ID', desc: 'Block ID из личного кабинета Adsgram' },
    adsgram_task_id: { icon: '📋', unit: 'ID', desc: 'Task ID для спонсорских заданий Adsgram' },
    ad_reward_power: { icon: '⚡', unit: 'POWER', desc: 'Сколько Power юзер получает за один просмотр Adsgram' },
    ad_cooldown_seconds: { icon: '⏱️', unit: 'сек', desc: 'Минимальное время между просмотрами (общее)' },
    ad_daily_limit: { icon: '📊', unit: 'раз', desc: 'Макс. просмотров рекламы в день (общее)' },
  };

  const monetagFieldMeta = {
    monetag_zone_id: { icon: '🌐', unit: 'ID', desc: 'Zone ID из личного кабинета Monetag' },
    monetag_reward_power: { icon: '💎', unit: 'POWER', desc: 'Сколько Power юзер получает за один просмотр Monetag' },
  };

  const richadsFieldMeta = {
    richads_pub_id: { icon: '📎', unit: 'ID', desc: 'Publisher ID из publishers.richads.com' },
    richads_app_id: { icon: '📱', unit: 'ID', desc: 'App ID из publishers.richads.com' },
  };

  const renderSettingCard = (s, meta) => (
    <div key={s.key} className="card" style={{ padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{meta.desc}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type={s.key.endsWith('_id') || s.key.endsWith('block_id') ? 'text' : 'number'}
          value={s.value}
          onChange={e => updateVal(s.key, e.target.value)}
          style={{ flex: 1, padding: '10px 12px', fontSize: 16, fontWeight: 700, textAlign: 'center' }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, minWidth: 50 }}>
          {meta.unit}
        </span>
      </div>
    </div>
  );

  return (
    <div>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          background: msg.startsWith('✅') ? 'rgba(52,211,153,0.1)' : 'var(--red-bg)',
          color: msg.startsWith('✅') ? 'var(--green)' : 'var(--red)',
          fontSize: 12, fontWeight: 600, textAlign: 'center'
        }}>{msg}</div>
      )}

      {/* Adsgram Section */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
        🎬 НАСТРОЙКИ ADSGRAM
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {settings.map(s => {
          const meta = adsgramFieldMeta[s.key] || { icon: '📝', unit: '', desc: '' };
          return renderSettingCard(s, meta);
        })}
      </div>

      {/* Monetag Section */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
        💎 НАСТРОЙКИ MONETAG
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
        Кулдаун и дневной лимит — общие для Adsgram и Monetag
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {monetagSettings.map(s => {
          const meta = monetagFieldMeta[s.key] || { icon: '📝', unit: '', desc: '' };
          return renderSettingCard(s, meta);
        })}
      </div>

      {/* RichAds Section */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
        📎 НАСТРОЙКИ RICHADS
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
        publishers.richads.com — Push/Video реклама
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {richadsSettings.map(s => {
          const meta = richadsFieldMeta[s.key] || { icon: '📝', unit: '', desc: '' };
          return renderSettingCard(s, meta);
        })}
      </div>

      <button className="btn-gold" onClick={save} disabled={saving}
        style={{ padding: 14, fontSize: 14 }}>
        {saving ? '⏳ Сохраняю...' : '💾 Сохранить все настройки'}
      </button>

      <div className="card" style={{ marginTop: 16, padding: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
          📡 ПОДКЛЮЧЁННЫЕ ПРОВАЙДЕРЫ
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...settings, ...monetagSettings, ...richadsSettings].map(p => (
            <div key={p.key} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 10
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{p.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.value}</div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>✓ Настроено</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// ═══════════════════ MULTI-ACCOUNT DETECTION ═══════════════════
function MultiAccountPanel() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get('/admin/multi-accounts');
      setGroups(data);
    } catch (e) { setMsg('❌ Ошибка загрузки'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const showMsg = (t) => { setMsg(t); setTimeout(() => setMsg(null), 3000); };

  const blockUser = async (userId) => {
    try {
      await api.post(`/admin/users/${userId}/block`, { blocked: true });
      showMsg('🚫 Пользователь заблокирован');
      load();
    } catch (e) { showMsg(`❌ ${e.response?.data?.error || 'Ошибка'}`); }
  };

  if (loading) return <Loading />;

  const totalSuspects = groups.reduce((s, g) => s + g.users.length, 0);

  return (
    <div>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          background: msg.startsWith('✅') || msg.startsWith('🚫') ? 'rgba(52,211,153,0.1)' : 'var(--red-bg)',
          color: msg.startsWith('✅') || msg.startsWith('🚫') ? 'var(--green)' : 'var(--red)',
          fontSize: 12, fontWeight: 600, textAlign: 'center', animation: 'fadeIn 0.3s ease'
        }}>{msg}</div>
      )}

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>👁</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Мульти-аккаунты</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {groups.length ? `${groups.length} IP • ${totalSuspects} юзеров` : 'Подозрительных не найдено'}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Показаны IP-адреса, с которых заходили 2+ разных аккаунта.
          Данные собираются автоматически при каждом входе.
        </div>
      </div>

      <button onClick={() => { setLoading(true); load(); }}
        className="btn-gold" style={{ marginBottom: 14, padding: 10, fontSize: 13 }}>
        🔄 Обновить
      </button>

      {groups.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Мульти-аккаунтов не обнаружено</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            IP-данные начнут собираться после деплоя
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map((g, gi) => (
          <div key={g.ip} className="card" style={{
            animation: `fadeIn 0.3s ease ${gi * 0.05}s both`,
            border: g.user_count >= 3 ? '1px solid rgba(248,113,113,0.4)' : '1px solid var(--border)',
          }}>
            {/* Group header */}
            <div onClick={() => setExpanded(expanded === g.ip ? null : g.ip)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: g.user_count >= 3 ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>
                  {g.user_count >= 3 ? '🚨' : '⚠️'}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>{g.ip}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: g.user_count >= 3 ? 'var(--red)' : 'var(--gold)', fontWeight: 700 }}>
                      {g.user_count} аккаунтов
                    </span>
                    {g.has_admin && (
                      <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(212,175,55,0.15)', color: 'var(--gold)', fontWeight: 700 }}>
                        👑 ADMIN
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 14, color: 'var(--text-muted)', transition: 'transform 0.2s',
                transform: expanded === g.ip ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </div>

            {/* Expanded user list */}
            {expanded === g.ip && (
              <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeIn 0.2s ease' }}>
                {g.users.map(u => (
                    <div key={u.id} style={{
                    padding: 10, borderRadius: 10,
                    background: u.is_admin ? 'rgba(212,175,55,0.06)' : u.is_blocked ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.03)',
                    border: u.is_admin ? '1px solid rgba(212,175,55,0.25)' : u.is_blocked ? '1px solid rgba(248,113,113,0.2)' : '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {u.first_name || u.username || 'Noname'}
                          {u.is_premium && <span style={{ fontSize: 9, marginLeft: 4 }}>⭐</span>}
                          {u.is_admin && <span style={{ fontSize: 8, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'rgba(212,175,55,0.15)', color: 'var(--gold)', fontWeight: 700 }}>👑 ADMIN</span>}
                          {u.is_blocked && <span style={{ fontSize: 8, marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--red-bg)', color: 'var(--red)', fontWeight: 700 }}>BLOCKED</span>}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          ID: {u.id} • TG: {u.tg_id}
                          {u.username ? ` • @${u.username}` : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--gold)' }}>⚡ {fmtK(u.power)}</span>
                          <span style={{ fontSize: 10, color: 'var(--green)' }}>💎 {parseFloat(u.ton_balance || 0).toFixed(4)}</span>
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                          Рег: {new Date(u.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      {!u.is_blocked && !u.is_admin && (
                        <button onClick={() => blockUser(u.id)} style={{
                          background: 'var(--red-bg)', border: 'none', borderRadius: 8,
                          padding: '6px 10px', color: 'var(--red)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          flexShrink: 0,
                        }}>🚫 Бан</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════ BROADCAST ═══════════════════
function BroadcastPanel() {
  const [message, setMessage] = useState('');
  const [parseMode, setParseMode] = useState('HTML');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [isRtl, setIsRtl] = useState(false);
  const [progress, setProgress] = useState(null); // { status, total, sent, failed }
  const pollRef = useRef(null);

  // Poll broadcast status every 2s while sending
  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get('/admin/broadcast/status');
        setProgress(data);
        if (data.status === 'done' || data.status === 'error' || data.status === 'idle') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setSending(false);
          if (data.status === 'done' || data.status === 'error') {
            setResult(data);
          }
        }
      } catch (e) {}
    }, 2000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const send = async () => {
    setConfirm(false);
    setSending(true);
    setResult(null);
    setProgress(null);
    try {
      const finalMsg = isRtl ? '\u200F' + message : message;
      const opts = { message: finalMsg };
      if (parseMode) opts.parse_mode = parseMode;
      const { data } = await api.post('/admin/broadcast', opts);
      if (data.status === 'started') {
        setProgress({ status: 'sending', total: data.total, sent: 0, failed: 0 });
        setMessage('');
        startPolling();
      } else {
        // Immediate result (0 users)
        setResult(data);
        setSending(false);
      }
    } catch (e) {
      console.error('[Broadcast] Error:', e);
      const status = e.response?.status;
      const serverMsg = e.response?.data?.error;
      let errorText = serverMsg || e.message || 'Ошибка отправки';
      if (status) errorText = `[${status}] ${errorText}`;
      setResult({ error: errorText });
      setSending(false);
    }
  };

  const pct = progress && progress.total > 0 ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>📢</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Рассылка в Telegram</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Отправить сообщение всем юзерам</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Сообщение придёт всем незаблокированным юзерам через бота.
          Можно использовать HTML: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;, &lt;code&gt;код&lt;/code&gt;
        </div>
      </div>

      {/* Format toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['HTML', 'Markdown', 'Plain'].map(m => (
          <button key={m} onClick={() => setParseMode(m === 'Plain' ? '' : m)} style={{
            padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: (parseMode === m || (m === 'Plain' && !parseMode)) ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
            color: (parseMode === m || (m === 'Plain' && !parseMode)) ? 'var(--gold)' : 'var(--text-muted)',
          }}>{m}</button>
        ))}
      </div>

      {/* RTL toggle */}
      <label onClick={() => setIsRtl(!isRtl)} style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
        background: isRtl ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
        border: isRtl ? '1px solid rgba(212,175,55,0.3)' : '1px solid var(--border)',
        transition: 'all 0.2s ease',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: isRtl ? 'var(--gold)' : 'transparent',
          border: isRtl ? 'none' : '2px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: '#000', fontWeight: 800,
          transition: 'all 0.2s ease',
        }}>{isRtl ? '✓' : ''}</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: isRtl ? 'var(--gold)' : 'var(--text-muted)' }}>🇸🇦 Арабский (RTL)</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Текст справа налево — для арабского, иврита, фарси</div>
        </div>
      </label>

      {/* Message input */}
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder={isRtl ? 'اكتب رسالتك هنا...' : 'Введите сообщение для рассылки...'}
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{
          width: '100%', minHeight: 120, padding: 12, borderRadius: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
          resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          textAlign: isRtl ? 'right' : 'left',
        }}
      />
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, marginBottom: 12, textAlign: 'right' }}>
        {message.length} символов
      </div>

      {/* Send button */}
      <button
        onClick={() => setConfirm(true)}
        disabled={!message.trim() || sending}
        className="btn-gold"
        style={{ padding: 12, fontSize: 14, opacity: !message.trim() || sending ? 0.4 : 1 }}
      >
        {sending ? '✉️ Отправка...' : '📢 Отправить всем'}
      </button>

      {/* Live progress */}
      {sending && progress && progress.status === 'sending' && (
        <div className="card" style={{ marginTop: 12, padding: 14, border: '1px solid rgba(212,175,55,0.3)', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>📤 Отправка...</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)' }}>{pct}%</div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', marginBottom: 10, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, transition: 'width 0.5s ease',
              background: 'linear-gradient(90deg, var(--gold-dark), var(--gold))',
              width: `${pct}%`,
            }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <MiniStat label="Всего" val={progress.total} color="var(--text)" />
            <MiniStat label="Отправлено" val={progress.sent} color="var(--green)" />
            <MiniStat label="Ошибки" val={progress.failed} color="var(--red)" />
          </div>
        </div>
      )}

      {/* Confirmation */}
      {confirm && (
        <div className="card" style={{
          marginTop: 12, padding: 14, border: '1px solid rgba(251,191,36,0.3)',
          textAlign: 'center', animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>
            ⚠️ Подтвердите рассылку
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            Сообщение будет отправлено всем пользователям!
          </div>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 12,
            fontSize: 12, color: 'var(--text)', textAlign: isRtl ? 'right' : 'left',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', direction: isRtl ? 'rtl' : 'ltr' }}>
            {message}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={send} className="btn-gold" style={{ padding: '8px 24px', fontSize: 12 }}>
              ✅ Да, отправить
            </button>
            <button onClick={() => setConfirm(false)} style={{
              padding: '8px 24px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}>Отмена</button>
          </div>
        </div>
      )}

      {/* Final result */}
      {result && !sending && (
        <div className="card" style={{
          marginTop: 12, padding: 14, animation: 'fadeIn 0.3s ease',
          border: result.error || result.status === 'error' ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(52,211,153,0.3)',
        }}>
          {result.error ? (
            <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>❌ {result.error}</div>
          ) : (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)', marginBottom: 8 }}>✅ Рассылка завершена!</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <MiniStat label="Всего" val={result.total} color="var(--text)" />
                <MiniStat label="Доставлено" val={result.sent} color="var(--green)" />
                <MiniStat label="Ошибки" val={result.failed} color="var(--red)" />
              </div>
              {result.errors && result.errors.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(248,113,113,0.06)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, marginBottom: 4 }}>⚠️ Первые ошибки:</div>
                  {result.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 2 }}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════ ADMINS ═══════════════════
const PERM_TABS = [
  { id: 'users', icon: '👥', label: 'Юзеры' },
  { id: 'withdrawals', icon: '💸', label: 'Выводы' },
  { id: 'tasks', icon: '📋', label: 'Задания' },
  { id: 'orders', icon: '🛒', label: 'Заказы' },
  { id: 'packages', icon: '📦', label: 'Пакеты' },
  { id: 'ads', icon: '🎬', label: 'Реклама' },
  { id: 'referrals', icon: '🤝', label: 'Рефералы' },
  { id: 'ambassador', icon: '🤝', label: 'Амбассадор' },
  { id: 'promo', icon: '🎟️', label: 'Промокоды' },
  { id: 'broadcast', icon: '📢', label: 'Рассылка' },
  { id: 'multi', icon: '👁', label: 'Мульти' },
];

function AdminsPanel() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tg_id: '', label: '', permissions: [] });
  const [msg, setMsg] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [editPerms, setEditPerms] = useState(null); // tg_id of admin being edited
  const [tempPerms, setTempPerms] = useState([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/admin/admins');
      setAdmins(data);
    } catch (e) { setMsg('❌ Ошибка загрузки'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(null), 3000); };

  const addAdmin = async () => {
    if (!form.tg_id) return;
    try {
      await api.post('/admin/admins', {
        tg_id: form.tg_id.trim(),
        label: form.label.trim() || null,
        permissions: form.permissions,
      });
      showMsg('✅ Админ добавлен');
      setForm({ tg_id: '', label: '', permissions: [] });
      setShowForm(false);
      load();
    } catch (e) { showMsg(`❌ ${e.response?.data?.error || 'Ошибка'}`); }
  };

  const removeAdmin = async (tgId) => {
    try {
      await api.delete(`/admin/admins/${tgId}`);
      showMsg('🗑️ Админ удалён');
      setConfirmRemove(null);
      load();
    } catch (e) { showMsg(`❌ ${e.response?.data?.error || 'Ошибка'}`); }
  };

  const startEditPerms = (a) => {
    setEditPerms(a.tg_id);
    setTempPerms(Array.isArray(a.permissions) ? [...a.permissions] : []);
  };

  const togglePerm = (id) => {
    setTempPerms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const toggleAllPerms = () => {
    setTempPerms(prev => prev.length === PERM_TABS.length ? [] : PERM_TABS.map(t => t.id));
  };

  const savePerms = async (tgId) => {
    setSavingPerms(true);
    try {
      await api.put(`/admin/admins/${tgId}/permissions`, { permissions: tempPerms });
      showMsg('✅ Права сохранены');
      setEditPerms(null);
      load();
    } catch (e) { showMsg(`❌ ${e.response?.data?.error || 'Ошибка'}`); }
    setSavingPerms(false);
  };

  if (loading) return <Loading />;

  return (
    <div>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          background: msg.startsWith('✅') || msg.startsWith('🗑') ? 'rgba(52,211,153,0.1)' : 'var(--red-bg)',
          color: msg.startsWith('✅') || msg.startsWith('🗑') ? 'var(--green)' : 'var(--red)',
          fontSize: 12, fontWeight: 600, textAlign: 'center', animation: 'fadeIn 0.3s ease'
        }}>{msg}</div>
      )}

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>🛡️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Управление админами</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Всего: {admins.length}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          👑 Суперадмины (env) имеют полный доступ.
          Добавленным админам нужно назначить разделы.
        </div>
      </div>

      <button onClick={() => setShowForm(!showForm)}
        className="btn-gold" style={{ marginBottom: 14, padding: 10, fontSize: 13 }}>
        {showForm ? '✕ Отмена' : '+ Добавить админа'}
      </button>

      {showForm && (
        <div className="card" style={{ marginBottom: 14, animation: 'fadeIn 0.3s ease' }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, marginBottom: 10, letterSpacing: 1 }}>
            ➕ НОВЫЙ АДМИН
          </div>
          <input type="text" value={form.tg_id} onChange={e => setForm({...form, tg_id: e.target.value})}
            placeholder="Telegram ID (числовой)" style={{ marginBottom: 8, fontSize: 13 }} />
          <input type="text" value={form.label} onChange={e => setForm({...form, label: e.target.value})}
            placeholder="Имя / метка (опционально)" style={{ marginBottom: 10, fontSize: 13 }} />

          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
            🔐 ДОСТУП К РАЗДЕЛАМ:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {PERM_TABS.map(t => {
              const active = form.permissions.includes(t.id);
              return (
                <button key={t.id} onClick={() => setForm({...form,
                  permissions: active ? form.permissions.filter(p => p !== t.id) : [...form.permissions, t.id]
                })} style={{
                  padding: '5px 10px', borderRadius: 8, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  background: active ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
                  color: active ? 'var(--green)' : 'var(--text-muted)',
                }}>{t.icon} {t.label}</button>
              );
            })}
          </div>

          <button className="btn-gold" onClick={addAdmin} style={{ padding: 10, fontSize: 13 }}>
            🛡️ Добавить
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {admins.map((a, i) => (
          <div key={a.tg_id} className="card" style={{
            padding: '14px', animation: `fadeIn 0.3s ease ${i * 0.04}s both`,
            border: a.is_env ? '1px solid rgba(212,175,55,0.3)' : '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: a.is_env ? 'linear-gradient(135deg, var(--gold-dark), var(--gold))' : 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, color: a.is_env ? '#000' : 'var(--text-muted)', flexShrink: 0,
                }}>
                  {a.is_env ? '👑' : '🛡️'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                      {a.first_name || a.username || a.label || 'Admin'}
                    </span>
                    {a.is_env && (
                      <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, fontWeight: 800,
                        background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', color: '#000'
                      }}>SUPER</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    TG: {a.tg_id}{a.username ? ` • @${a.username}` : ''}
                  </div>
                  {/* Permissions badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                    {a.permissions === '*' ? (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(212,175,55,0.15)', color: 'var(--gold)', fontWeight: 700 }}>
                        ✦ Полный доступ
                      </span>
                    ) : Array.isArray(a.permissions) && a.permissions.length > 0 ? (
                      a.permissions.map(p => {
                        const t = PERM_TABS.find(x => x.id === p);
                        return t ? (
                          <span key={p} style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(52,211,153,0.1)', color: 'var(--green)', fontWeight: 600 }}>
                            {t.icon}
                          </span>
                        ) : null;
                      })
                    ) : (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(248,113,113,0.1)', color: 'var(--red)', fontWeight: 600 }}>
                        ⚠ Нет доступа
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {!a.is_env && (
                  <>
                    <button onClick={() => editPerms === a.tg_id ? setEditPerms(null) : startEditPerms(a)} style={{
                      background: editPerms === a.tg_id ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                      border: 'none', borderRadius: 8, padding: '6px 10px',
                      color: editPerms === a.tg_id ? 'var(--gold)' : 'var(--text-muted)',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>🔐</button>
                    <button onClick={() => setConfirmRemove(a.tg_id)} style={{
                      background: 'var(--red-bg)', border: 'none', borderRadius: 8,
                      padding: '6px 10px', color: 'var(--red)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>🗑</button>
                  </>
                )}
              </div>
            </div>

            {/* Permissions editor */}
            {editPerms === a.tg_id && (
              <div style={{ marginTop: 10, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 12, animation: 'fadeIn 0.2s ease' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, letterSpacing: 1 }}>🔐 ДОСТУП</div>
                  <button onClick={toggleAllPerms} style={{
                    background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 6,
                    padding: '3px 8px', color: 'var(--text-muted)', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                  }}>{tempPerms.length === PERM_TABS.length ? 'Снять все' : 'Выбрать все'}</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  {PERM_TABS.map(t => {
                    const active = tempPerms.includes(t.id);
                    return (
                      <button key={t.id} onClick={() => togglePerm(t.id)} style={{
                        padding: '6px 10px', borderRadius: 8, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        background: active ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
                        color: active ? 'var(--green)' : 'var(--text-muted)',
                        transition: 'all 0.15s ease',
                      }}>{active ? '✅' : '⬜'} {t.icon} {t.label}</button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => savePerms(a.tg_id)} disabled={savingPerms} className="btn-gold"
                    style={{ flex: 1, padding: 10, fontSize: 12 }}>
                    {savingPerms ? '⏳...' : '💾 Сохранить'}
                  </button>
                  <button onClick={() => setEditPerms(null)} style={{
                    padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  }}>✕</button>
                </div>
              </div>
            )}

            {/* Remove confirmation */}
            {confirmRemove === a.tg_id && (
              <div style={{
                marginTop: 10, padding: 12, background: 'var(--red-bg)', borderRadius: 12,
                border: '1px solid rgba(248,113,113,0.3)', textAlign: 'center', animation: 'fadeIn 0.2s ease'
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>
                  ⚠️ Удалить админа {a.first_name || a.username || a.tg_id}?
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button onClick={() => removeAdmin(a.tg_id)} style={{
                    padding: '8px 20px', borderRadius: 10, border: 'none',
                    background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer'
                  }}>Да, удалить</button>
                  <button onClick={() => setConfirmRemove(null)} style={{
                    padding: '8px 20px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer'
                  }}>Отмена</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {admins.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🛡️</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Нет админов</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ AMBASSADOR ADMIN ═══════════════════
function AmbassadorAdminPanel() {
  const [subTab, setSubTab] = useState('settings');
  const [settings, setSettings] = useState(null);
  const [channels, setChannels] = useState([]);
  const [posts, setPosts] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    try {
      const [sRes, chRes, pRes] = await Promise.all([
        api.get('/ambassador/admin/settings'),
        api.get('/ambassador/admin/channels'),
        api.get('/ambassador/admin/posts'),
      ]);
      setSettings(sRes.data);
      setChannels(chRes.data);
      setPosts(pRes.data);
    } catch (e) { setMsg('❌ Ошибка загрузки'); }
    setLoading(false);
  };
  useEffect(() => { loadAll(); }, []);

  const showMsg = (t) => { setMsg(t); setTimeout(() => setMsg(null), 3000); };

  if (loading) return <Loading />;

  const tabs = [
    { id: 'settings', icon: '⚙️', label: 'Настройки' },
    { id: 'channels', icon: '📢', label: `Каналы (${channels.filter(c => c.status === 'pending').length})` },
    { id: 'posts', icon: '📝', label: 'Посты' },
  ];

  return (
    <div>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          background: msg.startsWith('✅') ? 'rgba(52,211,153,0.1)' : 'var(--red-bg)',
          color: msg.startsWith('✅') ? 'var(--green)' : 'var(--red)',
          fontSize: 12, fontWeight: 600, textAlign: 'center', animation: 'fadeIn 0.3s ease'
        }}>{msg}</div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{
            flex: 1, padding: '10px 6px', borderRadius: 10, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer',
            background: subTab === t.id ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
            color: subTab === t.id ? 'var(--gold)' : 'var(--text-muted)',
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {subTab === 'settings' && <AmbassadorSettings settings={settings} onSave={loadAll} showMsg={showMsg} />}
      {subTab === 'channels' && <AmbassadorChannels channels={channels} onUpdate={loadAll} showMsg={showMsg} />}
      {subTab === 'posts' && <AmbassadorPosts posts={posts} channels={channels} onUpdate={loadAll} showMsg={showMsg} />}
    </div>
  );
}

function AmbassadorSettings({ settings, onSave, showMsg }) {
  const [vis, setVis] = useState(settings?.visibility ?? 0);
  const [commission, setCommission] = useState(settings?.commission_pct ?? 25);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/ambassador/admin/settings', { visibility: vis, commission_pct: commission });
      showMsg('✅ Настройки сохранены');
      onSave();
    } catch (e) { showMsg('❌ Ошибка'); }
    setSaving(false);
  };

  const visOptions = [
    { val: 0, icon: '🔒', label: 'Скрыт', desc: 'Никто не видит раздел', color: 'var(--red)' },
    { val: 1, icon: '🌍', label: 'Все видят', desc: 'Все пользователи видят раздел', color: 'var(--green)' },
    { val: 2, icon: '🛡️', label: 'Только админ', desc: 'Только админы видят раздел', color: 'var(--orange)' },
  ];

  return (
    <div>
      {/* Stats */}
      {settings?.stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { icon: '📢', label: 'Каналов', val: settings.stats.total_channels, color: 'var(--gold)' },
            { icon: '✅', label: 'Одобрено', val: settings.stats.approved_channels, color: 'var(--green)' },
            { icon: '⏳', label: 'Ожидают', val: settings.stats.pending_channels, color: 'var(--orange)' },
            { icon: '📝', label: 'Постов', val: settings.stats.total_posts, color: 'var(--gold-light)' },
          ].map((c, i) => (
            <div key={c.label} className="card" style={{ padding: 14, animation: `fadeIn 0.3s ease ${i * 0.05}s both` }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{c.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: c.color }}>{c.val}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Commission */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
        💰 КОМИССИЯ АМБАССАДОРА
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
          Амбассадоры получают повышенный % от покупок своих рефералов (вместо стандартной реферальной комиссии)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="number" min="0" max="100" step="1"
            value={commission}
            onChange={e => setCommission(parseFloat(e.target.value) || 0)}
            style={{ width: 80, textAlign: 'center', fontSize: 18, fontWeight: 800, padding: '10px 12px' }}
          />
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)' }}>%</span>
          <div style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
            Стандартная: {settings?.standard_commission_pct ?? '...'}%<br/>Амбассадор: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{commission}%</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
        👁 ВИДИМОСТЬ РАЗДЕЛА
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {visOptions.map(o => (
          <button key={o.val} onClick={() => setVis(o.val)} className="card" style={{
            padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
            border: vis === o.val ? `1px solid ${o.color}` : '1px solid var(--border)',
            background: vis === o.val ? `${o.color}11` : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{o.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: vis === o.val ? o.color : 'var(--text)' }}>{o.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.desc}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
      <button className="btn-gold" onClick={save} disabled={saving} style={{ padding: 12, fontSize: 13 }}>
        {saving ? '⏳ Сохраняю...' : '💾 Сохранить настройки'}
      </button>
    </div>
  );
}

function AmbassadorChannels({ channels, onUpdate, showMsg }) {
  const [processing, setProcessing] = useState(null);

  const approve = async (id) => {
    setProcessing(id);
    try { await api.post(`/ambassador/admin/channels/${id}/approve`); showMsg('✅ Канал одобрен'); onUpdate(); }
    catch { showMsg('❌ Ошибка'); }
    setProcessing(null);
  };
  const reject = async (id) => {
    setProcessing(id);
    try { await api.post(`/ambassador/admin/channels/${id}/reject`); showMsg('✅ Канал отклонён'); onUpdate(); }
    catch { showMsg('❌ Ошибка'); }
    setProcessing(null);
  };
  const del = async (id) => {
    setProcessing(id);
    try { await api.delete(`/ambassador/admin/channels/${id}`); showMsg('🗑 Удалён'); onUpdate(); }
    catch { showMsg('❌ Ошибка'); }
    setProcessing(null);
  };

  const statusColors = { pending: 'var(--orange)', approved: 'var(--green)', rejected: 'var(--red)' };
  const statusLabels = { pending: '⏳ Ожидает', approved: '✅ Одобрен', rejected: '❌ Отклонён' };

  if (!channels.length) return (
    <div className="card" style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Заявок пока нет</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {channels.map((ch, i) => (
        <div key={ch.id} className="card" style={{
          padding: 14, animation: `fadeIn 0.3s ease ${i * 0.04}s both`,
          border: ch.status === 'pending' ? '1px solid rgba(251,191,36,0.3)' : undefined,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>📢</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{ch.channel_title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                @{ch.channel_username} • 👥 {ch.subscribers_count}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                От: {ch.first_name || ch.username || `TG:${ch.tg_id}`}
              </div>
            </div>
            <span style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 6, fontWeight: 700,
              background: `${statusColors[ch.status]}22`, color: statusColors[ch.status],
            }}>{statusLabels[ch.status]}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ch.status === 'pending' && (
              <>
                <button onClick={() => approve(ch.id)} disabled={processing === ch.id} style={{
                  flex: 1, padding: 8, borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                  background: 'rgba(52,211,153,0.15)', color: 'var(--green)',
                }}>✅ Одобрить</button>
                <button onClick={() => reject(ch.id)} disabled={processing === ch.id} style={{
                  flex: 1, padding: 8, borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                  background: 'rgba(248,113,113,0.15)', color: 'var(--red)',
                }}>❌ Отклонить</button>
              </>
            )}
            <button onClick={() => del(ch.id)} disabled={processing === ch.id} style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.2)',
              background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
            }}>🗑</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AmbassadorPosts({ posts, channels, onUpdate, showMsg }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/api$/, '');

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const create = async () => {
    if (!title && !text) return;
    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('text', text);
      if (imageFile) formData.append('image', imageFile);

      await api.post('/ambassador/admin/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showMsg('✅ Пост создан');
      setTitle(''); setText(''); setImageFile(null); setImagePreview(null);
      setShowForm(false);
      onUpdate();
    } catch (e) { showMsg('❌ Ошибка создания'); }
    setCreating(false);
  };

  const deletePost = async (id) => {
    try { await api.delete(`/ambassador/admin/posts/${id}`); showMsg('🗑 Пост удалён'); onUpdate(); }
    catch { showMsg('❌ Ошибка'); }
  };

  const publish = async (id) => {
    setPublishing(id);
    setPublishResult(null);
    try {
      const { data } = await api.post(`/ambassador/admin/posts/${id}/publish`);
      setPublishResult(data);
      showMsg(`✅ Опубликовано: ${data.sent}/${data.total}`);
      onUpdate();
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.error || 'Ошибка публикации'));
    }
    setPublishing(null);
  };

  const approvedCount = channels.filter(c => c.status === 'approved').length;

  return (
    <div>
      <div className="card" style={{ padding: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>📢</span>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Одобренных каналов: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{approvedCount}</span>
        </div>
      </div>

      <button onClick={() => setShowForm(!showForm)} className="btn-gold" style={{ marginBottom: 14, padding: 10, fontSize: 13 }}>
        {showForm ? '✕ Отмена' : '+ Новый пост'}
      </button>

      {showForm && (
        <div className="card" style={{ marginBottom: 14, animation: 'fadeIn 0.3s ease' }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, marginBottom: 10, letterSpacing: 1 }}>
            📝 НОВЫЙ ПОСТ
          </div>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Заголовок" style={{ marginBottom: 8, fontSize: 13 }} />
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder="Текст поста (поддерживается HTML)"
            style={{
              width: '100%', minHeight: 100, padding: 12, borderRadius: 12,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
              resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 8,
            }} />

          <div style={{ marginBottom: 10 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              borderRadius: 10, border: '1px dashed var(--border)', cursor: 'pointer',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <span style={{ fontSize: 20 }}>📷</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {imageFile ? imageFile.name : 'Загрузить картинку'}
              </span>
              <input type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
            </label>
          </div>

          {imagePreview && (
            <div style={{ marginBottom: 10, position: 'relative' }}>
              <img src={imagePreview} alt="preview" style={{
                width: '100%', borderRadius: 10, maxHeight: 200, objectFit: 'cover',
              }} />
              <button onClick={() => { setImageFile(null); setImagePreview(null); }} style={{
                position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
                border: 'none', borderRadius: '50%', width: 24, height: 24,
                color: '#fff', fontSize: 12, cursor: 'pointer',
              }}>✕</button>
            </div>
          )}

          {/* Live Preview */}
          {(title || text || imagePreview) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
                👁 ПРЕДПРОСМОТР
              </div>
              <div style={{
                padding: 14, borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(212,175,55,0.05), rgba(0,0,0,0.2))',
                border: '1px solid rgba(212,175,55,0.15)',
              }}>
                {imagePreview && (
                  <img src={imagePreview} alt="" style={{
                    width: '100%', borderRadius: 8, maxHeight: 180, objectFit: 'cover', marginBottom: 10,
                  }} />
                )}
                {title && <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{title}</div>}
                {text && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{ __html: text }} />
                )}
              </div>
            </div>
          )}

          <button className="btn-gold" onClick={create} disabled={creating || (!title && !text)}
            style={{ padding: 10, fontSize: 13 }}>
            {creating ? '⏳ Создаю...' : '💾 Создать пост'}
          </button>
        </div>
      )}

      {/* Publish result */}
      {publishResult && (
        <div className="card" style={{
          marginBottom: 14, padding: 14, animation: 'fadeIn 0.3s ease',
          border: publishResult.failed ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(52,211,153,0.3)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>📊 Результат публикации</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <MiniStat label="Всего" val={publishResult.total} color="var(--text)" />
            <MiniStat label="Отправлено" val={publishResult.sent} color="var(--green)" />
            <MiniStat label="Ошибки" val={publishResult.failed} color="var(--red)" />
          </div>
          {publishResult.errors?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
              {publishResult.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Posts list */}
      {posts.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📝</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Постов пока нет</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {posts.map((p, i) => (
          <div key={p.id} className="card" style={{
            padding: 14, animation: `fadeIn 0.3s ease ${i * 0.04}s both`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{p.title}</div>
              <button onClick={() => setPreviewId(previewId === p.id ? null : p.id)} style={{
                padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(212,175,55,0.2)',
                background: previewId === p.id ? 'rgba(212,175,55,0.1)' : 'transparent',
                color: 'var(--gold)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
              }}>
                {previewId === p.id ? '✕ Закрыть' : '👁 Просмотр'}
              </button>
            </div>

            {/* Expanded preview */}
            {previewId === p.id && (
              <div style={{
                padding: 14, borderRadius: 12, marginBottom: 10,
                background: 'linear-gradient(135deg, rgba(212,175,55,0.05), rgba(0,0,0,0.2))',
                border: '1px solid rgba(212,175,55,0.15)',
                animation: 'fadeIn 0.3s ease',
              }}>
                <div style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
                  👁 ПРЕДПРОСМОТР (как в Telegram)
                </div>
                {p.image_path && (
                  <img src={`${apiBase}${p.image_path}`} alt="" style={{
                    width: '100%', borderRadius: 8, maxHeight: 250, objectFit: 'cover', marginBottom: 10,
                  }} />
                )}
                {p.title && <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{p.title}</div>}
                {p.text && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{ __html: p.text }} />
                )}
              </div>
            )}

            {/* Collapsed text preview */}
            {previewId !== p.id && p.text && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4,
                maxHeight: 40, overflow: 'hidden',
              }}>{p.text}</div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 6, fontWeight: 700,
                background: p.status === 'published' ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                color: p.status === 'published' ? 'var(--green)' : 'var(--orange)',
              }}>{p.status === 'published' ? '✅ Опубликован' : '📝 Черновик'}</span>
              {p.published_at && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {new Date(p.published_at).toLocaleString()}
                </span>
              )}
              {p.image_path && previewId !== p.id && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>📷 С картинкой</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => publish(p.id)} disabled={publishing === p.id || approvedCount === 0}
                style={{
                  flex: 1, padding: 8, borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', color: '#000',
                  opacity: approvedCount === 0 ? 0.4 : 1,
                }}>
                {publishing === p.id ? '⏳ Публикация...' : `📤 Опубликовать (${approvedCount} каналов)`}
              </button>
              <button onClick={() => deletePost(p.id)} style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.2)',
                background: 'transparent', color: 'var(--red)', fontSize: 11, cursor: 'pointer',
              }}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════ HELPERS ═══════════════════
function MiniStat({ label, val, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: color || 'var(--text)' }}>{val}</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function PagBtn({ children, ...props }) {
  return (
    <button {...props} style={{
      padding: '8px 18px', borderRadius: 10, border: 'none',
      background: props.disabled ? 'rgba(255,255,255,0.03)' : 'var(--bg-card)',
      color: props.disabled ? 'var(--text-muted)' : 'var(--text)',
      fontWeight: 600, fontSize: 12, cursor: props.disabled ? 'default' : 'pointer',
      opacity: props.disabled ? 0.4 : 1
    }}>{children}</button>
  );
}

// ═══════════════════ PROMO CODES ═══════════════════
function PromoCodesPanel() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [discountPct, setDiscountPct] = useState(10);
  const [maxUses, setMaxUses] = useState(0);
  const [expiresAt, setExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try { const { data } = await api.get('/admin/promo-codes'); setPromos(data); }
    catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  const create = async () => {
    if (!code.trim()) return;
    setCreating(true);
    try {
      await api.post('/admin/promo-codes', { code: code.trim(), discount_pct: discountPct, max_uses: maxUses, expires_at: expiresAt || null });
      showMsg('✅ Промокод создан');
      setCode(''); setDiscountPct(10); setMaxUses(0); setExpiresAt(''); setShowForm(false); load();
    } catch (e) { showMsg(`❌ ${e.response?.data?.error || 'Ошибка'}`); }
    setCreating(false);
  };
  const toggle = async (id) => { try { await api.post(`/admin/promo-codes/${id}/toggle`); load(); } catch (e) { showMsg('❌ Ошибка'); } };
  const remove = async (id) => { try { await api.delete(`/admin/promo-codes/${id}`); showMsg('🗑 Удалён'); load(); } catch (e) { showMsg('❌ Ошибка'); } };

  if (loading) return <Loading />;

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>🎟️ Промокоды</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Скидки на покупки в магазине</div>

      {msg && (<div style={{ padding: 10, borderRadius: 10, marginBottom: 12, fontSize: 12, fontWeight: 600,
        background: msg.includes('✅') ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
        color: msg.includes('✅') ? 'var(--green)' : 'var(--red)',
      }}>{msg}</div>)}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { icon: '🎟️', label: 'Всего', val: promos.length, color: 'var(--gold)' },
          { icon: '✅', label: 'Активных', val: promos.filter(p => p.is_active).length, color: 'var(--green)' },
          { icon: '🔢', label: 'Исп-но', val: promos.reduce((a, p) => a + p.used_count, 0), color: 'var(--gold-light)' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 14, marginBottom: 2 }}>{c.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: c.color }}>{c.val}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      <button onClick={() => setShowForm(!showForm)} className="btn-gold" style={{ marginBottom: 14, padding: 10, fontSize: 13, width: '100%' }}>
        {showForm ? '✕ Отмена' : '+ Новый промокод'}
      </button>

      {showForm && (
        <div className="card" style={{ marginBottom: 14, animation: 'fadeIn 0.3s ease' }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, marginBottom: 12, letterSpacing: 1 }}>🎟️ НОВЫЙ ПРОМОКОД</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="Код (например: WELCOME20)" style={{ flex: 1, fontSize: 14, fontWeight: 700, letterSpacing: 2 }} />
            <button onClick={() => {
              const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
              let r = '';
              for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
              setCode(r);
            }} style={{
              padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(212,175,55,0.2)',
              background: 'rgba(212,175,55,0.08)', color: 'var(--gold)',
              fontSize: 16, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap',
            }} title="Сгенерировать случайный код">🎲</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Скидка (%)</div>
              <input type="number" min="1" max="100" value={discountPct} onChange={e => setDiscountPct(parseInt(e.target.value) || 0)} style={{ fontSize: 16, fontWeight: 800, textAlign: 'center' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Макс. исп. (0=∞)</div>
              <input type="number" min="0" value={maxUses} onChange={e => setMaxUses(parseInt(e.target.value) || 0)} style={{ fontSize: 16, fontWeight: 800, textAlign: 'center' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Срок действия (необязательно)</div>
            <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={{ fontSize: 12 }} />
          </div>
          {code && (
            <div style={{ padding: 10, borderRadius: 10, marginBottom: 12, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
              <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginBottom: 4 }}>ПРЕДПРОСМОТР</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{code} — <span style={{ color: 'var(--green)' }}>-{discountPct}%</span>
                {maxUses > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> (макс. {maxUses} исп.)</span>}
              </div>
            </div>
          )}
          <button className="btn-gold" onClick={create} disabled={creating || !code.trim() || discountPct <= 0} style={{ padding: 10, fontSize: 13 }}>
            {creating ? '⏳ Создаю...' : '💾 Создать промокод'}
          </button>
        </div>
      )}

      {promos.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🎟️</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Промокодов пока нет</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {promos.map((p, i) => {
          const expired = p.expires_at && new Date(p.expires_at) < new Date();
          const exhausted = p.max_uses > 0 && p.used_count >= p.max_uses;
          return (
            <div key={p.id} className="card" style={{ padding: 14, animation: `fadeIn 0.3s ease ${i * 0.04}s both`, opacity: (!p.is_active || expired || exhausted) ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 2, color: 'var(--gold)' }}>{p.code}</div>
                <div style={{ fontSize: 16, fontWeight: 800, background: 'linear-gradient(135deg, #22c55e, #16a34a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>-{p.discount_pct}%</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, fontWeight: 700,
                  background: p.is_active && !expired && !exhausted ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                  color: p.is_active && !expired && !exhausted ? 'var(--green)' : 'var(--red)',
                }}>{!p.is_active ? '⏸ Неактивен' : expired ? '⏰ Истёк' : exhausted ? '🔢 Лимит' : '✅ Активен'}</span>
                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: 'rgba(212,175,55,0.1)', color: 'var(--gold)', fontWeight: 600 }}>
                  Исп: {p.used_count}{p.max_uses > 0 ? `/${p.max_uses}` : '/∞'}
                </span>
                {p.expires_at && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>до {new Date(p.expires_at).toLocaleDateString()}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => toggle(p.id)} style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                  background: p.is_active ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.1)', color: p.is_active ? 'var(--orange)' : 'var(--green)' }}>
                  {p.is_active ? '⏸ Выключить' : '▶ Включить'}
                </button>
                <button onClick={() => remove(p.id)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.2)', background: 'transparent', color: 'var(--red)', fontSize: 11, cursor: 'pointer' }}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Btn({ children, ...props }) {
  return (
    <button {...props} style={{
      padding: '8px 18px', borderRadius: 10, border: 'none',
      background: props.disabled ? 'rgba(255,255,255,0.03)' : 'var(--bg-card)',
      color: props.disabled ? 'var(--text-muted)' : 'var(--text)',
      fontWeight: 600, fontSize: 12, cursor: props.disabled ? 'default' : 'pointer',
      opacity: props.disabled ? 0.4 : 1
    }}>{children}</button>
  );
}

function Loading() {
  return <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Загрузка...</div>;
}

