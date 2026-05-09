// Ad hook with fallback: Adsgram Interstitial → Adsgram Reward → Monetag → proceed
import { useRef, useCallback } from 'react';

const ADSGRAM_INTERSTITIAL_ID = import.meta.env.VITE_ADSGRAM_INTERSTITIAL_ID || 'int-29785';
const ADSGRAM_REWARD_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID || '29776';
const MONETAG_ZONE_ID = import.meta.env.VITE_MONETAG_ZONE_ID || '10984603';

export function useInterstitialAd() {
  const interstitialRef = useRef(null);
  const rewardRef = useRef(null);

  // Adsgram Interstitial
  const getInterstitial = useCallback(() => {
    if (!ADSGRAM_INTERSTITIAL_ID || !window.Adsgram) return null;
    if (!interstitialRef.current) {
      try {
        interstitialRef.current = window.Adsgram.init({ blockId: ADSGRAM_INTERSTITIAL_ID });
      } catch (e) { console.error('[Ad] Interstitial init:', e); }
    }
    return interstitialRef.current;
  }, []);

  // Adsgram Reward (fallback)
  const getReward = useCallback(() => {
    if (!ADSGRAM_REWARD_ID || !window.Adsgram) return null;
    if (!rewardRef.current) {
      try {
        rewardRef.current = window.Adsgram.init({ blockId: ADSGRAM_REWARD_ID });
      } catch (e) { console.error('[Ad] Reward init:', e); }
    }
    return rewardRef.current;
  }, []);

  // Monetag via global show_ function
  const showMonetag = useCallback(async () => {
    if (!MONETAG_ZONE_ID) return false;
    const showFn = window[`show_${MONETAG_ZONE_ID}`];
    if (typeof showFn !== 'function') {
      console.log('[Ad] Monetag show function not found');
      return false;
    }
    try {
      await showFn();
      return true;
    } catch (e) {
      console.log('[Ad] Monetag failed:', e);
      return false;
    }
  }, []);

  // Fallback chain: Interstitial → Reward → Monetag → proceed anyway
  const showAdThen = useCallback(async (callback) => {
    // 1. Adsgram Interstitial
    const interstitial = getInterstitial();
    if (interstitial) {
      try {
        await interstitial.show();
        callback();
        return;
      } catch (e) {
        console.log('[Ad] Interstitial failed:', e);
      }
    }

    // 2. Adsgram Reward
    const reward = getReward();
    if (reward) {
      try {
        await reward.show();
        callback();
        return;
      } catch (e) {
        console.log('[Ad] Reward failed:', e);
      }
    }

    // 3. Monetag
    const monetagOk = await showMonetag();
    if (monetagOk) {
      callback();
      return;
    }

    // 4. No ads — proceed anyway
    console.log('[Ad] No ads available, proceeding');
    callback();
  }, [getInterstitial, getReward, showMonetag]);

  return { showAdThen };
}
