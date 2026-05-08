import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api'
});

api.interceptors.request.use((config) => {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) {
    config.headers['x-init-data'] = tg.initData;
  }
  // dev fallback
  if (!tg?.initData && import.meta.env.DEV) {
    config.headers['x-init-data'] = 'user=%7B%22id%22%3A123456%2C%22first_name%22%3A%22Test%22%2C%22username%22%3A%22testuser%22%7D&hash=dev';
  }
  return config;
});

export default api;
