import { create } from 'zustand';
import api from '../utils/api.js';

const ADMIN_ID = import.meta.env.VITE_ADMIN_ID;

export const useStore = create((set, get) => ({
  user: null,
  mining: null,
  loading: true,
  blocked: false,
  activeTab: 'power',
  isAdmin: false,

  setTab: (tab) => set({ activeTab: tab }),

  init: async () => {
    try {
      const { data } = await api.post('/auth/init');
      const user = data.user;
      const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      const isAdmin = ADMIN_ID && String(tgId || user.tg_id) === String(ADMIN_ID);
      set({ user, isAdmin });
      await get().fetchMining();
    } catch (e) {
      // 403 = blocked user (silent block)
      if (e.response?.status === 403) {
        set({ blocked: true });
      }
      console.error('Init error:', e);
    } finally {
      set({ loading: false });
    }
  },

  fetchMining: async () => {
    const { data } = await api.get('/mining/status');
    set({ mining: data });
  },

  collect: async () => {
    const { data } = await api.post('/mining/collect');
    await get().fetchMining();
    const { data: user } = await api.post('/auth/init');
    set({ user: user.user });
    return data;
  },

  refreshUser: async () => {
    const { data } = await api.post('/auth/init');
    set({ user: data.user });
  }
}));

