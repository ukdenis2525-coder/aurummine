import React, { useEffect } from 'react';
import { useStore } from './store/index.js';
import BottomNav from './components/layout/BottomNav.jsx';
import PowerPage from './components/pages/PowerPage.jsx';
import ShopPage from './components/pages/ShopPage.jsx';
import RatingPage from './components/pages/RatingPage.jsx';
import TeamPage from './components/pages/TeamPage.jsx';
import TasksPage from './components/pages/TasksPage.jsx';
import Loader from './components/ui/Loader.jsx';

export default function App() {
  const { init, loading, activeTab } = useStore();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#0F0F0F');
      tg.setBackgroundColor('#0F0F0F');
    }
    init();
  }, []);

  if (loading) return <Loader />;

  return (
    <div style={{ minHeight: '100vh', background: '#0F0F0F' }}>
      {activeTab === 'power' && <PowerPage />}
      {activeTab === 'shop' && <ShopPage />}
      {activeTab === 'rating' && <RatingPage />}
      {activeTab === 'team' && <TeamPage />}
      {activeTab === 'tasks' && <TasksPage />}
      <BottomNav />
    </div>
  );
}
