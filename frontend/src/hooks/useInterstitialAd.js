// Adsgram Interstitial hook — shows a full-screen ad before an action
import { useRef, useCallback } from 'react';

const INTERSTITIAL_BLOCK_ID = import.meta.env.VITE_ADSGRAM_INTERSTITIAL_ID || 'int-29785';

export function useInterstitialAd() {
  const controllerRef = useRef(null);

  // Initialize on first use
  const getController = useCallback(() => {
    if (!INTERSTITIAL_BLOCK_ID || !window.Adsgram) return null;
    if (!controllerRef.current) {
      try {
        controllerRef.current = window.Adsgram.init({ blockId: INTERSTITIAL_BLOCK_ID });
      } catch (e) {
        console.error('[Adsgram] Interstitial init error:', e);
      }
    }
    return controllerRef.current;
  }, []);

  // Show ad, then execute callback regardless of result
  const showAdThen = useCallback(async (callback) => {
    const ctrl = getController();
    if (!ctrl) {
      // No ads available — just run the action
      callback();
      return;
    }

    try {
      await ctrl.show();
    } catch (e) {
      // Ad skipped or failed — still proceed
      console.log('[Adsgram] Interstitial skipped:', e);
    }
    // Always run the callback after ad
    callback();
  }, [getController]);

  return { showAdThen };
}
