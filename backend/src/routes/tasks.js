import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';
import axios from 'axios';

const router = Router();

// Ad tracking (in-memory per user)
const adCooldowns = new Map();
const adDailyCounts = new Map(); // userId -> { date, count }

router.get('/', authMiddleware, async (req, res) => {
  // Check if user is admin
  const adminIds = (process.env.ADMIN_TG_IDS || process.env.ADMIN_TG_ID || '').split(',').map(s => s.trim());
  const isAdmin = adminIds.includes(String(req.user.tg_id));

  const visibilityFilter = isAdmin ? '' : `AND (t.visibility = 'all' OR t.visibility IS NULL)`;

  const { rows } = await pool.query(
    `SELECT t.*, 
      CASE WHEN ut.id IS NOT NULL THEN TRUE ELSE FALSE END as completed
     FROM tasks t
     LEFT JOIN user_tasks ut ON ut.task_id = t.id AND ut.user_id = $1
     WHERE t.is_active = TRUE ${visibilityFilter}
     ORDER BY t.id ASC`,
    [req.user.id]
  );
  res.json(rows);
});

// ── Check Telegram channel subscription ──
async function checkTgSubscription(chatId, userId) {
  try {
    const token = process.env.BOT_TOKEN;
    if (!token) return false;
    const { data } = await axios.get(
      `https://api.telegram.org/bot${token}/getChatMember`,
      { params: { chat_id: chatId, user_id: userId } }
    );
    const status = data?.result?.status;
    // member, administrator, creator = subscribed; left, kicked = not
    return ['member', 'administrator', 'creator'].includes(status);
  } catch (e) {
    console.error('[Tasks] Subscription check failed:', e.response?.data?.description || e.message);
    return false;
  }
}

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

  // ── Verify subscription for subscribe_channel tasks ──
  if (task.type === 'subscribe_channel' && task.link) {
    // Extract channel username or chat_id from link
    // Supports: https://t.me/channelname, @channelname, -100xxxx
    let chatId = task.link.trim();
    if (chatId.startsWith('https://t.me/')) {
      chatId = '@' + chatId.replace('https://t.me/', '').replace(/\/$/, '');
    } else if (chatId.startsWith('t.me/')) {
      chatId = '@' + chatId.replace('t.me/', '').replace(/\/$/, '');
    } else if (!chatId.startsWith('@') && !chatId.startsWith('-')) {
      chatId = '@' + chatId;
    }

    const isSubscribed = await checkTgSubscription(chatId, user.tg_id);
    if (!isSubscribed) {
      return res.status(400).json({ error: 'not_subscribed', message: 'You must subscribe first' });
    }
  }

  // Prevent users from completing their own ordered tasks
  if (task.creator_id && task.creator_id === user.id) {
    return res.status(400).json({ error: 'Cannot complete your own task' });
  }

  // Check if task has reached max completions
  if (task.max_completions && task.completed_count >= task.max_completions) {
    return res.status(400).json({ error: 'Task limit reached' });
  }

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

    // Track completed count
    await client.query(
      `UPDATE tasks SET completed_count = COALESCE(completed_count, 0) + 1 WHERE id = $1`,
      [taskId]
    );

    // Auto-deactivate if max reached
    if (task.max_completions && (task.completed_count || 0) + 1 >= task.max_completions) {
      await client.query(`UPDATE tasks SET is_active = FALSE WHERE id = $1`, [taskId]);
      // Also update order status
      if (task.order_id) {
        await client.query(
          `UPDATE task_orders SET status = 'completed', completed_count = max_completions WHERE id = $1`,
          [task.order_id]
        );
      }
    } else if (task.order_id) {
      await client.query(
        `UPDATE task_orders SET completed_count = completed_count + 1 WHERE id = $1`,
        [task.order_id]
      );
    }

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

// ── Monetag: separate cooldown/daily tracking ──
const monetagCooldowns = new Map();
const monetagDailyCounts = new Map();

router.post('/monetag-reward', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  // Get ad settings from DB
  const { rows: settingsRows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key IN ('monetag_reward_power', 'ad_reward_power', 'ad_cooldown_seconds', 'ad_daily_limit', 'ref_power_premium', 'ref_power_normal')`
  );
  const settings = {};
  for (const r of settingsRows) settings[r.key] = parseFloat(r.value);
  const rewardPower = settings.monetag_reward_power || 5;
  const cooldownSec = settings.ad_cooldown_seconds || 60;
  const dailyLimit = settings.ad_daily_limit || 50;

  // Check cooldown
  const lastWatch = monetagCooldowns.get(userId);
  const now = Date.now();
  if (lastWatch && (now - lastWatch) < cooldownSec * 1000) {
    const remaining = Math.ceil((cooldownSec * 1000 - (now - lastWatch)) / 1000);
    return res.status(429).json({ error: 'Cooldown', cooldown: remaining });
  }

  // Check daily limit
  const today = new Date().toISOString().slice(0, 10);
  const daily = monetagDailyCounts.get(userId);
  if (daily && daily.date === today && daily.count >= dailyLimit) {
    return res.status(429).json({ error: 'Daily limit reached', daily_limit: dailyLimit });
  }

  // Give reward
  await pool.query(
    `UPDATE users SET power = power + $1 WHERE id = $2`,
    [rewardPower, userId]
  );

  // ── Activate referral on first monetag watch ──
  const { rows: pendingRef } = await pool.query(
    `SELECT r.id, r.referrer_id FROM referrals r WHERE r.referee_id = $1 AND r.is_confirmed = FALSE`,
    [userId]
  );

  let refActivated = false;
  if (pendingRef.length > 0) {
    const ref = pendingRef[0];
    const referrerId = ref.referrer_id;

    const { rows: referrerRows } = await pool.query(
      `SELECT is_premium FROM users WHERE id = $1`, [referrerId]
    );
    const isPremium = referrerRows[0]?.is_premium;
    const refReward = isPremium
      ? (settings.ref_power_premium || 6000)
      : (settings.ref_power_normal || 3000);

    await pool.query(`UPDATE referrals SET is_confirmed = TRUE WHERE id = $1`, [ref.id]);
    await pool.query(`UPDATE users SET power = power + $1 WHERE id = $2`, [refReward, referrerId]);
    await pool.query(
      `INSERT INTO referral_rewards (referrer_id, referee_id, reward_type, power_amount) VALUES ($1, $2, 'signup', $3)`,
      [referrerId, userId, refReward]
    );

    refActivated = true;
    console.log(`✅ Referral activated via Monetag: referrer=${referrerId} +${refReward} POWER (user ${userId})`);
  }

  // Set cooldown
  monetagCooldowns.set(userId, now);

  // Update daily count
  if (daily && daily.date === today) {
    daily.count++;
  } else {
    monetagDailyCounts.set(userId, { date: today, count: 1 });
  }

  const dailyCurrent = monetagDailyCounts.get(userId);
  console.log(`[Monetag] User ${userId} watched ad, +${rewardPower} POWER (${dailyCurrent.count}/${dailyLimit} today)`);
  res.json({ success: true, reward: rewardPower, cooldown: cooldownSec, ref_activated: refActivated, daily_count: dailyCurrent.count, daily_limit: dailyLimit });
});

router.get('/monetag-status', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key IN ('ad_cooldown_seconds', 'ad_daily_limit')`
  );
  const s = {};
  for (const r of rows) s[r.key] = parseFloat(r.value);
  const cooldownSec = s.ad_cooldown_seconds || 60;
  const dailyLimit = s.ad_daily_limit || 50;

  const lastWatch = monetagCooldowns.get(req.user.id);
  const cooldown = lastWatch ? Math.max(0, cooldownSec - Math.floor((Date.now() - lastWatch) / 1000)) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const daily = monetagDailyCounts.get(req.user.id);
  const dailyCount = (daily && daily.date === today) ? daily.count : 0;

  res.json({ cooldown, daily_count: dailyCount, daily_limit: dailyLimit });
});

// ═══════════════ TASK ORDERS (Advertising) ═══════════════

// Get pricing config for ordering tasks
router.get('/order-config', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key LIKE 'order_%'`
  );
  const config = {};
  for (const r of rows) config[r.key] = parseFloat(r.value);
  res.json({
    types: [
      {
        type: 'subscribe_channel',
        label: '📢 Подписка на канал',
        price_per_user: config.order_price_subscribe || 0.01,
        reward_power: config.order_reward_subscribe || 500,
        placeholder: 'https://t.me/yourchannel',
      },
      {
        type: 'start_bot',
        label: '🤖 Запуск бота',
        price_per_user: config.order_price_start_bot || 0.008,
        reward_power: config.order_reward_start_bot || 300,
        placeholder: 'https://t.me/yourbot?start=ref',
      },
      {
        type: 'link',
        label: '🔗 Переход по ссылке',
        price_per_user: config.order_price_link || 0.005,
        reward_power: config.order_reward_link || 200,
        placeholder: 'https://example.com',
      },
    ]
  });
});

// Create a task order (user pays from TON balance)
router.post('/order', authMiddleware, async (req, res) => {
  const { type, link, count, title } = req.body;
  if (!type || !link || !count) return res.status(400).json({ error: 'type, link, count required' });
  if (!['subscribe_channel', 'start_bot', 'link'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (count < 10 || count > 10000) return res.status(400).json({ error: 'Count must be 10-10000' });

  // Get pricing
  const { rows: settingsRows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key LIKE 'order_%'`
  );
  const config = {};
  for (const r of settingsRows) config[r.key] = parseFloat(r.value);

  const priceMap = {
    subscribe_channel: config.order_price_subscribe || 0.01,
    start_bot: config.order_price_start_bot || 0.008,
    link: config.order_price_link || 0.005,
  };
  const rewardMap = {
    subscribe_channel: config.order_reward_subscribe || 500,
    start_bot: config.order_reward_start_bot || 300,
    link: config.order_reward_link || 200,
  };

  const pricePerUser = priceMap[type];
  const rewardPower = rewardMap[type];
  const totalPrice = parseFloat((pricePerUser * count).toFixed(4));

  // Check balance
  const { rows: userRows } = await pool.query(`SELECT ton_balance FROM users WHERE id = $1`, [req.user.id]);
  const balance = parseFloat(userRows[0].ton_balance);
  if (balance < totalPrice) return res.status(400).json({ error: 'insufficient_balance', needed: totalPrice, have: balance });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Deduct balance
    await client.query(`UPDATE users SET ton_balance = ton_balance - $1 WHERE id = $2`, [totalPrice, req.user.id]);

    // Create order (pending admin approval)
    const { rows: orderRows } = await client.query(
      `INSERT INTO task_orders (user_id, type, title, link, price_per_user, reward_power, max_completions, total_paid, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING *`,
      [req.user.id, type, title || '', link, pricePerUser, rewardPower, count, totalPrice]
    );

    await client.query('COMMIT');
    console.log(`[TaskOrder] User ${req.user.id} ordered ${count}x ${type} for ${totalPrice} TON`);
    res.json({ success: true, order: orderRows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[TaskOrder] Error:', e);
    res.status(500).json({ error: 'Order failed' });
  } finally {
    client.release();
  }
});

// Get user's own orders
router.get('/my-orders', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM task_orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

export default router;
