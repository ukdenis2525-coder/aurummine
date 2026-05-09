// Ad hook: Monetag rewarded interstitial (with preload & retry)
import { useCallback, useEffect, useRef } from 'react';

const MONETAG_ZONE_ID = import.meta.env.VITE_MONETAG_ZONE_ID || '10984603';

// Wait for Monetag show function to become available
function waitForMonetag(maxWait = 5000) {
  return new Promise((resolve) => {
    const fnName = `show_${MONETAG_ZONE_ID}`;
    if (typeof window[fnName] === 'function') {
      resolve(true);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      if (typeof window[fnName] === 'function') {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > maxWait) {
        clearInterval(interval);
        resolve(false);
      }
    }, 200);
  });
}

export function useInterstitialAd() {
  const readyRef = useRef(false);

  // Preload on mount
  useEffect(() => {
    if (!MONETAG_ZONE_ID) return;

    waitForMonetag().then((ok) => {
      readyRef.current = ok;
      if (ok) {
        // Preload an ad
        try {
          const showFn = window[`show_${MONETAG_ZONE_ID}`];
          showFn({ type: 'preload' });
          console.log('[Ad] Monetag preloaded');
        } catch (e) {
          console.log('[Ad] Monetag preload failed:', e);
        }
      } else {
        console.log('[Ad] Monetag not available');
      }
    });
  }, []);

  // Show ad then execute callback
  const showAdThen = useCallback(async (callback) => {
    if (!MONETAG_ZONE_ID) {
      callback();
      return;
    }

    const fnName = `show_${MONETAG_ZONE_ID}`;
    const showFn = window[fnName];

    if (typeof showFn !== 'function') {
      console.log('[Ad] Monetag not loaded, proceeding');
      callback();
      return;
    }

    try {
      await showFn();
      console.log('[Ad] Monetag ad completed');
    } catch (e) {
      console.log('[Ad] Monetag ad skipped:', e);
    }

    // Always proceed after ad (watched or skipped)
    callback();
  }, []);

  return { showAdThen };
}
