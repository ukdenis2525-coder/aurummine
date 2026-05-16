import { create } from 'zustand';
import api from '../utils/api.js';

const ADMIN_IDS = (import.meta.env.VITE_ADMIN_IDS || import.meta.env.VITE_ADMIN_ID || '')
  .split(',').map(s => s.trim()).filter(Boolean);

export const useStore = create((set, get) => ({
  user: null,
  mining: null,
  loading: true,
  blocked: false,
  activeTab: 'power',
  isAdmin: false,
  adminPerms: null, // '*' = full access, [] = array of tab IDs
  ambassadorVisible: false, // whether ambassador tab is shown
  appSettings: { min_withdraw_ton: 0.1, withdraw_fee_mode: 'none', withdraw_fee_fixed: 0.01, withdraw_fee_percent: 5, withdraw_fee_hybrid_threshold: 1, withdraw_processing_hours: '1-24' },

  setTab: (tab) => set({ activeTab: tab }),

  init: async () => {
    try {
      const { data } = await api.post('/auth/init');
      const user = data.user;
      const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      const currentId = String(tgId || user.tg_id);

      // Collect all state before calling set() — prevents multiple re-renders (flickering)
      let isAdmin = ADMIN_IDS.length > 0 && ADMIN_IDS.includes(currentId);
      let adminPerms = isAdmin ? '*' : null;

      // If not in env, try dynamic API check (DB-based admins)
      if (!isAdmin) {
        try {
          const { data: adminCheck } = await api.get('/admin/check-admin');
          isAdmin = !!adminCheck?.isAdmin;
          adminPerms = adminCheck?.permissions || [];
        } catch (e) {
          // 403 = not admin, that's fine
        }
      }

      // Check ambassador visibility (0=hidden, 1=all, 2=admin only)
      let ambassadorVisible = false;
      try {
        const { data: ambData } = await api.get('/ambassador/visibility');
        const vis = ambData?.visibility ?? 0;
        if (vis === 1) ambassadorVisible = true;
        else if (vis === 2) ambassadorVisible = isAdmin;
      } catch (e) {}

      // Single atomic state update — no flickering
      set({
        user, isAdmin, adminPerms, ambassadorVisible,
        mining: data.mining || null,
        appSettings: data.settings || get().appSettings,
        loading: false
      });
    } catch (e) {
      if (e.response?.status === 403) {
        set({ blocked: true, loading: false });
      } else {
        console.error('Init error:', e);
        set({ loading: false });
      }
    }
  },

  fetchMining: async () => {
    const { data } = await api.get('/mining/status');
    set({ mining: data });
  },

  collect: async () => {
    const { data } = await api.post('/mining/collect');
    // Refresh user + mining in one call
    const { data: initData } = await api.post('/auth/init');
    set({ user: initData.user, mining: initData.mining || null });
    return data;
  },

  refreshUser: async () => {
    const { data } = await api.post('/auth/init');
    set({ user: data.user, mining: data.mining || null });
  }
}));

