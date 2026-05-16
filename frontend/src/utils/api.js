import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api'
});

// Extract referral ID from ALL possible Telegram sources
const getRefId = () => {
  const tg = window.Telegram?.WebApp;

  // 1. Telegram start_param (most reliable — from t.me/bot/app?startapp=PARAM)
  if (tg?.initDataUnsafe?.start_param) {
    console.log('[Ref] Source: start_param =', tg.initDataUnsafe.start_param);
    return tg.initDataUnsafe.start_param;
  }

  // 2. tgWebAppStartParam from URL hash (some clients pass it here)
  try {
    const hash = window.location.hash?.slice(1);
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const fromHash = hashParams.get('tgWebAppStartParam');
      if (fromHash) {
        console.log('[Ref] Source: hash tgWebAppStartParam =', fromHash);
        return fromHash;
      }
    }
  } catch (e) {}

  // 3. URL query param ?ref=PARAM (fallback for webApp button)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('ref');
    if (fromUrl) {
      console.log('[Ref] Source: URL ?ref =', fromUrl);
      return fromUrl;
    }
  } catch (e) {}

  console.log('[Ref] No referral param found');
  return null;
};

// Cache once on load
const REF_ID = getRefId();

api.interceptors.request.use((config) => {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) {
    config.headers['x-init-data'] = tg.initData;
  }
  // Always pass referral ID if we have one
  if (REF_ID) {
    config.headers['x-ref-id'] = REF_ID;
  }
  // Admin PIN from session if available
  const adminPin = sessionStorage.getItem('admin_pin');
  if (adminPin) {
    config.headers['x-admin-pin'] = adminPin;
  }

  // dev fallback
  if (!tg?.initData && import.meta.env.DEV) {
    config.headers['x-init-data'] = 'user=%7B%22id%22%3A123456%2C%22first_name%22%3A%22Test%22%2C%22username%22%3A%22testuser%22%7D&hash=dev';
  }

  return config;
});

export default api;
