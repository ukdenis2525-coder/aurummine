import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

// Ad tracking (in-memory per user)
const adCooldowns = new Map();
const adDailyCounts = new Map(); // userId -> { date, count }

router.get('/', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, 
      CASE WHEN ut.id IS NOT NULL THEN TRUE ELSE FALSE END as completed
     FROM tasks t
     LEFT JOIN user_tasks ut ON ut.task_id = t.id AND ut.user_id = $1
     WHERE t.is_active = TRUE
     ORDER BY t.id ASC`,
    [req.user.id]
  );
  res.json(rows);
});

router.post('/:id/complete', authMiddleware, async (req, res) => {
  const taskId = parseInt(req.params.id);
  const user = req.user;

  const { rows: tasks } = await pool.query(
    `SELECT * FROM tasks WHERE id = $1 AND is_active = TRUE`, [taskId]
  );
  if (!tasks.length) return res.status(404).json({ error: 'Task not found' });

  const task = tasks[0];

  // Check already completed
  const { rows: existing } = await pool.query(
    `SELECT id FROM user_tasks WHERE user_id = $1 AND task_id = $2`,
    [user.id, taskId]
  );
  if (existing.length) return res.status(400).json({ error: 'Already completed' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO user_tasks (user_id, task_id) VALUES ($1, $2)`,
      [user.id, taskId]
    );

    await client.query(
      `UPDATE users SET power = power + $1 WHERE id = $2`,
      [task.reward_power, user.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, power_earned: task.reward_power });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed' });
  } finally {
    client.release();
  }
});

// ── Adsgram: Ad reward ──
router.post('/ad-reward', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  // Get all ad settings from DB
  const { rows: settingsRows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key IN ('ad_reward_power', 'ad_cooldown_seconds', 'ad_daily_limit', 'ref_power_premium', 'ref_power_normal')`
  );
  const settings = {};
  for (const r of settingsRows) settings[r.key] = parseFloat(r.value);
  const rewardPower = settings.ad_reward_power || 500;
  const cooldownSec = settings.ad_cooldown_seconds || 60;
  const dailyLimit = settings.ad_daily_limit || 50;

  // Check cooldown
  const lastWatch = adCooldowns.get(userId);
  const now = Date.now();
  if (lastWatch && (now - lastWatch) < cooldownSec * 1000) {
    const remaining = Math.ceil((cooldownSec * 1000 - (now - lastWatch)) / 1000);
    return res.status(429).json({ error: 'Cooldown', cooldown: remaining });
  }

  // Check daily limit
  const today = new Date().toISOString().slice(0, 10);
  const daily = adDailyCounts.get(userId);
  if (daily && daily.date === today && daily.count >= dailyLimit) {
    return res.status(429).json({ error: 'Daily limit reached', daily_limit: dailyLimit });
  }

  // Give ad reward to user
  await pool.query(
    `UPDATE users SET power = power + $1 WHERE id = $2`,
    [rewardPower, userId]
  );

  // ── Activate referral on first ad watch ──
  const { rows: pendingRef } = await pool.query(
    `SELECT r.id, r.referrer_id FROM referrals r WHERE r.referee_id = $1 AND r.is_confirmed = FALSE`,
    [userId]
  );

  let refActivated = false;
  if (pendingRef.length > 0) {
    const ref = pendingRef[0];
    const referrerId = ref.referrer_id;

    // Check if referrer is premium
    const { rows: referrerRows } = await pool.query(
      `SELECT is_premium FROM users WHERE id = $1`, [referrerId]
    );
    const isPremium = referrerRows[0]?.is_premium;
    const refReward = isPremium
      ? (settings.ref_power_premium || 6000)
      : (settings.ref_power_normal || 3000);

    // Confirm referral
    await pool.query(`UPDATE referrals SET is_confirmed = TRUE WHERE id = $1`, [ref.id]);

    // Give referrer their reward
    await pool.query(`UPDATE users SET power = power + $1 WHERE id = $2`, [refReward, referrerId]);

    // Log reward
    await pool.query(
      `INSERT INTO referral_rewards (referrer_id, referee_id, reward_type, power_amount) VALUES ($1, $2, 'signup', $3)`,
      [referrerId, userId, refReward]
    );

    refActivated = true;
    console.log(`✅ Referral activated: referrer=${referrerId} +${refReward} POWER (user ${userId} watched first ad)`);
  }

  // Set cooldown
  adCooldowns.set(userId, now);

  // Update daily count
  if (daily && daily.date === today) {
    daily.count++;
  } else {
    adDailyCounts.set(userId, { date: today, count: 1 });
  }

  const dailyCurrent = adDailyCounts.get(userId);
  console.log(`[Ad] User ${userId} watched ad, +${rewardPower} POWER (${dailyCurrent.count}/${dailyLimit} today)`);
  res.json({ success: true, reward: rewardPower, cooldown: cooldownSec, ref_activated: refActivated, daily_count: dailyCurrent.count, daily_limit: dailyLimit });
});

// ── Adsgram: Check ad cooldown ──
router.get('/ad-status', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key IN ('ad_cooldown_seconds', 'ad_daily_limit')`
  );
  const s = {};
  for (const r of rows) s[r.key] = parseFloat(r.value);
  const cooldownSec = s.ad_cooldown_seconds || 60;
  const dailyLimit = s.ad_daily_limit || 50;

  const lastWatch = adCooldowns.get(req.user.id);
  const cooldown = lastWatch ? Math.max(0, cooldownSec - Math.floor((Date.now() - lastWatch) / 1000)) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const daily = adDailyCounts.get(req.user.id);
  const dailyCount = (daily && daily.date === today) ? daily.count : 0;

  res.json({ cooldown, daily_count: dailyCount, daily_limit: dailyLimit });
});

export default router;

