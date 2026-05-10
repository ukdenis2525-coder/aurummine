import React, { useEffect } from 'react';
import { useStore } from './store/index.js';
import { useTranslation } from 'react-i18next';
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

const ADMIN_ID = import.meta.env.VITE_ADMIN_ID;

export default function App() {
  const { init, loading, blocked, activeTab } = useStore();
  const { t } = useTranslation();

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

  // Blocked user — show dead screen (looks like maintenance, no hint about ban)
  if (blocked) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#08080C',
        padding: 24, gap: 16
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, #B8860B, #D4AF37)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, opacity: 0.4
        }}>⚡</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>
          Service temporarily unavailable
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)', textAlign: 'center' }}>
          Please try again later
        </div>
      </div>
    );
  }

  // === PC BLOCK — only mobile Telegram allowed (admin bypasses) ===
  const tg = window.Telegram?.WebApp;
  const tgPlatform = tg?.platform || '';
  const isMobileTg = ['android', 'ios', 'android_x'].includes(tgPlatform);
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const hasTgData = !!tg?.initData;
  const tgUserId = tg?.initDataUnsafe?.user?.id;
  const isAdminUser = ADMIN_ID && String(tgUserId) === String(ADMIN_ID);

  // Block if: not mobile Telegram AND not admin
  const isPcBlocked = !isAdminUser && !(isMobileTg || (isMobileUA && hasTgData));

  if (isPcBlocked) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#08080C',
        padding: 32, textAlign: 'center', gap: 16
      }}>
        <div style={{
          fontSize: 56, filter: 'drop-shadow(0 0 20px rgba(212,175,55,0.4))',
          animation: 'pulse 3s ease-in-out infinite'
        }}>📱</div>
        <div style={{
          fontSize: 16, fontWeight: 800, color: 'var(--gold)',
          letterSpacing: 1.5
        }}>
          {t('block.mobileOnly', 'MOBILE ONLY')}
        </div>
        <div style={{
          fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, maxWidth: 300
        }}>
          {t('block.mobileOnlyDesc', 'AurumMine is only available via Telegram mobile app.')}
        </div>
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 8
        }}>
          {t('block.openBot', 'Open @AurumMineBot on your phone')}
        </div>
      </div>
    );
  }

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

