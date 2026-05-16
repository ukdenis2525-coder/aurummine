import { pool } from '../db.js';

/**
 * Checks and updates cooldown for a user
 * @param {number} userId 
 * @param {string} type - 'adsgram', 'monetag', 'payment_check', etc.
 * @param {number} cooldownSeconds 
 * @param {number} dailyLimit 
 * @returns {Promise<{allowed: boolean, remaining: number, dailyCount: number}>}
 */
export const checkCooldown = async (userId, type, cooldownSeconds, dailyLimit) => {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    const { rows } = await pool.query(
      `SELECT * FROM user_cooldowns WHERE user_id = $1 AND cooldown_type = $2`,
      [userId, type]
    );

    let cooldown = rows[0];
    const now = new Date();

    if (cooldown) {
      const lastAt = new Date(cooldown.last_at);
      const diffSec = Math.floor((now - lastAt) / 1000);
      const remaining = Math.max(0, cooldownSeconds - diffSec);

      // Check daily limit
      let dailyCount = cooldown.last_date === today ? cooldown.daily_count : 0;

      if (remaining > 0) {
        return { allowed: false, remaining, dailyCount };
      }

      if (dailyLimit && dailyCount >= dailyLimit) {
        return { allowed: false, remaining: 0, dailyCount, limitReached: true };
      }

      // Update
      const newDailyCount = dailyCount + 1;
      await pool.query(
        `UPDATE user_cooldowns SET last_at = $1, daily_count = $2, last_date = $3
         WHERE user_id = $4 AND cooldown_type = $5`,
        [now, newDailyCount, today, userId, type]
      );
      
      return { allowed: true, remaining: 0, dailyCount: newDailyCount };
    } else {
      // Create new
      await pool.query(
        `INSERT INTO user_cooldowns (user_id, cooldown_type, last_at, daily_count, last_date)
         VALUES ($1, $2, $3, 1, $4)`,
        [userId, type, now, today]
      );
      return { allowed: true, remaining: 0, dailyCount: 1 };
    }
  } catch (e) {
    console.error('[Cooldown] Error:', e.message);
    return { allowed: true, remaining: 0, dailyCount: 0 }; // Fail safe (allow)
  }
};

/**
 * Just gets current status without updating
 */
export const getCooldownStatus = async (userId, type, cooldownSeconds, dailyLimit) => {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM user_cooldowns WHERE user_id = $1 AND cooldown_type = $2`,
      [userId, type]
    );
    if (!rows.length) return { cooldown: 0, dailyCount: 0, dailyLimit };

    const cooldown = rows[0];
    const diffSec = Math.floor((new Date() - new Date(cooldown.last_at)) / 1000);
    const remaining = Math.max(0, cooldownSeconds - diffSec);
    const dailyCount = cooldown.last_date === today ? cooldown.daily_count : 0;

    return { cooldown: remaining, dailyCount, dailyLimit };
  } catch {
    return { cooldown: 0, dailyCount: 0, dailyLimit };
  }
};
