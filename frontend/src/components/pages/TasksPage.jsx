import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { useStore } from '../../store/index.js';

const fmtK = (n) => n >= 1000 ? `${(n/1000).toFixed(0)}K` : n;

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const { refreshUser } = useStore();

  useEffect(() => {
    api.get('/tasks').then(r => setTasks(r.data));
  }, []);

  const complete = async (task) => {
    if (task.completed) return;
    if (task.link) window.Telegram?.WebApp?.openLink(task.link);
    try {
      await api.post(`/tasks/${task.id}/complete`);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: true } : t));
      await refreshUser();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#D4AF37' }}>📋 Задания</div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Выполняй и получай бесплатный POWER</div>
      </div>

      {tasks.length === 0 && (
        <div style={{ textAlign: 'center', color: '#444', marginTop: 40, fontSize: 14 }}>
          Задания скоро появятся
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map(task => (
          <div key={task.id} className="card" style={{
            display: 'flex', alignItems: 'center', gap: 14,
            opacity: task.completed ? 0.6 : 1,
            border: task.completed ? '1px solid #2a2a2a' : '1px solid #3a3000'
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: task.completed ? '#2a2a2a' : 'linear-gradient(135deg, #1a1400, #3a3000)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
            }}>
              {task.type === 'subscribe_channel' ? '📢' :
               task.type === 'invite_friends' ? '👥' :
               task.type === 'daily' ? '📅' : '⚡'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{task.title}</div>
              {task.description && (
                <div style={{ fontSize: 12, color: '#666' }}>{task.description}</div>
              )}
              <div style={{ fontSize: 12, color: '#D4AF37', fontWeight: 700, marginTop: 4 }}>
                +{fmtK(task.reward_power)} POWER
              </div>
            </div>
            <button
              onClick={() => complete(task)}
              style={{
                padding: '8px 14px', borderRadius: 10,
                background: task.completed
                  ? '#2a2a2a'
                  : 'linear-gradient(135deg, #B8860B, #D4AF37)',
                color: task.completed ? '#555' : '#000',
                fontWeight: 700, fontSize: 12, border: 'none', cursor: task.completed ? 'default' : 'pointer'
              }}
            >
              {task.completed ? '✓' : 'Выполнить'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
