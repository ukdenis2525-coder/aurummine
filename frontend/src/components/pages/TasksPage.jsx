import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';
import { fmtK } from '../../utils/format.js';
import { useTranslation } from 'react-i18next';

const typeIcons = {
  subscribe_channel: '📢',
  invite_friends: '👥',
  daily: '📅',
  default: '⚡'
};

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [completing, setCompleting] = useState(null);
  const { refreshUser } = useStore();
  const { t } = useTranslation();

  useEffect(() => { api.get('/tasks').then(r => setTasks(r.data)); }, []);

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

  const active = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <div className="page-title" style={{ color: 'var(--gold)' }}>{t('tasks.title')}</div>
        <div className="page-subtitle">{t('tasks.subtitle')}</div>
      </div>

      {tasks.length === 0 && (
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
