// Adsgram Interstitial hook with fallback
// Primary: Interstitial → Fallback: Reward block → Action proceeds regardless
import { useRef, useCallback } from 'react';

const INTERSTITIAL_BLOCK_ID = import.meta.env.VITE_ADSGRAM_INTERSTITIAL_ID || 'int-29785';
const REWARD_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID || '29776';

export function useInterstitialAd() {
  const interstitialRef = useRef(null);
  const rewardRef = useRef(null);

  const getInterstitial = useCallback(() => {
    if (!INTERSTITIAL_BLOCK_ID || !window.Adsgram) return null;
    if (!interstitialRef.current) {
      try {
        interstitialRef.current = window.Adsgram.init({ blockId: INTERSTITIAL_BLOCK_ID });
      } catch (e) {
        console.error('[Ad] Interstitial init error:', e);
      }
    }
    return interstitialRef.current;
  }, []);

  const getReward = useCallback(() => {
    if (!REWARD_BLOCK_ID || !window.Adsgram) return null;
    if (!rewardRef.current) {
      try {
        rewardRef.current = window.Adsgram.init({ blockId: REWARD_BLOCK_ID });
      } catch (e) {
        console.error('[Ad] Reward fallback init error:', e);
      }
    }
    return rewardRef.current;
  }, []);

  // Try interstitial first, then reward as fallback, then just proceed
  const showAdThen = useCallback(async (callback) => {
    // Try Interstitial
    const interstitial = getInterstitial();
    if (interstitial) {
      try {
        await interstitial.show();
        callback();
        return;
      } catch (e) {
        console.log('[Ad] Interstitial failed, trying reward fallback:', e);
      }
    }

    // Fallback: Reward ad
    const reward = getReward();
    if (reward) {
      try {
        await reward.show();
        callback();
        return;
      } catch (e) {
        console.log('[Ad] Reward fallback also failed:', e);
      }
    }

    // No ads available — just run the action
    callback();
  }, [getInterstitial, getReward]);

  return { showAdThen };
}
