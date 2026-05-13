import React, { useState, useEffect } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';
import { useTranslation } from 'react-i18next';

export default function AmbassadorPage() {
  const { setTab } = useStore();
  const { t } = useTranslation();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [ambSettings, setAmbSettings] = useState({ min_subscribers: 1000, commission_pct: 25 });

  const load = async () => {
    try {
      const [chRes, visRes] = await Promise.all([
        api.get('/ambassador/my-channels'),
        api.get('/ambassador/visibility'),
      ]);
      setChannels(chRes.data);
      setAmbSettings(prev => ({ ...prev, ...visRes.data }));
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

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
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

      {/* Benefits — what you get */}
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
            { icon: '💰', text: t('ambassador.benefit_commission', `Повышенная комиссия ${commPct}% от покупок рефералов (вместо стандартной)`) },
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
            { icon: '📢', text: t('ambassador.step1', `Имейте канал/группу с ${minSubs.toLocaleString()}+ подписчиков`) },
            { icon: '🤖', text: t('ambassador.step2', 'Добавьте бота @AurumMiBot в админы канала') },
            { icon: '✍️', text: t('ambassador.step3', 'Дайте боту разрешение на публикации') },
            { icon: '📝', text: t('ambassador.step4', 'Подайте заявку — мы проверим и одобрим') },
            { icon: '💰', text: t('ambassador.step5', `Получайте ${commPct}% от покупок своих рефералов`) },
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

      {/* ⚠️ Warning — bot removal */}
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

      {/* Messages */}
      {msg && (
        <div style={{
          padding: '12px 16px', borderRadius: 12, marginBottom: 14,
          background: 'rgba(52,211,153,0.1)', color: 'var(--green)',
          fontSize: 13, fontWeight: 600, textAlign: 'center',
          animation: 'fadeIn 0.3s ease',
        }}>{msg}</div>
      )}

      {/* Apply button / form */}
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
        <div className="card" style={{
          marginTop: 12, marginBottom: 16, padding: 16,
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, marginBottom: 10, letterSpacing: 1 }}>
            📢 {t('ambassador.apply_title', 'ЗАЯВКА НА ПАРТНЁРСТВО')}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            {t('ambassador.apply_hint', `Введите юзернейм вашего канала (мин. ${minSubs.toLocaleString()} подписчиков). Бот должен быть добавлен в админы канала с правом на публикации.`)}
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

      {/* My channels */}
      {!loading && channels.length > 0 && (
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
        </div>
      )}

      {/* Empty state */}
      {!loading && channels.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🤝</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            {t('ambassador.empty_title', 'Станьте амбассадором!')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('ambassador.empty_desc', `Подайте заявку с вашим Telegram каналом (${minSubs.toLocaleString()}+ подписчиков) и станьте нашим партнёром`)}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          {t('common.loading', 'Загрузка...')}
        </div>
      )}
    </div>
  );
}
