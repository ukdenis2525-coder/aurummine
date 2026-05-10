import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';
import { fmt, fmtK } from '../../utils/format.js';

const TABS = [
  { id: 'dashboard', icon: '📊', label: 'Обзор' },
  { id: 'users', icon: '👥', label: 'Юзеры' },
  { id: 'withdrawals', icon: '💸', label: 'Выводы' },
  { id: 'tasks', icon: '📋', label: 'Задания' },
  { id: 'orders', icon: '🛒', label: 'Заказы' },
  { id: 'packages', icon: '📦', label: 'Пакеты' },
  { id: 'ads', icon: '🎬', label: 'Реклама' },
  { id: 'referrals', icon: '🤝', label: 'Рефералы' },
];

export default function AdminPage() {
  const { setTab: setAppTab } = useStore();
  const [tab, setTab] = useState('dashboard');

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

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto',
        padding: '4px', background: 'var(--bg-card)', borderRadius: 14
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 12px', borderRadius: 10, border: 'none',
            background: tab === t.id ? 'var(--gold)' : 'transparent',
            color: tab === t.id ? '#000' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'var(--transition)', flexShrink: 0
          }}>
            {t.icon} {t.label}
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
    </div>
  );
}

// ═══════════════════ DASHBOARD ═══════════════════
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);

  useEffect(() => { api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {}); }, []);

  if (!stats) return <Loading />;

  const cards = [
    { icon: '👥', label: 'Пользователи', val: stats.total_users, color: 'var(--gold)' },
    { icon: '🆕', label: 'За 24ч', val: stats.new_users_24h, color: 'var(--green)' },
    { icon: '⚡', label: 'Power (всего)', val: fmtK(stats.total_power), color: 'var(--gold-light)' },
    { icon: '💰', label: 'TON баланс', val: fmt(stats.total_ton_balance, 2), color: 'var(--orange)' },
    { icon: '🛒', label: 'Покупок', val: stats.total_purchases, color: 'var(--green)' },
    { icon: '💵', label: 'Выручка', val: `${fmt(stats.total_revenue, 2)} TON`, color: 'var(--gold)' },
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {cards.map((c, i) => (
          <div key={c.label} className="card" style={{
            padding: 16, animation: `fadeIn 0.3s ease ${i * 0.05}s both`,
            gridColumn: i === cards.length - 1 && cards.length % 2 !== 0 ? 'span 2' : undefined
          }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: c.color }}>{c.val}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>

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

  const load = async () => {
    const { data } = await api.get(`/admin/withdrawals?status=${filter}`);
    setItems(data);
  };
  useEffect(() => { load(); }, [filter]);

  const approve = async (id) => {
    setLoading(true);
    await api.post(`/admin/withdrawals/${id}/approve`, { tx_hash: 'manual_' + Date.now() });
    load();
    setLoading(false);
  };

  const reject = async (id) => {
    setLoading(true);
    await api.post(`/admin/withdrawals/${id}/reject`);
    load();
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
    const { data } = await api.get('/admin/tasks');
    setTasks(data);
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

  const load = async () => { const { data } = await api.get('/admin/packages'); setPackages(data); };
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
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get('/admin/ad-settings').then(r => {
      // Adsgram defaults
      const adsgramDefaults = [
        { key: 'ad_reward_power', value: '500', label: 'Power за просмотр (Adsgram)' },
        { key: 'ad_cooldown_seconds', value: '60', label: 'Кулдаун между рекламами (сек)' },
        { key: 'ad_daily_limit', value: '50', label: 'Лимит просмотров в день' },
      ];
      // Monetag defaults
      const monetagDefaults = [
        { key: 'monetag_reward_power', value: '5', label: 'Power за просмотр (Monetag)' },
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

      setSettings(mergedAdsgram);
      setMonetagSettings(mergedMonetag);
    });
  }, []);

  const updateVal = (key, value) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
    setMonetagSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  const save = async () => {
    setSaving(true);
    try {
      const allSettings = [...settings, ...monetagSettings];
      await api.put('/admin/ad-settings', { settings: allSettings });
      setMsg('✅ Настройки рекламы сохранены');
    } catch (e) {
      setMsg('❌ Ошибка сохранения');
    }
    setSaving(false);
    setTimeout(() => setMsg(null), 2500);
  };

  const adsgramFieldMeta = {
    ad_reward_power: { icon: '⚡', unit: 'POWER', desc: 'Сколько Power юзер получает за один просмотр Adsgram' },
    ad_cooldown_seconds: { icon: '⏱️', unit: 'сек', desc: 'Минимальное время между просмотрами (общее)' },
    ad_daily_limit: { icon: '📊', unit: 'раз', desc: 'Макс. просмотров рекламы в день (общее)' },
  };

  const monetagFieldMeta = {
    monetag_reward_power: { icon: '💎', unit: 'POWER', desc: 'Сколько Power юзер получает за один просмотр Monetag' },
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
          type="number"
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

      <button className="btn-gold" onClick={save} disabled={saving}
        style={{ padding: 14, fontSize: 14 }}>
        {saving ? '⏳ Сохраняю...' : '💾 Сохранить все настройки'}
      </button>

      <div className="card" style={{ marginTop: 16, padding: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
          📡 ПОДКЛЮЧЁННЫЕ ПРОВАЙДЕРЫ
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { name: 'Adsgram Reward', id: '29776', status: 'Watch & Earn' },
            { name: 'Adsgram Task', id: 'task-29788', status: 'Sponsored Tasks' },
            { name: 'Monetag', id: '10984603', status: 'Watch & Earn' },
            { name: 'Publishers/RichAds', id: '7369', status: 'Авто (Push/Video)' },
          ].map(p => (
            <div key={p.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 10
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.id}</div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>{p.status}</div>
            </div>
          ))}
        </div>
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

function Loading() {
  return <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Загрузка...</div>;
}
