import { create } from 'zustand';
import api from '../utils/api.js';

export const useStore = create((set, get) => ({
  user: null,
  mining: null,
  loading: true,
  activeTab: 'power',

  setTab: (tab) => set({ activeTab: tab }),

  init: async () => {
    try {
      const { data } = await api.post('/auth/init');
      set({ user: data.user });
      await get().fetchMining();
    } catch (e) {
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
