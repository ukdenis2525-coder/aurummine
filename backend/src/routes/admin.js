import { Router } from 'express';
import { Api } from 'grammy';
import { pool } from '../db.js';

const tgApi = process.env.BOT_TOKEN ? new Api(process.env.BOT_TOKEN) : null;

const router = Router();

// Helper: get ALL admin TG IDs (env + DB)
const getAllAdminIds = async () => {
  // Env-based admins (super admins, cannot be removed via panel)
  const envIds = (process.env.ADMIN_TG_IDS || process.env.ADMIN_TG_ID || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  // DB-based admins
  try {
    const { rows } = await pool.query(`SELECT tg_id FROM admins`);
    const dbIds = rows.map(r => String(r.tg_id));
    // Merge unique
    return [...new Set([...envIds, ...dbIds])];
  } catch (e) {
    // Table may not exist yet
    return envIds;
  }
};

// Admin auth: either x-admin-key header OR Telegram user with matching tg_id (env + DB)
const adminMiddleware = async (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (key && key === process.env.ADMIN_KEY) return next();

  // TG-based admin auth
  const initData = req.headers['x-init-data'];
  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userParam = params.get('user');
      if (userParam) {
        const tgUser = JSON.parse(userParam);
        const adminIds = await getAllAdminIds();
        if (adminIds.includes(String(tgUser.id))) return next();
      }
    } catch (e) {}
  }

  return res.status(403).json({ error: 'Forbidden' });
};

router.use(adminMiddleware);

// ── Dashboard Stats ──
router.get('/stats', async (req, res) => {
  const [users, power, ton, pending, completed, revenue] = await Promise.all([
    pool.query(`SELECT COUNT(*) as total FROM users`),
    pool.query(`SELECT COALESCE(SUM(power), 0) as total FROM users`),
    pool.query(`SELECT COALESCE(SUM(ton_balance), 0) as total FROM users`),
    pool.query(`SELECT COUNT(*) as total FROM withdrawals WHERE status = 'pending'`),
    pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(ton_paid), 0) as sum FROM purchases`),
    pool.query(`SELECT COUNT(*) as total FROM users WHERE created_at > NOW() - INTERVAL '24 hours'`),
  ]);

  // Online counts (graceful if column doesn't exist)
  let online5 = 0, online60 = 0;
  try {
    const [r5, r60] = await Promise.all([
      pool.query(`SELECT COUNT(*) as c FROM users WHERE last_seen_at > NOW() - INTERVAL '5 minutes'`),
      pool.query(`SELECT COUNT(*) as c FROM users WHERE last_seen_at > NOW() - INTERVAL '1 hour'`),
    ]);
    online5 = parseInt(r5.rows[0].c);
    online60 = parseInt(r60.rows[0].c);
  } catch (e) {}

  // Referral & ads totals (graceful)
  let totalRefs = 0, totalAds = 0;
  try {
    const [refs, ads] = await Promise.all([
      pool.query(`SELECT COUNT(*) as c FROM referrals`),
      pool.query(`SELECT COALESCE(SUM(COALESCE(ads_watched, 0)), 0) as c FROM users`),
    ]);
    totalRefs = parseInt(refs.rows[0].c);
    totalAds = parseInt(ads.rows[0].c);
  } catch (e) {}

  res.json({
    total_users: parseInt(users.rows[0].total),
    total_power: parseFloat(power.rows[0].total),
    total_ton_balance: parseFloat(ton.rows[0].total),
    pending_withdrawals: parseInt(pending.rows[0].total),
    total_purchases: parseInt(completed.rows[0].total),
    total_revenue: parseFloat(completed.rows[0].sum),
    new_users_24h: parseInt(revenue.rows[0].total),
    online_5min: online5,
    online_1h: online60,
    total_referrals: totalRefs,
    total_ads_watched: totalAds,
  };

  // Finance analytics — banned purchases + project liability
  try {
    const [
      bannedPurchases,    // purchases made by currently blocked users
      totalBalances,      // all ton_balance across ALL users (potential liability)
      activeBalances,     // ton_balance of active (non-blocked) users only
      approvedWithdrawals,// already paid out
      pendingWithdrawals, // queued to be paid
      blockedCount,       // total blocked users
    ] = await Promise.all([
      pool.query(`
        SELECT COUNT(p.id) as count, COALESCE(SUM(p.ton_paid), 0) as sum
        FROM purchases p JOIN users u ON p.user_id = u.id WHERE u.is_blocked = true
      `),
      pool.query(`SELECT COALESCE(SUM(ton_balance), 0) as total FROM users`),
      pool.query(`SELECT COALESCE(SUM(ton_balance), 0) as total FROM users WHERE is_blocked = false`),
      pool.query(`SELECT COALESCE(SUM(ton_amount), 0) as total FROM withdrawals WHERE status = 'approved'`),
      pool.query(`SELECT COALESCE(SUM(ton_amount), 0) as total FROM withdrawals WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) as c FROM users WHERE is_blocked = true`),
    ]);

    stats.finance = {
      banned_users: parseInt(blockedCount.rows[0].c),
      banned_purchases_count: parseInt(bannedPurchases.rows[0].count),
      banned_purchases_ton: parseFloat(bannedPurchases.rows[0].sum),
      total_liability: parseFloat(totalBalances.rows[0].total),       // all balances
      active_liability: parseFloat(activeBalances.rows[0].total),     // only active users
      total_withdrawn: parseFloat(approvedWithdrawals.rows[0].total), // already paid
      pending_withdrawals_ton: parseFloat(pendingWithdrawals.rows[0].total),
      // Net = revenue - paid - pending - active balances
      net_position: parseFloat(completed.rows[0].sum) - parseFloat(approvedWithdrawals.rows[0].total) - parseFloat(pendingWithdrawals.rows[0].total),
    };
  } catch (e) {
    console.error('[Stats] Finance error:', e.message);
    stats.finance = null;
  }

  res.json(stats);
});

// ── Charts: hourly data for 24h ──
router.get('/stats/charts', async (req, res) => {
  try {
    // Generate 24-hour labels
    const hours = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(Date.now() - i * 3600000);
      hours.push({ hour: d.getHours(), start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()), end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1) });
    }
    const labels = hours.map(h => `${String(h.hour).padStart(2, '0')}:00`);

    // New users per hour
    let newUsers = new Array(24).fill(0);
    try {
      const { rows } = await pool.query(`
        SELECT DATE_TRUNC('hour', created_at) as h, COUNT(*) as c
        FROM users WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY h ORDER BY h
      `);
      rows.forEach(r => {
        const rh = new Date(r.h).getHours();
        const idx = hours.findIndex(h => h.hour === rh);
        if (idx >= 0) newUsers[idx] = parseInt(r.c);
      });
    } catch (e) {}

    // Active users per hour (from last_seen_at)
    let activeUsers = new Array(24).fill(0);
    try {
      const { rows } = await pool.query(`
        SELECT DATE_TRUNC('hour', last_seen_at) as h, COUNT(DISTINCT id) as c
        FROM users WHERE last_seen_at > NOW() - INTERVAL '24 hours'
        GROUP BY h ORDER BY h
      `);
      rows.forEach(r => {
        const rh = new Date(r.h).getHours();
        const idx = hours.findIndex(h => h.hour === rh);
        if (idx >= 0) activeUsers[idx] = parseInt(r.c);
      });
    } catch (e) {}

    // Online per hour snapshot (single query instead of 24 individual ones)
    let onlineUsers = new Array(24).fill(0);
    try {
      const { rows } = await pool.query(`
        SELECT DATE_TRUNC('hour', last_seen_at) as h, COUNT(*) as c
        FROM users WHERE last_seen_at > NOW() - INTERVAL '24 hours'
        GROUP BY h ORDER BY h
      `);
      rows.forEach(r => {
        const rh = new Date(r.h).getHours();
        const idx = hours.findIndex(h => h.hour === rh);
        if (idx >= 0) onlineUsers[idx] = parseInt(r.c);
      });
    } catch (e) {}

    // Purchases per hour
    let purchases = new Array(24).fill(0);
    try {
      const { rows } = await pool.query(`
        SELECT DATE_TRUNC('hour', created_at) as h, COUNT(*) as c
        FROM purchases WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY h ORDER BY h
      `);
      rows.forEach(r => {
        const rh = new Date(r.h).getHours();
        const idx = hours.findIndex(h => h.hour === rh);
        if (idx >= 0) purchases[idx] = parseInt(r.c);
      });
    } catch (e) {}

    res.json({ labels, newUsers, activeUsers, onlineUsers, purchases });
  } catch (e) {
    console.error('[Admin] Charts error:', e.message);
    res.status(500).json({ error: 'Charts failed' });
  }
});

// ── Top users by stat ──
router.get('/stats/top', async (req, res) => {
  const field = req.query.field || 'ton_balance';
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  try {
    let rows;
    if (field === 'purchases') {
      // Users by total purchase amount
      const result = await pool.query(`
        SELECT u.id, u.tg_id, u.username, u.first_name, u.power, u.ton_balance, u.is_premium,
               COUNT(p.id) as purchase_count, COALESCE(SUM(p.ton_paid), 0) as total_spent
        FROM users u
        JOIN purchases p ON p.user_id = u.id
        GROUP BY u.id
        ORDER BY total_spent DESC
        LIMIT $1
      `, [limit]);
      rows = result.rows.map(r => ({ ...r, sort_value: parseFloat(r.total_spent), extra: `${r.purchase_count} покупок` }));
    } else if (field === 'revenue') {
      // Same as purchases but labeled differently
      const result = await pool.query(`
        SELECT u.id, u.tg_id, u.username, u.first_name, u.power, u.ton_balance, u.is_premium,
               COUNT(p.id) as purchase_count, COALESCE(SUM(p.ton_paid), 0) as total_spent
        FROM users u
        JOIN purchases p ON p.user_id = u.id
        GROUP BY u.id
        ORDER BY total_spent DESC
        LIMIT $1
      `, [limit]);
      rows = result.rows.map(r => ({ ...r, sort_value: parseFloat(r.total_spent), extra: `${parseFloat(r.total_spent).toFixed(4)} TON` }));
    } else if (field === 'referrals') {
      // Users by referral count
      const result = await pool.query(`
        SELECT u.id, u.tg_id, u.username, u.first_name, u.power, u.ton_balance, u.is_premium,
               COUNT(r.id) as ref_count,
               COUNT(r.id) FILTER (WHERE r.is_confirmed = TRUE) as confirmed_refs
        FROM users u
        JOIN referrals r ON r.referrer_id = u.id
        GROUP BY u.id
        ORDER BY ref_count DESC
        LIMIT $1
      `, [limit]);
      rows = result.rows.map(r => ({ ...r, sort_value: parseInt(r.ref_count), extra: `${r.ref_count} рефералов (${r.confirmed_refs} ✅)` }));
    } else if (field === 'ads_watched') {
      // Users by total ads watched
      const result = await pool.query(`
        SELECT id, tg_id, username, first_name, power, ton_balance, is_premium, COALESCE(ads_watched, 0) as ads_watched
        FROM users
        WHERE COALESCE(ads_watched, 0) > 0
        ORDER BY ads_watched DESC
        LIMIT $1
      `, [limit]);
      rows = result.rows.map(r => ({ ...r, sort_value: parseInt(r.ads_watched), extra: `${r.ads_watched} просмотров` }));
    } else {
      // Direct field sort (ton_balance, power)
      const allowed = ['ton_balance', 'power', 'hashes'];
      const col = allowed.includes(field) ? field : 'ton_balance';
      const result = await pool.query(`
        SELECT id, tg_id, username, first_name, power, ton_balance, is_premium
        FROM users
        WHERE ${col} > 0
        ORDER BY ${col} DESC
        LIMIT $1
      `, [limit]);
      rows = result.rows.map(r => ({ ...r, sort_value: parseFloat(r[col]) }));
    }
    res.json(rows);
  } catch (e) {
    console.error('[Admin] Stats top error:', e.message);
    res.status(500).json({ error: 'Failed' });
  }
});

// ── Users ──
router.get('/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const search = req.query.search || '';
  const limit = 30;
  const offset = (page - 1) * limit;

  let where = '';
  let params = [limit, offset];
  if (search) {
    where = `WHERE username ILIKE $3 OR first_name ILIKE $3 OR CAST(tg_id AS TEXT) LIKE $3`;
    params.push(`%${search}%`);
  }

  const { rows } = await pool.query(
    `SELECT id, tg_id, username, first_name, power, hashes, ton_balance, is_premium, is_blocked, created_at
     FROM users ${where} ORDER BY id DESC LIMIT $1 OFFSET $2`, params
  );
  const countWhere = search ? `WHERE username ILIKE $1 OR first_name ILIKE $1 OR CAST(tg_id AS TEXT) LIKE $1` : '';
  const { rows: count } = await pool.query(`SELECT COUNT(*) FROM users ${countWhere}`, search ? [`%${search}%`] : []);
  res.json({ users: rows, total: parseInt(count[0].count), page });
});

router.post('/users/:id/adjust', async (req, res) => {
  const { power, ton_balance } = req.body;
  const fields = [];
  const vals = [];
  let idx = 1;
  if (power !== undefined) { fields.push(`power = $${idx++}`); vals.push(power); }
  if (ton_balance !== undefined) { fields.push(`ton_balance = $${idx++}`); vals.push(ton_balance); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
  res.json({ success: true });
});

// ── User Details ──
router.get('/users/:id/details', async (req, res) => {
  const uid = req.params.id;
  const [user, purchases, referrals, rewards, withdrawals, pendingOrders] = await Promise.all([
    pool.query(`SELECT * FROM users WHERE id = $1`, [uid]),
    pool.query(
      `SELECT p.id, p.ton_paid, p.power_amount, p.created_at, pp.name as package_name
       FROM purchases p LEFT JOIN power_packages pp ON pp.id = p.package_id
       WHERE p.user_id = $1 ORDER BY p.created_at DESC`, [uid]
    ),
    pool.query(
      `SELECT r.id, r.is_confirmed, r.created_at, u.tg_id, u.username, u.first_name
       FROM referrals r JOIN users u ON u.id = r.referee_id
       WHERE r.referrer_id = $1 ORDER BY r.created_at DESC`, [uid]
    ),
    pool.query(
      `SELECT COALESCE(SUM(power_amount), 0) as total_power,
              COALESCE(SUM(ton_amount), 0) as total_ton
       FROM referral_rewards WHERE referrer_id = $1`, [uid]
    ),
    pool.query(
      `SELECT id, ton_amount, status, wallet_address, created_at
       FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC`, [uid]
    ),
    pool.query(
      `SELECT id, ton_amount, status, memo, created_at
       FROM pending_purchases WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [uid]
    ),
  ]);
  if (!user.rows.length) return res.status(404).json({ error: 'User not found' });

  // Referrer info
  let referrer = null;
  if (user.rows[0].ref_id) {
    const { rows } = await pool.query(
      `SELECT id, tg_id, username, first_name FROM users WHERE id = $1`, [user.rows[0].ref_id]
    );
    if (rows.length) referrer = rows[0];
  }

  res.json({
    user: user.rows[0],
    referrer,
    purchases: purchases.rows,
    purchases_total: purchases.rows.reduce((s, p) => s + parseFloat(p.ton_paid || 0), 0),
    referrals: referrals.rows,
    referral_rewards: rewards.rows[0],
    withdrawals: withdrawals.rows,
    withdrawals_total: withdrawals.rows
      .filter(w => w.status === 'completed')
      .reduce((s, w) => s + parseFloat(w.ton_amount || 0), 0),
    pending_orders: pendingOrders.rows,
  });
});

// ── Block / Unblock User ──
router.post('/users/:id/block', async (req, res) => {
  const { blocked } = req.body;
  const userId = req.params.id;
  await pool.query(`UPDATE users SET is_blocked = $1 WHERE id = $2`, [!!blocked, userId]);

  // Auto-manage IP blacklist
  try {
    // Collect all IPs for this user
    const ips = new Set();
    const { rows: r1 } = await pool.query(`SELECT last_ip FROM users WHERE id = $1 AND last_ip IS NOT NULL AND last_ip != ''`, [userId]);
    if (r1.length && r1[0].last_ip) ips.add(r1[0].last_ip);
    const { rows: r2 } = await pool.query(`SELECT DISTINCT ip FROM user_ips WHERE user_id = $1`, [userId]);
    r2.forEach(r => ips.add(r.ip));

    if (blocked) {
      // Add all user IPs to blacklist
      for (const ip of ips) {
        await pool.query(
          `INSERT INTO ip_blacklist (ip, reason) VALUES ($1, $2) ON CONFLICT (ip) DO NOTHING`,
          [ip, `User #${userId} blocked`]
        );
      }
    } else {
      // Remove user IPs from blacklist (only if no other blocked users share the IP)
      for (const ip of ips) {
        const { rows: others } = await pool.query(
          `SELECT COUNT(*) as c FROM users WHERE is_blocked = true AND id != $1 AND (last_ip = $2 OR id IN (SELECT user_id FROM user_ips WHERE ip = $2))`,
          [userId, ip]
        );
        if (parseInt(others[0].c) === 0) {
          await pool.query(`DELETE FROM ip_blacklist WHERE ip = $1`, [ip]);
        }
      }
    }
  } catch (e) { console.error('[Block] IP blacklist error:', e.message); }

  res.json({ success: true, is_blocked: !!blocked });
});

// ── Delete User ──
router.delete('/users/:id', async (req, res) => {
  const uid = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Cascade delete all related data
    await client.query(`DELETE FROM referral_rewards WHERE referrer_id = $1 OR referee_id = $1`, [uid]);
    await client.query(`DELETE FROM referrals WHERE referrer_id = $1 OR referee_id = $1`, [uid]);
    await client.query(`DELETE FROM user_tasks WHERE user_id = $1`, [uid]);
    await client.query(`DELETE FROM mining_log WHERE user_id = $1`, [uid]);
    await client.query(`DELETE FROM pending_purchases WHERE user_id = $1`, [uid]);
    await client.query(`DELETE FROM purchases WHERE user_id = $1`, [uid]);
    await client.query(`DELETE FROM withdrawals WHERE user_id = $1`, [uid]);
    // Unlink referrals pointing to this user
    await client.query(`UPDATE users SET ref_id = NULL WHERE ref_id = $1`, [uid]);
    await client.query(`DELETE FROM users WHERE id = $1`, [uid]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Delete user error:', e);
    res.status(500).json({ error: 'Failed to delete user' });
  } finally { client.release(); }
});

// ── Withdrawals ──
router.get('/withdrawals', async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT w.*, u.tg_id, u.username, u.first_name
     FROM withdrawals w JOIN users u ON u.id = w.user_id
     WHERE w.status = $1 ORDER BY w.created_at DESC LIMIT 50`, [status]
  );
  res.json(rows);
});

router.post('/withdrawals/:id/approve', async (req, res) => {
  const { tx_hash } = req.body;
  await pool.query(
    `UPDATE withdrawals SET status = 'completed', tx_hash = $1 WHERE id = $2`,
    [tx_hash || 'manual', req.params.id]
  );
  res.json({ success: true });
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM withdrawals WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const w = rows[0];
    await client.query(`UPDATE withdrawals SET status = 'rejected' WHERE id = $1`, [w.id]);
    await client.query(`UPDATE users SET ton_balance = ton_balance + $1 WHERE id = $2`, [w.ton_amount, w.user_id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed' });
  } finally { client.release(); }
});

// ── Tasks CRUD ──
router.get('/tasks', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM tasks ORDER BY id DESC`);
  res.json(rows);
});

router.post('/tasks', async (req, res) => {
  const { title, description, reward_power, type, link, visibility } = req.body;
  if (!title || !reward_power) return res.status(400).json({ error: 'title and reward_power required' });
  const { rows } = await pool.query(
    `INSERT INTO tasks (title, description, reward_power, type, link, visibility) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [title, description || '', reward_power, type || 'other', link || '', visibility || 'admin']
  );
  res.json(rows[0]);
});

router.post('/tasks/:id/toggle', async (req, res) => {
  await pool.query(`UPDATE tasks SET is_active = NOT is_active WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

router.post('/tasks/:id/visibility', async (req, res) => {
  const { visibility } = req.body; // 'all' or 'admin'
  if (!['all', 'admin'].includes(visibility)) return res.status(400).json({ error: 'Invalid visibility' });
  await pool.query(`UPDATE tasks SET visibility = $1 WHERE id = $2`, [visibility, req.params.id]);
  res.json({ success: true });
});

router.delete('/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM user_tasks WHERE task_id = $1`, [taskId]);
    await client.query(`UPDATE task_orders SET task_id = NULL WHERE task_id = $1`, [taskId]);
    await client.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[Admin] Task delete error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── Task Orders Management ──
router.get('/task-orders', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.*, u.username, u.first_name, u.tg_id
     FROM task_orders o
     JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC`
  );
  res.json(rows);
});

router.post('/task-orders/:id/approve', async (req, res) => {
  const orderId = req.params.id;
  const { rows: orders } = await pool.query(`SELECT * FROM task_orders WHERE id = $1 AND status = 'pending'`, [orderId]);
  if (!orders.length) return res.status(404).json({ error: 'Order not found or already processed' });

  const order = orders[0];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create task from order
    const typeLabels = { subscribe_channel: '📢 Подписка', start_bot: '🤖 Запуск бота', link: '🔗 Переход' };
    const taskTitle = order.title || `${typeLabels[order.type] || order.type}`;

    const { rows: taskRows } = await client.query(
      `INSERT INTO tasks (title, description, reward_power, type, link, is_active, visibility, creator_id, max_completions, completed_count, order_id)
       VALUES ($1, $2, $3, $4, $5, TRUE, 'all', $6, $7, 0, $8) RETURNING id`,
      [taskTitle, `${order.max_completions} users`, order.reward_power, order.type, order.link, order.user_id, order.max_completions, orderId]
    );

    // Update order status
    await client.query(
      `UPDATE task_orders SET status = 'active', task_id = $1 WHERE id = $2`,
      [taskRows[0].id, orderId]
    );

    await client.query('COMMIT');
    res.json({ success: true, task_id: taskRows[0].id });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[TaskOrder] Approve error:', e);
    res.status(500).json({ error: 'Approval failed' });
  } finally {
    client.release();
  }
});

router.post('/task-orders/:id/reject', async (req, res) => {
  const orderId = req.params.id;
  const { rows: orders } = await pool.query(`SELECT * FROM task_orders WHERE id = $1 AND status = 'pending'`, [orderId]);
  if (!orders.length) return res.status(404).json({ error: 'Order not found or already processed' });

  const order = orders[0];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Refund user
    await client.query(`UPDATE users SET ton_balance = ton_balance + $1 WHERE id = $2`, [order.total_paid, order.user_id]);
    await client.query(`UPDATE task_orders SET status = 'rejected' WHERE id = $1`, [orderId]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Rejection failed' });
  } finally {
    client.release();
  }
});

router.delete('/task-orders/:id', async (req, res) => {
  const orderId = req.params.id;
  const { rows } = await pool.query(`SELECT * FROM task_orders WHERE id = $1`, [orderId]);
  if (!rows.length) return res.status(404).json({ error: 'Order not found' });

  const order = rows[0];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (order.task_id) {
      // Delete user completions first, then the task itself
      await client.query(`DELETE FROM user_tasks WHERE task_id = $1`, [order.task_id]);
      await client.query(`DELETE FROM tasks WHERE id = $1`, [order.task_id]);
    }
    await client.query(`DELETE FROM task_orders WHERE id = $1`, [orderId]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[TaskOrder] Delete error:', e);
    res.status(500).json({ error: 'Delete failed' });
  } finally {
    client.release();
  }
});

// ── Packages ──
router.get('/packages', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM power_packages ORDER BY power_amount ASC`);
  res.json(rows);
});

router.post('/packages', async (req, res) => {
  const { name, power_amount, price_ton } = req.body;
  if (!name || !power_amount || !price_ton) return res.status(400).json({ error: 'All fields required' });
  const { rows } = await pool.query(
    `INSERT INTO power_packages (name, power_amount, price_ton) VALUES ($1, $2, $3) RETURNING *`,
    [name, power_amount, price_ton]
  );
  res.json(rows[0]);
});

router.post('/packages/:id/toggle', async (req, res) => {
  await pool.query(`UPDATE power_packages SET is_active = NOT is_active WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

router.put('/packages/:id', async (req, res) => {
  const { name, power_amount, price_ton } = req.body;
  if (!name || !power_amount || !price_ton) return res.status(400).json({ error: 'All fields required' });
  const { rows } = await pool.query(
    `UPDATE power_packages SET name = $1, power_amount = $2, price_ton = $3 WHERE id = $4 RETURNING *`,
    [name, power_amount, price_ton, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Package not found' });
  res.json(rows[0]);
});

router.delete('/packages/:id', async (req, res) => {
  // Check if any purchases reference this package
  const { rows: refs } = await pool.query(
    `SELECT COUNT(*) as cnt FROM purchases WHERE package_id = $1`, [req.params.id]
  );
  if (parseInt(refs[0].cnt) > 0) {
    // Soft-deactivate instead of hard delete if there are purchases
    await pool.query(`UPDATE power_packages SET is_active = FALSE WHERE id = $1`, [req.params.id]);
    return res.json({ success: true, soft: true, message: 'Package deactivated (has purchases)' });
  }
  await pool.query(`DELETE FROM power_packages WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

// ── Ad Settings ──
router.get('/ad-settings', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT key, value, label FROM app_settings WHERE key LIKE 'ad_%' OR key LIKE 'adsgram_%' OR key LIKE 'monetag_%' OR key LIKE 'richads_%' OR key LIKE 'order_%' ORDER BY key`
  );
  res.json(rows);
});

router.put('/ad-settings', async (req, res) => {
  const { settings } = req.body;
  if (!Array.isArray(settings)) return res.status(400).json({ error: 'settings array required' });
  for (const s of settings) {
    if (!s.key || s.value === undefined) continue;
    await pool.query(
      `INSERT INTO app_settings (key, value, label)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [s.key, String(s.value), s.label || s.key]
    );
  }
  res.json({ success: true });
});

router.post('/ad-settings', async (req, res) => {
  const { settings } = req.body;
  if (!Array.isArray(settings)) return res.status(400).json({ error: 'settings array required' });
  for (const s of settings) {
    if (!s.key || s.value === undefined) continue;
    await pool.query(
      `INSERT INTO app_settings (key, value, label)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [s.key, String(s.value), s.label || s.key]
    );
  }
  res.json({ success: true });
});

// ── Referral Settings ──
router.get('/ref-settings', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT key, value, label FROM app_settings WHERE key LIKE 'ref_%' ORDER BY key`
  );
  res.json(rows);
});

router.put('/ref-settings', async (req, res) => {
  const { settings } = req.body;
  if (!Array.isArray(settings)) return res.status(400).json({ error: 'settings array required' });
  for (const s of settings) {
    if (!s.key || s.value === undefined) continue;
    await pool.query(
      `INSERT INTO app_settings (key, value, label)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [s.key, String(s.value), s.label || s.key]
    );
  }
  res.json({ success: true });
});

// ── Referral Stats (admin overview) ──
router.get('/ref-stats', async (req, res) => {
  const [totalRefs, confirmedRefs, totalPowerGiven, totalTonGiven] = await Promise.all([
    pool.query(`SELECT COUNT(*) as cnt FROM referrals`),
    pool.query(`SELECT COUNT(*) as cnt FROM referrals WHERE is_confirmed = TRUE`),
    pool.query(`SELECT COALESCE(SUM(power_amount), 0) as total FROM referral_rewards WHERE reward_type = 'power'`),
    pool.query(`SELECT COALESCE(SUM(ton_amount), 0) as total FROM referral_rewards WHERE reward_type = 'commission'`),
  ]);
  // Top referrers
  const { rows: topReferrers } = await pool.query(
    `SELECT u.id, u.tg_id, u.username, u.first_name,
            COUNT(r.id) as ref_count,
            COALESCE(SUM(CASE WHEN r.is_confirmed THEN 1 ELSE 0 END), 0) as confirmed_count
     FROM users u
     JOIN referrals r ON r.referrer_id = u.id
     GROUP BY u.id
     ORDER BY ref_count DESC
     LIMIT 10`
  );
  res.json({
    total_referrals: parseInt(totalRefs.rows[0].cnt),
    confirmed_referrals: parseInt(confirmedRefs.rows[0].cnt),
    total_power_given: parseFloat(totalPowerGiven.rows[0].total),
    total_ton_given: parseFloat(totalTonGiven.rows[0].total),
    top_referrers: topReferrers,
  });
});

// ── Broadcast to Users (async — returns immediately, sends in background) ──
let broadcastState = { status: 'idle', total: 0, sent: 0, failed: 0, blocked_auto: 0, errors: [], startedAt: null };

router.post('/broadcast', async (req, res) => {
  const { message, parse_mode } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });
  if (!tgApi) return res.status(500).json({ error: 'BOT_TOKEN not configured' });
  if (broadcastState.status === 'sending') {
    return res.status(409).json({ error: `Рассылка уже идёт (${broadcastState.sent}/${broadcastState.total})` });
  }

  try {
    // Exclude admin-blocked AND bot-blocked users
    const { rows } = await pool.query(`SELECT id, tg_id FROM users WHERE is_blocked = false AND COALESCE(bot_blocked, false) = false`);
    const users = rows.map(r => ({ id: r.id, tgId: String(r.tg_id) }));

    // Count how many were skipped due to bot_blocked
    const { rows: blockedRows } = await pool.query(`SELECT COUNT(*) as c FROM users WHERE bot_blocked = true`);
    const blockedSkipped = parseInt(blockedRows[0].c);

    if (!users.length) return res.json({ success: true, total: 0, sent: 0, failed: 0, blocked_skipped: blockedSkipped });

    // Reset state & respond immediately
    broadcastState = { status: 'sending', total: users.length, sent: 0, failed: 0, blocked_auto: 0, blocked_skipped: blockedSkipped, errors: [], startedAt: Date.now() };
    res.json({ success: true, status: 'started', total: users.length, blocked_skipped: blockedSkipped });

    // Build sendMessage options
    const msgOpts = { disable_web_page_preview: true };
    if (parse_mode && parse_mode.trim()) {
      msgOpts.parse_mode = parse_mode.trim();
    }

    // Send in background (fire-and-forget)
    (async () => {
      for (let i = 0; i < users.length; i++) {
        try {
          await tgApi.sendMessage(users[i].tgId, message.trim(), msgOpts);
          broadcastState.sent++;
        } catch (e) {
          broadcastState.failed++;
          const errMsg = (e.message || '').toLowerCase();
          // Auto-detect blocked/deactivated users → mark as bot_blocked
          if (errMsg.includes('forbidden') || errMsg.includes('deactivated') || errMsg.includes('blocked') || errMsg.includes('chat not found')) {
            try {
              await pool.query(`UPDATE users SET bot_blocked = true WHERE id = $1`, [users[i].id]);
              broadcastState.blocked_auto++;
            } catch (dbErr) {}
          }
          if (broadcastState.errors.length < 5) broadcastState.errors.push(`TG:${users[i].tgId} → ${e.message}`);
        }
        if ((i + 1) % 25 === 0) await new Promise(r => setTimeout(r, 1000));
      }
      broadcastState.status = 'done';
      console.log(`[Broadcast] Done: ${broadcastState.sent}/${broadcastState.total} sent, ${broadcastState.failed} failed, ${broadcastState.blocked_auto} auto-blocked`);
    })().catch(e => {
      broadcastState.status = 'error';
      broadcastState.errors.push('Fatal: ' + e.message);
      console.error('[Broadcast] Fatal error:', e.message);
    });

  } catch (e) {
    console.error('[Admin] Broadcast error:', e.message);
    res.status(500).json({ error: 'Broadcast failed: ' + e.message });
  }
});

// Poll broadcast progress
router.get('/broadcast/status', async (req, res) => {
  res.json(broadcastState);
});

// View bot_blocked stats
router.get('/broadcast/blocked', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, tg_id, username, first_name, bot_blocked, created_at
      FROM users WHERE bot_blocked = true ORDER BY created_at DESC LIMIT 100
    `);
    res.json({ total: rows.length, users: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset bot_blocked for all users (re-enable for next broadcast)
router.post('/broadcast/reset-blocked', async (req, res) => {
  try {
    const { rowCount } = await pool.query(`UPDATE users SET bot_blocked = false WHERE bot_blocked = true`);
    res.json({ success: true, reset: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Multi-Account Detection ──
router.get('/multi-accounts', async (req, res) => {
  try {
    const adminIds = await getAllAdminIds();
    const ipGroups = new Map(); // ip -> Set of user_ids

    // Source 1: user_ips table (history)
    try {
      const { rows } = await pool.query(`
        SELECT ip, ARRAY_AGG(DISTINCT user_id) as user_ids
        FROM user_ips
        GROUP BY ip
        HAVING COUNT(DISTINCT user_id) >= 2
        ORDER BY COUNT(DISTINCT user_id) DESC
        LIMIT 100
      `);
      rows.forEach(r => {
        const set = ipGroups.get(r.ip) || new Set();
        r.user_ids.forEach(id => set.add(id));
        ipGroups.set(r.ip, set);
      });
    } catch (e) {}

    // Source 2: users.last_ip (real-time)
    try {
      const { rows } = await pool.query(`
        SELECT last_ip, ARRAY_AGG(id) as user_ids
        FROM users
        WHERE last_ip IS NOT NULL AND last_ip != ''
        GROUP BY last_ip
        HAVING COUNT(*) >= 2
        ORDER BY COUNT(*) DESC
        LIMIT 100
      `);
      rows.forEach(r => {
        const set = ipGroups.get(r.last_ip) || new Set();
        r.user_ids.forEach(id => set.add(id));
        ipGroups.set(r.last_ip, set);
      });
    } catch (e) {}

    // Filter: only groups with 2+ users
    const filtered = [...ipGroups.entries()]
      .filter(([, ids]) => ids.size >= 2)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 50);

    if (!filtered.length) return res.json({ active: [], blocked: [] });

    // Fetch all user details + referrer info
    const allUserIds = [...new Set(filtered.flatMap(([, ids]) => [...ids]))];
    const { rows: users } = await pool.query(
      `SELECT u.id, u.tg_id, u.username, u.first_name, u.power, u.ton_balance, u.is_premium, u.is_blocked, u.created_at, u.ref_id,
              r.tg_id AS ref_tg_id, r.username AS ref_username, r.first_name AS ref_first_name
       FROM users u LEFT JOIN users r ON u.ref_id = r.id
       WHERE u.id = ANY($1::INT[])`,
      [allUserIds]
    );
    const usersMap = {};
    users.forEach(u => {
      u.is_admin = adminIds.includes(String(u.tg_id));
      usersMap[u.id] = u;
    });

    // Get blacklisted IPs
    let blacklistedIps = new Set();
    try {
      const { rows: blRows } = await pool.query(`SELECT ip FROM ip_blacklist`);
      blRows.forEach(r => blacklistedIps.add(r.ip));
    } catch (e) {}

    const active = [];
    const blocked = [];

    filtered.forEach(([ip, ids]) => {
      const groupUsers = [...ids].map(id => usersMap[id]).filter(Boolean);
      const hasAdmin = groupUsers.some(u => u.is_admin);
      const allBlocked = groupUsers.every(u => u.is_blocked);
      const isBlacklisted = blacklistedIps.has(ip);
      const group = { ip, user_count: groupUsers.length, has_admin: hasAdmin, is_blacklisted: isBlacklisted, users: groupUsers };

      if (allBlocked || isBlacklisted) {
        blocked.push(group);
      } else {
        active.push(group);
      }
    });

    res.json({ active, blocked });
  } catch (e) {
    console.error('[Admin] Multi-account check error:', e.message);
    res.status(500).json({ error: 'Failed to check multi-accounts' });
  }
});

// Block entire IP group (all non-admin users + blacklist IP)
router.post('/multi-accounts/block-group', async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP required' });

  try {
    const adminIds = await getAllAdminIds();

    // Find all users from this IP
    const { rows: ipUsers } = await pool.query(
      `SELECT DISTINCT u.id, u.tg_id FROM users u
       LEFT JOIN user_ips ui ON u.id = ui.user_id
       WHERE u.last_ip = $1 OR ui.ip = $1`, [ip]
    );

    let blockedCount = 0;
    for (const u of ipUsers) {
      if (!adminIds.includes(String(u.tg_id))) {
        await pool.query(`UPDATE users SET is_blocked = true WHERE id = $1`, [u.id]);
        blockedCount++;
      }
    }

    // Add IP to blacklist
    await pool.query(
      `INSERT INTO ip_blacklist (ip, reason) VALUES ($1, $2) ON CONFLICT (ip) DO NOTHING`,
      [ip, `Multi-account group block (${blockedCount} users)`]
    );

    res.json({ success: true, blocked_users: blockedCount, ip });
  } catch (e) {
    console.error('[Admin] Block group error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Unblock IP group (unblock users + remove from blacklist)
router.post('/multi-accounts/unblock-group', async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP required' });

  try {
    // Unblock users with this IP
    const { rowCount } = await pool.query(
      `UPDATE users SET is_blocked = false WHERE id IN (
        SELECT DISTINCT u.id FROM users u
        LEFT JOIN user_ips ui ON u.id = ui.user_id
        WHERE u.last_ip = $1 OR ui.ip = $1
      )`, [ip]
    );

    // Remove from blacklist
    await pool.query(`DELETE FROM ip_blacklist WHERE ip = $1`, [ip]);

    res.json({ success: true, unblocked_users: rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── IP Blacklist ──
router.get('/ip-blacklist', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ip_blacklist ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ip-blacklist', async (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP required' });
  try {
    await pool.query(
      `INSERT INTO ip_blacklist (ip, reason) VALUES ($1, $2) ON CONFLICT (ip) DO NOTHING`,
      [ip.trim(), reason || 'Manual']
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/ip-blacklist/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM ip_blacklist WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin Management ──
router.get('/admins', async (req, res) => {
  // Env-based super admins
  const envIds = (process.env.ADMIN_TG_IDS || process.env.ADMIN_TG_ID || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  // DB-based admins
  let dbAdmins = [];
  try {
    const { rows } = await pool.query(`SELECT * FROM admins ORDER BY created_at DESC`);
    dbAdmins = rows;
  } catch (e) {}

  // Enrich with user info from users table
  const allIds = [...new Set([...envIds, ...dbAdmins.map(a => String(a.tg_id))])];
  let usersMap = {};
  if (allIds.length) {
    try {
      const { rows } = await pool.query(
        `SELECT tg_id, username, first_name FROM users WHERE tg_id = ANY($1::BIGINT[])`,
        [allIds]
      );
      rows.forEach(u => { usersMap[String(u.tg_id)] = u; });
    } catch (e) {}
  }

  // Build response
  const admins = allIds.map(tgId => {
    const dbEntry = dbAdmins.find(a => String(a.tg_id) === tgId);
    const userInfo = usersMap[tgId];
    let permissions = [];
    try { permissions = JSON.parse(dbEntry?.permissions || '[]'); } catch (e) {}
    return {
      tg_id: tgId,
      label: dbEntry?.label || null,
      username: userInfo?.username || null,
      first_name: userInfo?.first_name || null,
      is_env: envIds.includes(tgId),
      permissions: envIds.includes(tgId) ? '*' : permissions,
      added_by: dbEntry?.added_by ? String(dbEntry.added_by) : null,
      created_at: dbEntry?.created_at || null,
    };
  });

  res.json(admins);
});

router.post('/admins', async (req, res) => {
  const { tg_id, label, permissions } = req.body;
  if (!tg_id) return res.status(400).json({ error: 'tg_id required' });

  // Get the requester's tg_id for added_by
  let addedBy = null;
  const initData = req.headers['x-init-data'];
  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userParam = params.get('user');
      if (userParam) addedBy = JSON.parse(userParam).id;
    } catch (e) {}
  }

  const permsJson = JSON.stringify(Array.isArray(permissions) ? permissions : []);

  try {
    await pool.query(
      `INSERT INTO admins (tg_id, label, permissions, added_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tg_id) DO UPDATE SET label = $2, permissions = $3`,
      [String(tg_id), label || null, permsJson, addedBy]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[Admin] Add admin error:', e.message);
    res.status(500).json({ error: 'Failed to add admin' });
  }
});

router.delete('/admins/:tg_id', async (req, res) => {
  const targetId = req.params.tg_id;

  // Cannot remove env-based super admins
  const envIds = (process.env.ADMIN_TG_IDS || process.env.ADMIN_TG_ID || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (envIds.includes(targetId)) {
    return res.status(400).json({ error: 'Cannot remove env-based super admin' });
  }

  // Prevent removing yourself
  const initData = req.headers['x-init-data'];
  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userParam = params.get('user');
      if (userParam) {
        const reqUser = JSON.parse(userParam);
        if (String(reqUser.id) === targetId) {
          return res.status(400).json({ error: 'Cannot remove yourself' });
        }
      }
    } catch (e) {}
  }

  try {
    await pool.query(`DELETE FROM admins WHERE tg_id = $1`, [targetId]);
    res.json({ success: true });
  } catch (e) {
    console.error('[Admin] Remove admin error:', e.message);
    res.status(500).json({ error: 'Failed to remove admin' });
  }
});

// Update admin permissions
router.put('/admins/:tg_id/permissions', async (req, res) => {
  const targetId = req.params.tg_id;
  const { permissions } = req.body;

  // Cannot change env-based super admin permissions
  const envIds = (process.env.ADMIN_TG_IDS || process.env.ADMIN_TG_ID || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (envIds.includes(targetId)) {
    return res.status(400).json({ error: 'Cannot change super admin permissions' });
  }

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions must be an array' });
  }

  try {
    await pool.query(
      `UPDATE admins SET permissions = $1 WHERE tg_id = $2`,
      [JSON.stringify(permissions), targetId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[Admin] Update permissions error:', e.message);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// Check if current user is admin + return their permissions
router.get('/check-admin', async (req, res) => {
  // If we got here, middleware already passed — user IS admin
  // Get the user's tg_id to return their permissions
  const envIds = (process.env.ADMIN_TG_IDS || process.env.ADMIN_TG_ID || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  let tgId = null;
  const initData = req.headers['x-init-data'];
  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userParam = params.get('user');
      if (userParam) tgId = String(JSON.parse(userParam).id);
    } catch (e) {}
  }

  // Super admins have all permissions
  if (tgId && envIds.includes(tgId)) {
    return res.json({ isAdmin: true, permissions: '*' });
  }

  // DB admin — get their permissions
  if (tgId) {
    try {
      const { rows } = await pool.query(`SELECT permissions FROM admins WHERE tg_id = $1`, [tgId]);
      if (rows.length) {
        let perms = [];
        try { perms = JSON.parse(rows[0].permissions || '[]'); } catch (e) {}
        return res.json({ isAdmin: true, permissions: perms });
      }
    } catch (e) {}
  }

  res.json({ isAdmin: true, permissions: [] });
});

// ══════════════════════════════════════════════════
// PROMO CODES MANAGEMENT
// ══════════════════════════════════════════════════

// List all promo codes
router.get('/promo-codes', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM promo_codes ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// Create promo code
router.post('/promo-codes', async (req, res) => {
  const { code, discount_pct, max_uses, expires_at } = req.body;
  if (!code || !discount_pct) return res.status(400).json({ error: 'code and discount_pct required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO promo_codes (code, discount_pct, max_uses, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [code.trim().toUpperCase(), discount_pct, max_uses || 0, expires_at || null]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Промокод уже существует' });
    res.status(500).json({ error: 'Failed' });
  }
});

// Toggle active
router.post('/promo-codes/:id/toggle', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE promo_codes SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// Delete promo
router.delete('/promo-codes/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM promo_codes WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

export { getAllAdminIds };
export default router;

