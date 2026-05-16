import crypto from 'crypto';

/**
 * Validates Telegram WebApp initData signature
 * @param {string} initData - Raw initData string from Telegram
 * @param {string} botToken - Telegram Bot Token
 * @returns {object|null} - Parsed user object if valid, null otherwise
 */
export const validateTelegramInitData = (initData, botToken) => {
  if (!initData || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Skip validation only if explicitly in non-production AND hash is 'dev'
    if (hash === 'dev' && process.env.NODE_ENV !== 'production') {
      const userParam = params.get('user');
      return userParam ? JSON.parse(userParam) : null;
    }

    if (expectedHash !== hash) {
      return null;
    }

    const userParam = params.get('user');
    return userParam ? JSON.parse(userParam) : null;
  } catch (e) {
    console.error('[TelegramAuth] Validation error:', e.message);
    return null;
  }
};

/**
 * Safely parses initData without validation (for non-sensitive context or when already validated)
 */
export const parseInitData = (initData) => {
  try {
    const params = new URLSearchParams(initData);
    const userParam = params.get('user');
    const startParam = params.get('start_param');
    return {
      user: userParam ? JSON.parse(userParam) : null,
      startParam: startParam || null
    };
  } catch {
    return { user: null, startParam: null };
  }
};
