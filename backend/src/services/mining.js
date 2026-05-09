import { pool } from '../db.js';

// Constants
export const HASHES_PER_DAY_PER_100K = 2500;
export const TON_PER_HASH = 0.036 / 2500; // 0.0000144
export const MIN_WITHDRAW = 0.1; // TON

export const getHashesPerMinute = (power) => {
  return (power / 100000) * (HASHES_PER_DAY_PER_100K / 1440);
};

export const accrueHashes = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all users with power > 0
    const { rows: users } = await client.query(
      `SELECT id, power, last_accrue_at FROM users WHERE power > 0`
    );

    for (const user of users) {
      const minutesSince = Math.floor(
        (Date.now() - new Date(user.last_accrue_at).getTime()) / 60000
      );
      if (minutesSince < 1) continue;

      const hashesEarned = getHashesPerMinute(parseFloat(user.power)) * minutesSince;

      await client.query(
        `UPDATE users SET 
          hashes = hashes + $1,
          last_accrue_at = NOW()
         WHERE id = $2`,
        [hashesEarned, user.id]
      );

      await client.query(
        `INSERT INTO mining_log (user_id, hashes_earned) VALUES ($1, $2)`,
        [user.id, hashesEarned]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('accrueHashes transaction error:', e.message);
  } finally {
    client.release();
  }
};
