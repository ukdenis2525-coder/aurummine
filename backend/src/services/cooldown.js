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
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Try to lock existing row
    const { rows } = await client.query(
      `SELECT * FROM user_cooldowns WHERE user_id = $1 AND cooldown_type = $2 FOR UPDATE`,
      [userId, type]
    );

    if (rows.length) {
      const cd = rows[0];
      const elapsed = (Date.now() - new Date(cd.last_at).getTime()) / 1000;
      const dailyCount = cd.last_date === today ? cd.daily_count : 0;

      // Cooldown not passed yet
      if (elapsed < cooldownSeconds) {
        await client.query('COMMIT');
        return { allowed: false, remaining: Math.ceil(cooldownSeconds - elapsed), dailyCount };
      }

      // Daily limit reached
      if (dailyLimit && dailyCount >= dailyLimit) {
        await client.query('COMMIT');
        return { allowed: false, remaining: 0, dailyCount, limitReached: true };
      }

      // Allowed — update atomically (row is locked)
      const newCount = cd.last_date === today ? dailyCount + 1 : 1;
      await client.query(
        `UPDATE user_cooldowns SET last_at = NOW(), daily_count = $1, last_date = $2
         WHERE user_id = $3 AND cooldown_type = $4`,
        [newCount, today, userId, type]
      );

      await client.query('COMMIT');
      return { allowed: true, remaining: 0, dailyCount: newCount };
    } else {
      // First time — insert new row
      await client.query(
        `INSERT INTO user_cooldowns (user_id, cooldown_type, last_at, daily_count, last_date)
         VALUES ($1, $2, NOW(), 1, $3)`,
        [userId, type, today]
      );
      await client.query('COMMIT');
      return { allowed: true, remaining: 0, dailyCount: 1 };
    }
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[Cooldown] Error:', e.message);
    // Fail-closed: deny on error to prevent exploitation
    return { allowed: false, remaining: cooldownSeconds, dailyCount: 0 };
  } finally {
    client.release();
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
