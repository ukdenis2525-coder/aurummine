// Ad hook: Monetag via official SDK (no script tag needed)
import { useCallback, useRef } from 'react';
import createAdHandler from 'monetag-tg-sdk';

const MONETAG_ZONE_ID = import.meta.env.VITE_MONETAG_ZONE_ID || '10984603';

export function useInterstitialAd() {
  const handlerRef = useRef(null);

  const getHandler = useCallback(() => {
    if (!MONETAG_ZONE_ID) return null;
    if (!handlerRef.current) {
      try {
        handlerRef.current = createAdHandler(MONETAG_ZONE_ID);
      } catch (e) {
        console.error('[Ad] Monetag init error:', e);
      }
    }
    return handlerRef.current;
  }, []);

  const showAdThen = useCallback(async (callback) => {
    const handler = getHandler();
    if (!handler) {
      callback();
      return;
    }

    try {
      await handler();
      console.log('[Ad] Monetag ad completed');
    } catch (e) {
      console.log('[Ad] Monetag ad skipped/failed:', e);
    }

    // Always proceed
    callback();
  }, [getHandler]);

  return { showAdThen };
}
