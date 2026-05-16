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
    // Atomic cooldown check + update in a single query to prevent race conditions.
    // Uses INSERT...ON CONFLICT to guarantee only one concurrent request succeeds.
    const { rows } = await pool.query(`
      INSERT INTO user_cooldowns (user_id, cooldown_type, last_at, daily_count, last_date)
      VALUES ($1, $2, NOW(), 1, $3)
      ON CONFLICT (user_id, cooldown_type) DO UPDATE SET
        last_at = CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - user_cooldowns.last_at)) >= $4
               AND (user_cooldowns.last_date != $3 OR user_cooldowns.daily_count < $5 OR $5 = 0)
          THEN NOW()
          ELSE user_cooldowns.last_at
        END,
        daily_count = CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - user_cooldowns.last_at)) >= $4
               AND (user_cooldowns.last_date != $3 OR user_cooldowns.daily_count < $5 OR $5 = 0)
          THEN CASE WHEN user_cooldowns.last_date = $3 THEN user_cooldowns.daily_count + 1 ELSE 1 END
          ELSE user_cooldowns.daily_count
        END,
        last_date = CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - user_cooldowns.last_at)) >= $4
               AND (user_cooldowns.last_date != $3 OR user_cooldowns.daily_count < $5 OR $5 = 0)
          THEN $3
          ELSE user_cooldowns.last_date
        END
      RETURNING
        last_at,
        daily_count,
        last_date,
        (xmax = 0) as is_new,
        EXTRACT(EPOCH FROM (NOW() - last_at)) as elapsed
    `, [userId, type, today, cooldownSeconds, dailyLimit || 999999]);

    const row = rows[0];
    
    // If the row is new (just inserted), it was allowed
    if (row.is_new) {
      return { allowed: true, remaining: 0, dailyCount: 1 };
    }

    // If elapsed is very small (< 1 sec), it means the UPDATE actually fired (allowed)
    // If elapsed >= cooldownSeconds, same thing
    // If elapsed < cooldownSeconds AND > 1, means the CASE didn't fire (denied)
    const elapsed = parseFloat(row.elapsed);
    
    if (elapsed < 2) {
      // Just updated = allowed
      return { allowed: true, remaining: 0, dailyCount: parseInt(row.daily_count) };
    }

    // Check if daily limit reached
    const dailyCount = row.last_date === today ? parseInt(row.daily_count) : 0;
    if (dailyLimit && dailyCount >= dailyLimit) {
      return { allowed: false, remaining: 0, dailyCount, limitReached: true };
    }

    // Cooldown still active
    const remaining = Math.max(0, cooldownSeconds - elapsed);
    return { allowed: false, remaining: Math.ceil(remaining), dailyCount };
  } catch (e) {
    console.error('[Cooldown] Error:', e.message);
    // FAIL CLOSED — deny on error to prevent exploitation
    return { allowed: false, remaining: cooldownSeconds, dailyCount: 0 };
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
