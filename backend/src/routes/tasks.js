import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

// Ad cooldown tracking (in-memory per user)
const adCooldowns = new Map();
const AD_COOLDOWN_SEC = 60;

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

  // Check cooldown
  const lastWatch = adCooldowns.get(userId);
  const now = Date.now();
  if (lastWatch && (now - lastWatch) < AD_COOLDOWN_SEC * 1000) {
    const remaining = Math.ceil((AD_COOLDOWN_SEC * 1000 - (now - lastWatch)) / 1000);
    return res.status(429).json({ error: 'Cooldown', cooldown: remaining });
  }

  // Get reward amount from settings
  const { rows: settingsRows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'ad_reward_power'`
  );
  const rewardPower = settingsRows.length ? parseFloat(settingsRows[0].value) : 500;

  // Give reward
  await pool.query(
    `UPDATE users SET power = power + $1 WHERE id = $2`,
    [rewardPower, userId]
  );

  // Set cooldown
  adCooldowns.set(userId, now);

  console.log(`[Ad] User ${userId} watched ad, +${rewardPower} POWER`);
  res.json({ success: true, reward: rewardPower, cooldown: AD_COOLDOWN_SEC });
});

// ── Adsgram: Check ad cooldown ──
router.get('/ad-status', authMiddleware, (req, res) => {
  const lastWatch = adCooldowns.get(req.user.id);
  if (!lastWatch) return res.json({ cooldown: 0 });
  const elapsed = Math.floor((Date.now() - lastWatch) / 1000);
  const remaining = Math.max(0, AD_COOLDOWN_SEC - elapsed);
  res.json({ cooldown: remaining });
});

export default router;

