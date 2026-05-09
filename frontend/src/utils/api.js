import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api'
});

// Extract referral ID from all possible sources
const getRefId = () => {
  const tg = window.Telegram?.WebApp;
  // 1. Telegram start_param (direct webapp link ?startapp=PARAM)
  if (tg?.initDataUnsafe?.start_param) return tg.initDataUnsafe.start_param;
  // 2. URL query param ?ref=PARAM (from bot's webApp button)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('ref')) return urlParams.get('ref');
  // 3. Hash fragment #ref=PARAM
  const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
  if (hashParams.get('ref')) return hashParams.get('ref');
  return null;
};

const REF_ID = getRefId();

api.interceptors.request.use((config) => {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) {
    config.headers['x-init-data'] = tg.initData;
  }
  // Pass referral ID
  if (REF_ID) {
    config.headers['x-ref-id'] = REF_ID;
  }
  // dev fallback
  if (!tg?.initData && import.meta.env.DEV) {
    config.headers['x-init-data'] = 'user=%7B%22id%22%3A123456%2C%22first_name%22%3A%22Test%22%2C%22username%22%3A%22testuser%22%7D&hash=dev';
  }
  return config;
});

export default api;

