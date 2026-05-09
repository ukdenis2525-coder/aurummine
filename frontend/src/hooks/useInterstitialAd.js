// Ad hook: Monetag only (no Adsgram error popups)
import { useCallback } from 'react';

const MONETAG_ZONE_ID = import.meta.env.VITE_MONETAG_ZONE_ID || '10984603';

export function useInterstitialAd() {

  // Monetag via global show_ function (no error popups)
  const showMonetag = useCallback(async () => {
    if (!MONETAG_ZONE_ID) return false;
    const showFn = window[`show_${MONETAG_ZONE_ID}`];
    if (typeof showFn !== 'function') return false;
    try {
      await showFn();
      return true;
    } catch (e) {
      console.log('[Ad] Monetag failed:', e);
      return false;
    }
  }, []);

  // Show Monetag ad, then proceed. If no ad — proceed immediately.
  const showAdThen = useCallback(async (callback) => {
    const ok = await showMonetag();
    // Always proceed regardless
    callback();
  }, [showMonetag]);

  return { showAdThen };
}
