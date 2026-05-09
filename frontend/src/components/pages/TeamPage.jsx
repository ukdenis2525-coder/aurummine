import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { fmt } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';

export default function TeamPage() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const { t } = useTranslation();

  const load = async (p = 1) => {
    const r = await api.get(`/referrals?page=${p}`);
    if (p === 1) {
      setData(r.data);
    } else {
      setData(prev => ({ ...r.data, team: [...(prev?.team || []), ...r.data.team] }));
    }
    setPage(p);
  };

  useEffect(() => { load(); }, []);

  const copyLink = () => {
    if (!data?.ref_link) return;
    navigator.clipboard.writeText(data.ref_link);
    window.Telegram?.WebApp?.showAlert(t('team.link_copied'));
  };

  const share = () => {
    if (!data?.ref_link) return;
    window.Telegram?.WebApp?.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(data.ref_link)}&text=${encodeURIComponent(t('team.share_text'))}`
    );
  };

  if (!data) return <div className="page" style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 60 }}>{t('common.loading')}</div>;

  const s = data.settings || {};
  const powerPremium = s.power_premium || 6000;
  const powerNormal = s.power_normal || 3000;
  const commissionPct = s.commission_pct || 15;

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <div className="page-title" style={{ color: 'var(--gold)' }}>{t('team.title')}</div>
        <div className="page-subtitle">{t('team.subtitle')}</div>
      </div>

      {/* Reward cards — dynamic values from admin settings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { icon: '⭐', val: `+${(powerPremium / 1000).toFixed(0)}K`, sub: 'POWER', label: t('team.premium') },
          { icon: '👤', val: `+${(powerNormal / 1000).toFixed(0)}K`, sub: 'POWER', label: t('team.normal') },
          { icon: '💰', val: `${commissionPct}%`, sub: t('team.commission'), label: t('team.from_purchases') },
        ].map((item, i) => (
          <div key={item.label} className="card" style={{
            textAlign: 'center', padding: 14,
            border: '1px solid var(--border-gold)',
            animation: `fadeIn 0.3s ease ${i * 0.1}s both`
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{item.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--gold-light)' }}>{item.val}</div>
            <div style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: 1 }}>{item.sub}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 16 }}>
        {[
          { val: data.stats.total, label: t('team.total') },
          { val: data.stats.confirmed, label: t('team.active') },
          { val: `${Math.floor(data.rewards.total_power / 1000)}K`, label: 'POWER', gold: true },
          { val: fmt(data.rewards.total_ton, 4), label: 'TON', gold: true },
        ].map(item => (
          <div key={item.label} className="stat-pill">
            <div className="value" style={{ color: item.gold ? 'var(--gold)' : 'var(--text)', fontSize: 18 }}>{item.val}</div>
            <div className="label" style={{ marginTop: 2, marginBottom: 0 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* How it works hint */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 14px', border: '1px solid rgba(212,175,55,0.15)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          💡 <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{t('team.how_it_works')}</span>{' '}
          {t('team.how_it_works_text', { power: (powerNormal / 1000).toFixed(0), pct: commissionPct })}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <button className="btn-gold" onClick={share}>{t('team.invite_friends')}</button>
        <button className="btn-outline" onClick={copyLink}>{t('team.copy_link')}</button>
      </div>

      {/* Team list */}
      {data.team.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>{t('team.your_team')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.team.map((member, i) => (
              <div key={member.id} className="card" style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                animation: `fadeIn 0.3s ease ${i * 0.05}s both`
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#000'
                }}>
                  {(member.first_name || member.username || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.first_name || member.username || 'User'}
                    {member.is_premium && <span style={{ color: 'var(--gold)', marginLeft: 6, fontSize: 12 }}>★</span>}
                  </div>
                  <div style={{ fontSize: 11, color: member.is_confirmed ? 'var(--green)' : 'var(--text-muted)' }}>
                    {member.is_confirmed ? t('team.active_status') : t('team.pending_status')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>
                    {(parseFloat(member.power) / 1000).toFixed(1)}K
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>POWER</div>
                </div>
              </div>
            ))}
          </div>

          {/* Load more */}
          {data.has_more && (
            <button onClick={() => load(page + 1)} className="btn-outline"
              style={{ marginTop: 12, padding: 10, fontSize: 12 }}>
              {t('team.load_more')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
