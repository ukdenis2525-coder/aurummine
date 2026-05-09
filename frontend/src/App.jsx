import React, { useEffect } from 'react';
import { useStore } from './store/index.js';
import BottomNav from './components/layout/BottomNav.jsx';
import PowerPage from './components/pages/PowerPage.jsx';
import ShopPage from './components/pages/ShopPage.jsx';
import RatingPage from './components/pages/RatingPage.jsx';
import TeamPage from './components/pages/TeamPage.jsx';
import TasksPage from './components/pages/TasksPage.jsx';
import WithdrawPage from './components/pages/WithdrawPage.jsx';
import AdminPage from './components/pages/AdminPage.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import Loader from './components/ui/Loader.jsx';

export default function App() {
  const { init, loading, activeTab } = useStore();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#08080C');
      tg.setBackgroundColor('#08080C');
    }
    init();
  }, []);

  if (loading) return <Loader />;

  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', background: '#08080C' }}>
        {activeTab === 'power' && <PowerPage />}
        {activeTab === 'shop' && <ShopPage />}
        {activeTab === 'rating' && <RatingPage />}
        {activeTab === 'team' && <TeamPage />}
        {activeTab === 'tasks' && <TasksPage />}
        {activeTab === 'withdraw' && <WithdrawPage />}
        {activeTab === 'admin' && <AdminPage />}
        <BottomNav />
      </div>
    </ErrorBoundary>
  );
}
