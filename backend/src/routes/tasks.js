import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';
import axios from 'axios';
import { getAllAdminIds } from './admin.js';
import { checkCooldown, getCooldownStatus } from '../services/cooldown.js';

const router = Router();

// Public: get ad config (block IDs from DB)
router.get('/ad-config', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key IN ('adsgram_block_id', 'adsgram_task_id', 'adsgram_interstitial_block_id', 'monetag_zone_id')`
    );
    const config = {};
    rows.forEach(r => config[r.key] = r.value);
    res.json({
      adsgram_block_id: config.adsgram_block_id || '29776',
      adsgram_task_id: config.adsgram_task_id || 'task-29788',
      adsgram_interstitial_block_id: config.adsgram_interstitial_block_id || '',
      monetag_zone_id: config.monetag_zone_id || '10984603',
    });
  } catch (e) {
    res.json({ adsgram_block_id: '29776', adsgram_task_id: 'task-29788', adsgram_interstitial_block_id: '', monetag_zone_id: '10984603' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  // Check if user is admin (env + DB)
  const adminIds = await getAllAdminIds();
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
    if (!token) { console.error('[SubCheck] BOT_TOKEN not set!'); return false; }
    console.log(`[SubCheck] Checking user ${userId} in chat "${chatId}"`);
    const { data } = await axios.get(
      `https://api.telegram.org/bot${token}/getChatMember`,
      { params: { chat_id: chatId, user_id: userId } }
    );
    const status = data?.result?.status;
    console.log(`[SubCheck] Result: status="${status}" for user ${userId} in "${chatId}"`);
    // member, administrator, creator = subscribed; left, kicked, restricted = not
    return ['member', 'administrator', 'creator'].includes(status);
  } catch (e) {
    const desc = e.response?.data?.description || e.message;
    console.error(`[SubCheck] FAILED: chat="${chatId}" user=${userId} => ${desc}`);
    return false;
  }
}

// Extract chat identifier from various link formats
function extractChatId(link) {
  let chatId = link.trim();
  
  // Remove query parameters and trailing slashes
  chatId = chatId.split('?')[0].replace(/\/+$/, '');
  
  // https://t.me/+INVITE or https://t.me/joinchat/INVITE — can't verify these
  if (chatId.includes('/+') || chatId.includes('/joinchat/')) {
    console.warn(`[SubCheck] Invite link detected, cannot verify: ${link}`);
    return null; // Cannot verify via getChatMember with invite links
  }
  
  // https://t.me/channelname
  if (chatId.includes('t.me/')) {
    chatId = chatId.split('t.me/').pop();
  }
  
  // Add @ prefix if needed
  if (!chatId.startsWith('@') && !chatId.startsWith('-')) {
    chatId = '@' + chatId;
  }
  
  return chatId;
}

router.post('/:id/complete', authMiddleware, async (req, res) => {
  const taskId = parseInt(req.params.id);
  const user = req.user;

  const { rows: tasks } = await pool.query(
    `SELECT * FROM tasks WHERE id = $1 AND is_active = TRUE`, [taskId]
  );
  if (!tasks.length) return res.status(404).json({ error: 'Task not found' });

  const task = tasks[0];

  // ── Verify subscription for subscribe_channel tasks ──
  if (task.type === 'subscribe_channel' && task.link) {
    const chatId = extractChatId(task.link);
    
    if (!chatId) {
      console.log(`[SubCheck] Invite link — skipping verification for task ${taskId}, user ${user.tg_id}`);
    } else {
      const isSubscribed = await checkTgSubscription(chatId, user.tg_id);
      if (!isSubscribed) {
        return res.status(400).json({ error: 'not_subscribed', message: 'You must subscribe first' });
      }
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

    // Atomic insert — prevents double-completion race condition
    const { rowCount } = await client.query(
      `INSERT INTO user_tasks (user_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, taskId]
    );
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Already completed' });
    }

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

  // Check persistent cooldown
  const status = await checkCooldown(userId, 'adsgram', cooldownSec, dailyLimit);
  if (!status.allowed) {
    if (status.limitReached) {
      return res.status(429).json({ error: 'Daily limit reached', daily_limit: dailyLimit });
    }
    return res.status(429).json({ error: 'Cooldown', cooldown: status.remaining });
  }

  // Give ad reward to user + increment ads_watched
  await pool.query(
    `UPDATE users SET power = power + $1, ads_watched = COALESCE(ads_watched, 0) + 1 WHERE id = $2`,
    [rewardPower, userId]
  );

  // ── Activate referral on first ad watch (atomic) ──
  const { rows: pendingRef } = await pool.query(
    `SELECT r.id, r.referrer_id FROM referrals r WHERE r.referee_id = $1 AND r.is_confirmed = FALSE`,
    [userId]
  );

  let refActivated = false;
  if (pendingRef.length > 0) {
    const ref = pendingRef[0];
    const referrerId = ref.referrer_id;

    // Atomic confirm — only one request can succeed
    const { rowCount } = await pool.query(
      `UPDATE referrals SET is_confirmed = TRUE WHERE id = $1 AND is_confirmed = FALSE`, [ref.id]
    );

    if (rowCount > 0) {
      const { rows: referrerRows } = await pool.query(
        `SELECT is_premium FROM users WHERE id = $1`, [referrerId]
      );
      const isPremium = referrerRows[0]?.is_premium;
      const refReward = isPremium
        ? (settings.ref_power_premium || 6000)
        : (settings.ref_power_normal || 3000);

      await pool.query(`UPDATE users SET power = power + $1 WHERE id = $2`, [refReward, referrerId]);
      await pool.query(
        `INSERT INTO referral_rewards (referrer_id, referee_id, reward_type, power_amount) VALUES ($1, $2, 'signup', $3) ON CONFLICT DO NOTHING`,
        [referrerId, userId, refReward]
      );

      refActivated = true;
      console.log(`✅ Referral activated: referrer=${referrerId} +${refReward} POWER (user ${userId} watched first ad)`);
    }
  }

  console.log(`[Ad] User ${userId} watched ad, +${rewardPower} POWER (${status.dailyCount}/${dailyLimit} today)`);
  res.json({ success: true, reward: rewardPower, cooldown: cooldownSec, ref_activated: refActivated, daily_count: status.dailyCount, daily_limit: dailyLimit });
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

  const status = await getCooldownStatus(req.user.id, 'adsgram', cooldownSec, dailyLimit);

  res.json({ cooldown: status.cooldown, daily_count: status.dailyCount, daily_limit: dailyLimit });
});

// ── Monetag: separate cooldown/daily tracking ──
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

  // Check persistent cooldown
  const status = await checkCooldown(userId, 'monetag', cooldownSec, dailyLimit);
  if (!status.allowed) {
    if (status.limitReached) {
      return res.status(429).json({ error: 'Daily limit reached', daily_limit: dailyLimit });
    }
    return res.status(429).json({ error: 'Cooldown', cooldown: status.remaining });
  }

  // Give reward + increment ads_watched
  await pool.query(
    `UPDATE users SET power = power + $1, ads_watched = COALESCE(ads_watched, 0) + 1 WHERE id = $2`,
    [rewardPower, userId]
  );

  // ── Activate referral on first monetag watch (atomic) ──
  const { rows: pendingRef } = await pool.query(
    `SELECT r.id, r.referrer_id FROM referrals r WHERE r.referee_id = $1 AND r.is_confirmed = FALSE`,
    [userId]
  );

  let refActivated = false;
  if (pendingRef.length > 0) {
    const ref = pendingRef[0];
    const referrerId = ref.referrer_id;

    // Atomic confirm — only one request can succeed
    const { rowCount } = await pool.query(
      `UPDATE referrals SET is_confirmed = TRUE WHERE id = $1 AND is_confirmed = FALSE`, [ref.id]
    );

    if (rowCount > 0) {
      const { rows: referrerRows } = await pool.query(
        `SELECT is_premium FROM users WHERE id = $1`, [referrerId]
      );
      const isPremium = referrerRows[0]?.is_premium;
      const refReward = isPremium
        ? (settings.ref_power_premium || 6000)
        : (settings.ref_power_normal || 3000);

      await pool.query(`UPDATE users SET power = power + $1 WHERE id = $2`, [refReward, referrerId]);
      await pool.query(
        `INSERT INTO referral_rewards (referrer_id, referee_id, reward_type, power_amount) VALUES ($1, $2, 'signup', $3) ON CONFLICT DO NOTHING`,
        [referrerId, userId, refReward]
      );

      refActivated = true;
      console.log(`✅ Referral activated via Monetag: referrer=${referrerId} +${refReward} POWER (user ${userId})`);
    }
  }

  console.log(`[Monetag] User ${userId} watched ad, +${rewardPower} POWER (${status.dailyCount}/${dailyLimit} today)`);
  res.json({ success: true, reward: rewardPower, cooldown: cooldownSec, ref_activated: refActivated, daily_count: status.dailyCount, daily_limit: dailyLimit });
});

router.get('/monetag-status', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key IN ('ad_cooldown_seconds', 'ad_daily_limit')`
  );
  const s = {};
  for (const r of rows) s[r.key] = parseFloat(r.value);
  const cooldownSec = s.ad_cooldown_seconds || 60;
  const dailyLimit = s.ad_daily_limit || 50;

  const status = await getCooldownStatus(req.user.id, 'monetag', cooldownSec, dailyLimit);

  res.json({ cooldown: status.cooldown, daily_count: status.dailyCount, daily_limit: dailyLimit });
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

// Create a task order (pay via TON wallet)
router.post('/order', authMiddleware, async (req, res) => {
  const { type, link, count, title } = req.body;
  if (!type || !link || !count) return res.status(400).json({ error: 'type, link, count required' });
  if (!['subscribe_channel', 'start_bot', 'link'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (count < 50 || count > 10000) return res.status(400).json({ error: 'Count must be 50-10000' });

  // For subscribe_channel — verify bot is admin in the channel
  if (type === 'subscribe_channel') {
    const chatId = extractChatId(link);
    if (!chatId) {
      return res.status(400).json({ error: 'bot_not_admin', message: 'Invite links not supported. Use channel username (e.g. https://t.me/channelname)' });
    }

    const token = process.env.BOT_TOKEN;
    if (token) {
      try {
        const botInfo = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
        const botId = botInfo.data?.result?.id;
        if (botId) {
          const { data } = await axios.get(
            `https://api.telegram.org/bot${token}/getChatMember`,
            { params: { chat_id: chatId, user_id: botId } }
          );
          const status = data?.result?.status;
          if (!['administrator', 'creator'].includes(status)) {
            return res.status(400).json({ error: 'bot_not_admin', message: 'Bot must be added as admin to the channel' });
          }
          console.log(`[TaskOrder] Bot is admin in ${chatId} ✅`);
        }
      } catch (e) {
        const desc = e.response?.data?.description || e.message;
        console.error(`[TaskOrder] Bot admin check failed for ${chatId}: ${desc}`);
        return res.status(400).json({ error: 'bot_not_admin', message: `Cannot access channel: ${desc}` });
      }
    }
  }


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

  // Cancel any existing pending order for this user
  await pool.query(
    `UPDATE pending_purchases SET status = 'cancelled'
     WHERE user_id = $1 AND status = 'pending' AND order_data IS NOT NULL`,
    [req.user.id]
  );

  // Generate unique memo
  const crypto = await import('crypto');
  let memo, attempts = 0;
  do {
    memo = crypto.default.randomBytes(6).toString('hex').toUpperCase();
    const { rows } = await pool.query(`SELECT id FROM pending_purchases WHERE memo = $1`, [memo]);
    if (!rows.length) break;
    attempts++;
  } while (attempts < 10);

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const orderData = JSON.stringify({ type, link, title: title || '', count, pricePerUser, rewardPower, totalPrice });

  const { rows } = await pool.query(
    `INSERT INTO pending_purchases (user_id, package_id, memo, ton_amount, expires_at, order_data)
     VALUES ($1, NULL, $2, $3, $4, $5) RETURNING *`,
    [req.user.id, memo, totalPrice, expiresAt, orderData]
  );

  console.log(`[TaskOrder] User ${req.user.id} created payment: ${totalPrice} TON memo=${memo} for ${count}x ${type}`);
  res.json({
    success: true,
    payment: {
      memo,
      amount: totalPrice,
      wallet: process.env.PAYMENT_WALLET,
      expires_at: expiresAt,
    }
  });
});

// Get user's own orders
router.get('/my-orders', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM task_orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// Get current pending order payment
router.get('/order-payment-status', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM pending_purchases
     WHERE user_id = $1 AND status = 'pending' AND order_data IS NOT NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [req.user.id]
  );
  if (!rows.length) return res.json(null);
  const p = rows[0];
  res.json({
    memo: p.memo,
    amount: parseFloat(p.ton_amount),
    wallet: process.env.PAYMENT_WALLET,
    expires_at: p.expires_at,
    order_data: p.order_data,
  });
});

// Manual check for order payment with persistent cooldown
router.post('/check-order-payment', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  
  // 30s persistent cooldown
  const status = await checkCooldown(userId, 'order_check', 30, 0);
  if (!status.allowed) {
    return res.status(429).json({ error: 'cooldown', wait: status.remaining });
  }

  try {
    const { checkPendingPayments } = await import('../services/payment.js');
    await checkPendingPayments();

    const { rows } = await pool.query(
      `SELECT status FROM pending_purchases
       WHERE user_id = $1 AND order_data IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const orderStatus = rows[0]?.status || null;
    res.json({ checked: true, status: orderStatus });
  } catch (e) {
    console.error('Order manual check error:', e.message);
    res.status(500).json({ error: 'Check failed' });
  }
});

// Cancel pending order payment
router.post('/cancel-order-payment', authMiddleware, async (req, res) => {
  await pool.query(
    `UPDATE pending_purchases SET status = 'cancelled'
     WHERE user_id = $1 AND status = 'pending' AND order_data IS NOT NULL`,
    [req.user.id]
  );
  res.json({ success: true });
});

export default router;
