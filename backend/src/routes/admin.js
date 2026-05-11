import { Router } from 'express';
import { pool } from '../db.js';

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
  res.json({
    total_users: parseInt(users.rows[0].total),
    total_power: parseFloat(power.rows[0].total),
    total_ton_balance: parseFloat(ton.rows[0].total),
    pending_withdrawals: parseInt(pending.rows[0].total),
    total_purchases: parseInt(completed.rows[0].total),
    total_revenue: parseFloat(completed.rows[0].sum),
    new_users_24h: parseInt(revenue.rows[0].total),
  });
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
  await pool.query(`UPDATE users SET is_blocked = $1 WHERE id = $2`, [!!blocked, req.params.id]);
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
    `SELECT key, value, label FROM app_settings WHERE key LIKE 'ad_%' OR key LIKE 'monetag_%' OR key LIKE 'order_%' ORDER BY key`
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

// ── Multi-Account Detection ──
router.get('/multi-accounts', async (req, res) => {
  try {
    const adminIds = await getAllAdminIds();

    const { rows: sharedIps } = await pool.query(`
      SELECT ip, COUNT(DISTINCT user_id) as user_count,
             ARRAY_AGG(DISTINCT user_id) as user_ids
      FROM user_ips
      GROUP BY ip
      HAVING COUNT(DISTINCT user_id) >= 2
      ORDER BY user_count DESC
      LIMIT 50
    `);

    if (!sharedIps.length) return res.json([]);

    const allUserIds = [...new Set(sharedIps.flatMap(r => r.user_ids))];

    const { rows: users } = await pool.query(
      `SELECT id, tg_id, username, first_name, power, ton_balance, is_premium, is_blocked, last_ip, created_at
       FROM users WHERE id = ANY($1::INT[])`,
      [allUserIds]
    );
    const usersMap = {};
    users.forEach(u => {
      u.is_admin = adminIds.includes(String(u.tg_id));
      usersMap[u.id] = u;
    });

    const groups = sharedIps.map(r => {
      const groupUsers = r.user_ids.map(id => usersMap[id]).filter(Boolean);
      const hasAdmin = groupUsers.some(u => u.is_admin);
      return {
        ip: r.ip,
        user_count: groupUsers.length,
        has_admin: hasAdmin,
        users: groupUsers,
      };
    });

    res.json(groups);
  } catch (e) {
    console.error('[Admin] Multi-account check error:', e.message);
    res.status(500).json({ error: 'Failed to check multi-accounts' });
  }
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

export { getAllAdminIds };
export default router;

