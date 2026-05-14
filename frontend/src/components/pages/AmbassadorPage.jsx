import React, { useState, useEffect } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';
import { useTranslation } from 'react-i18next';

export default function AmbassadorPage() {
  const { setTab } = useStore();
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState('list'); // 'list' | 'partner'
  const [channels, setChannels] = useState([]);
  const [ambassadors, setAmbassadors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [ambSettings, setAmbSettings] = useState({ min_subscribers: 1000, commission_pct: 25 });

  const load = async () => {
    try {
      const [chRes, visRes, listRes] = await Promise.all([
        api.get('/ambassador/my-channels'),
        api.get('/ambassador/visibility'),
        api.get('/ambassador/list'),
      ]);
      setChannels(chRes.data);
      setAmbSettings(prev => ({ ...prev, ...visRes.data }));
      setAmbassadors(listRes.data);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const apply = async () => {
    if (!channelInput.trim()) return;
    setApplying(true);
    setError(null);
    try {
      await api.post('/ambassador/apply', { channel_username: channelInput.trim() });
      setMsg(t('ambassador.apply_success', '✅ Заявка отправлена! Ожидайте одобрения.'));
      setChannelInput('');
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.response?.data?.error || t('ambassador.apply_error', 'Ошибка отправки заявки'));
    }
    setApplying(false);
    if (msg) setTimeout(() => setMsg(null), 4000);
  };

  const cancelPartnership = async () => {
    if (!confirm(t('ambassador.cancel_confirm', 'Вы уверены, что хотите отказаться от партнёрства?'))) return;
    setCancelling(true);
    try {
      await api.post('/ambassador/cancel');
      setMsg('✅ Партнёрство отменено');
      load();
    } catch (e) {
      setMsg('❌ Ошибка');
    }
    setCancelling(false);
    setTimeout(() => setMsg(null), 4000);
  };

  const statusColors = {
    pending: 'var(--orange)',
    approved: 'var(--green)',
    rejected: 'var(--red)',
  };
  const statusLabels = {
    pending: t('ambassador.status_pending', '⏳ На рассмотрении'),
    approved: t('ambassador.status_approved', '✅ Одобрен'),
    rejected: t('ambassador.status_rejected', '❌ Отклонён'),
  };

  const minSubs = ambSettings.min_subscribers || 1000;
  const commPct = ambSettings.commission_pct || 25;
  const hasActiveChannel = channels.some(ch => ch.status === 'approved' || ch.status === 'pending');

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => setTab('power')} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          color: '#fff', padding: '10px 14px', fontSize: 16, cursor: 'pointer'
        }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)' }}>
            🤝 {t('ambassador.title', 'Амбассадор')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('ambassador.subtitle', 'Партнёрская программа для каналов')}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'list', label: '📢 Амбассадоры', icon: '' },
          { id: 'partner', label: '🤝 Стать партнёром', icon: '' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
            flex: 1, padding: '10px 8px', borderRadius: 12, border: 'none',
            background: subTab === tab.id
              ? 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))'
              : 'var(--bg-card)',
            color: subTab === tab.id ? 'var(--gold)' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
            borderBottom: subTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
            transition: 'all 0.2s ease',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Messages */}
      {msg && (
        <div style={{
          padding: '12px 16px', borderRadius: 12, marginBottom: 14,
          background: msg.includes('❌') ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)',
          color: msg.includes('❌') ? 'var(--red)' : 'var(--green)',
          fontSize: 13, fontWeight: 600, textAlign: 'center',
          animation: 'fadeIn 0.3s ease',
        }}>{msg}</div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          {t('common.loading', 'Загрузка...')}
        </div>
      )}

      {/* ═══════════ TAB: LIST OF AMBASSADORS ═══════════ */}
      {!loading && subTab === 'list' && (
        <div>
          {ambassadors.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 30 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📢</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Амбассадоров пока нет</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Стань первым партнёром!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ambassadors.map((amb, i) => (
                <div key={i} className="card" style={{
                  padding: '14px 16px',
                  animation: `fadeIn 0.3s ease ${i * 0.05}s both`,
                  border: '1px solid rgba(52,211,153,0.15)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(59,130,246,0.1))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    }}>📢</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {amb.channel_title || amb.channel_username}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          @{amb.channel_username}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                          👥 {(amb.subscribers_count || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Hint — promo is in the channel */}
                  {amb.promo_code && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 10,
                      background: 'rgba(212,175,55,0.06)',
                      border: '1px dashed rgba(212,175,55,0.2)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>🎟</span>
                      <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>
                        Промокод на скидку <span style={{ fontWeight: 900 }}>-{amb.discount_pct}%</span> в канале 👇
                      </div>
                    </div>
                  )}
                  {/* Link to channel */}
                  <a
                    href={`https://t.me/${amb.channel_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block', marginTop: 8, padding: '8px 0', borderRadius: 8,
                      background: 'rgba(59,130,246,0.08)', border: 'none',
                      color: '#3b82f6', fontWeight: 700, fontSize: 11,
                      textAlign: 'center', textDecoration: 'none',
                    }}
                  >
                    📱 Открыть канал
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB: BECOME PARTNER ═══════════ */}
      {!loading && subTab === 'partner' && (
        <div>
          {/* Benefits */}
          <div className="card" style={{
            padding: 18, marginBottom: 16,
            background: 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(212,175,55,0.04))',
            border: '1px solid rgba(52,211,153,0.2)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)', marginBottom: 12 }}>
              🎁 {t('ambassador.benefits_title', 'Что вы получаете?')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: '💰', text: t('ambassador.benefit_commission', { pct: commPct }) },
                { icon: '📢', text: t('ambassador.benefit_posts', 'Рекламные посты от наших партнёров в ваш канал') },
                { icon: '🔗', text: t('ambassador.benefit_ref', 'Персональная реферальная ссылка с автоматическим учётом') },
                { icon: '📊', text: t('ambassador.benefit_stats', 'Статистика рефералов и заработка в реальном времени') },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(52,211,153,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}>{s.icon}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: 6 }}>
                    {s.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="card" style={{
            padding: 18, marginBottom: 16,
            background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.02))',
            border: '1px solid rgba(212,175,55,0.2)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)', marginBottom: 10 }}>
              ✨ {t('ambassador.how_title', 'Как это работает?')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: '📢', text: t('ambassador.step1', { min: minSubs.toLocaleString() }) },
                { icon: '🤖', text: t('ambassador.step2', 'Добавьте бота @AurumMiBot в админы канала') },
                { icon: '✍️', text: t('ambassador.step3', 'Дайте боту разрешение на публикации') },
                { icon: '📝', text: t('ambassador.step4', 'Подайте заявку — мы проверим и одобрим') },
                { icon: '💰', text: t('ambassador.step5', { pct: commPct }) },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(212,175,55,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}>{s.icon}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: 6 }}>
                    {s.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="card" style={{
            padding: 14, marginBottom: 16,
            background: 'rgba(248,113,113,0.06)',
            border: '1px solid rgba(248,113,113,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <span style={{ color: 'var(--red)', fontWeight: 700 }}>
                  {t('ambassador.warning_title', 'Важно!')}
                </span>{' '}
                {t('ambassador.warning_text', 'Если бот будет удалён из администраторов вашего канала, партнёрство будет автоматически разорвано. Проверка проводится каждые 24 часа.')}
              </div>
            </div>
          </div>

          {/* Apply button */}
          {!hasActiveChannel && (
            <>
              <button onClick={() => setShowForm(!showForm)} style={{
                width: '100%', padding: 14, borderRadius: 14, border: 'none',
                background: showForm
                  ? 'rgba(248,113,113,0.1)'
                  : 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                color: showForm ? 'var(--red)' : '#000',
                fontWeight: 800, fontSize: 14, cursor: 'pointer',
                marginBottom: showForm ? 0 : 16,
                transition: 'all 0.2s ease',
              }}>
                {showForm ? '✕ ' + t('ambassador.cancel', 'Отмена') : '+ ' + t('ambassador.apply_btn', 'Подать заявку')}
              </button>

              {showForm && (
                <div className="card" style={{ marginTop: 12, marginBottom: 16, padding: 16, animation: 'fadeIn 0.3s ease' }}>
                  <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, marginBottom: 10, letterSpacing: 1 }}>
                    📢 {t('ambassador.apply_title', 'ЗАЯВКА НА ПАРТНЁРСТВО')}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                    {t('ambassador.apply_hint', { min: minSubs.toLocaleString() })}
                  </div>
                  <input
                    type="text"
                    value={channelInput}
                    onChange={e => setChannelInput(e.target.value)}
                    placeholder={t('ambassador.channel_placeholder', '@channel или t.me/channel')}
                    style={{ marginBottom: 10, fontSize: 14 }}
                  />
                  {error && (
                    <div style={{
                      padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                      background: 'var(--red-bg)', color: 'var(--red)',
                      fontSize: 12, fontWeight: 600, lineHeight: 1.4,
                    }}>{error}</div>
                  )}
                  <button
                    onClick={apply}
                    disabled={applying || !channelInput.trim()}
                    style={{
                      width: '100%', padding: 12, borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                      color: '#000', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                      opacity: applying || !channelInput.trim() ? 0.5 : 1,
                    }}
                  >
                    {applying ? '⏳ ' + t('ambassador.applying', 'Отправка...') : '🚀 ' + t('ambassador.submit', 'Отправить заявку')}
                  </button>
                </div>
              )}
            </>
          )}

          {/* My channels */}
          {channels.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
                📋 {t('ambassador.my_channels', 'МОИ КАНАЛЫ')} ({channels.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {channels.map((ch, i) => (
                  <div key={ch.id} className="card" style={{
                    padding: '14px 16px',
                    animation: `fadeIn 0.3s ease ${i * 0.05}s both`,
                    border: ch.status === 'approved'
                      ? '1px solid rgba(52,211,153,0.3)'
                      : ch.status === 'rejected'
                      ? '1px solid rgba(248,113,113,0.3)'
                      : '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                          background: ch.status === 'approved'
                            ? 'rgba(52,211,153,0.12)'
                            : ch.status === 'rejected'
                            ? 'rgba(248,113,113,0.12)'
                            : 'rgba(251,191,36,0.12)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 18,
                        }}>📢</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ch.channel_title || ch.channel_username}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            @{ch.channel_username}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          fontSize: 10, padding: '3px 8px', borderRadius: 6, fontWeight: 700,
                          background: `${statusColors[ch.status]}22`,
                          color: statusColors[ch.status],
                        }}>
                          {statusLabels[ch.status] || ch.status}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                          👥 {ch.subscribers_count?.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Cancel partnership button */}
              {hasActiveChannel && (
                <button onClick={cancelPartnership} disabled={cancelling} style={{
                  width: '100%', marginTop: 14, padding: 12, borderRadius: 12,
                  border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)',
                  color: 'var(--red)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  opacity: cancelling ? 0.5 : 1,
                }}>
                  {cancelling ? '⏳ Отмена...' : '🚫 Отказаться от партнёрства'}
                </button>
              )}
            </div>
          )}

          {/* Empty state */}
          {channels.length === 0 && !showForm && (
            <div className="card" style={{ textAlign: 'center', padding: 30 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🤝</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                {t('ambassador.empty_title', 'Станьте амбассадором!')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {t('ambassador.empty_desc', { min: minSubs.toLocaleString() })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
