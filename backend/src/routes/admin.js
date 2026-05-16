import { Router } from 'express';
import { Api } from 'grammy';
import { pool } from '../db.js';
import { validateTelegramInitData } from '../utils/telegram.js';

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

// Admin auth: Telegram user with matching tg_id (env + DB) AND valid signature
const adminMiddleware = async (req, res, next) => {
  // 1. Static API key access (system/scripts)
  const key = req.headers['x-admin-key'];
  if (key && process.env.ADMIN_KEY && key === process.env.ADMIN_KEY) {
    req.adminTgId = 'API_KEY';
    req.adminName = 'SYSTEM';
    return next();
  }

  // 2. PIN-code check (if enabled in env)
  const pin = req.headers['x-admin-pin'];
  const expectedPin = process.env.ADMIN_PIN ? String(process.env.ADMIN_PIN).trim() : null;

  if (expectedPin && pin !== expectedPin) {
    // Only enforce PIN for WebApp users (initData present)
    if (req.headers['x-init-data']) {
      console.log(`[AdminAuth] PIN mismatch: got "${pin}", expected "${expectedPin}"`);
      return res.status(403).json({ error: 'invalid_pin', message: 'Введите верный ПИН-код' });
    }
  }

  // 3. UI-based admin auth (WebApp)
  const initData = req.headers['x-init-data'];
  if (initData) {
    const tgUser = validateTelegramInitData(initData, process.env.BOT_TOKEN);
    if (tgUser) {
      const adminIds = await getAllAdminIds();
      if (adminIds.includes(String(tgUser.id))) {
        req.adminTgId = String(tgUser.id);
        req.adminName = tgUser.first_name || tgUser.username || String(tgUser.id);
        return next();
      }
    }
  }

  return res.status(403).json({ error: 'Forbidden' });
};

// Helper: log admin activity
const logAdminAction = async (req, action, details) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
    await pool.query(
      `INSERT INTO admin_activity_log (admin_tg_id, admin_name, action, details, ip) VALUES ($1, $2, $3, $4, $5)`,
      [req.adminTgId || 'unknown', req.adminName || 'unknown', action, details || null, ip.substring(0, 50)]
    );
  } catch (e) {}
};

router.use(adminMiddleware);

// ── Admin Activity Logging ──
router.post('/log-action', async (req, res) => {
  const { action, details } = req.body;
  if (!action) return res.json({ ok: true });
  await logAdminAction(req, action, details);
  res.json({ ok: true });
});

router.get('/activity', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM admin_activity_log
      ORDER BY created_at DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard Stats ──
router.get('/stats', async (req, res) => {
  // Main metrics — ACTIVE users only (exclude banned)
  const [users, activeUsers, power, ton, pending, completed, revenue] = await Promise.all([
    pool.query(`SELECT COUNT(*) as total FROM users`),
    pool.query(`SELECT COUNT(*) as total FROM users WHERE is_blocked = false`),
    pool.query(`SELECT COALESCE(SUM(power), 0) as total FROM users WHERE is_blocked = false`),
    pool.query(`SELECT COALESCE(SUM(ton_balance), 0) as total FROM users WHERE is_blocked = false`),
    pool.query(`SELECT COUNT(*) as total FROM withdrawals WHERE status = 'pending'`),
    pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(ton_paid), 0) as sum FROM purchases`),
    pool.query(`SELECT COUNT(*) as total FROM users WHERE created_at > NOW() - INTERVAL '24 hours' AND is_blocked = false`),
  ]);

  // Online counts (safely handled)
  let online5 = 0, online60 = 0;
  try {
    const [r5, r60] = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '5 minutes') as c5,
        COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '1 hour') as c60
      FROM users WHERE is_blocked = false
    `);
    online5 = parseInt(r5.rows[0].c5 || 0);
    online60 = parseInt(r5.rows[0].c60 || 0);
  } catch (e) {
    // Fallback: if last_seen_at missing, just show 0 or use created_at for "newly online"
  }

  // Referral & ads totals
  let totalRefs = 0, totalAds = 0;
  try {
    const [refs, ads] = await Promise.all([
      pool.query(`SELECT COUNT(*) as c FROM referrals`),
      pool.query(`SELECT COALESCE(SUM(COALESCE(ads_watched, 0)), 0) as c FROM users WHERE is_blocked = false`),
    ]);
    totalRefs = parseInt(refs.rows[0].c);
    totalAds = parseInt(ads.rows[0].c);
  } catch (e) {}

  // Buyers vs Non-buyers (active only)
  let buyers = null;
  try {
    const [buyerStats, buyerSpent, nonBuyerStats] = await Promise.all([
      // Buyer user stats (no JOIN — avoids duplication)
      pool.query(`
        SELECT COUNT(*) as count,
               COALESCE(SUM(power), 0) as power,
               COALESCE(SUM(ton_balance), 0) as balance
        FROM users
        WHERE is_blocked = false
          AND id IN (SELECT DISTINCT user_id FROM purchases)
      `),
      // Total spent (separate query)
      pool.query(`
        SELECT COALESCE(SUM(p.ton_paid), 0) as spent
        FROM purchases p
        JOIN users u ON p.user_id = u.id
        WHERE u.is_blocked = false
      `),
      // Non-buyers
      pool.query(`
        SELECT COUNT(*) as count,
               COALESCE(SUM(power), 0) as power,
               COALESCE(SUM(ton_balance), 0) as balance
        FROM users
        WHERE is_blocked = false
          AND id NOT IN (SELECT DISTINCT user_id FROM purchases)
      `),
    ]);
    buyers = {
      buyers_count: parseInt(buyerStats.rows[0].count),
      buyers_power: parseFloat(buyerStats.rows[0].power),
      buyers_balance: parseFloat(buyerStats.rows[0].balance),
      buyers_spent: parseFloat(buyerSpent.rows[0].spent),
      free_count: parseInt(nonBuyerStats.rows[0].count),
      free_power: parseFloat(nonBuyerStats.rows[0].power),
      free_balance: parseFloat(nonBuyerStats.rows[0].balance),
    };
  } catch (e) {}

  const blockedCount = parseInt(users.rows[0].total) - parseInt(activeUsers.rows[0].total);

  const totalPowerVal = parseFloat(power.rows[0].total);
  const totalDailyForecast = (totalPowerVal / 100000) * 0.036;

  if (buyers) {
    buyers.buyers_daily_forecast = (buyers.buyers_power / 100000) * 0.036;
    buyers.buyers_monthly_forecast = buyers.buyers_daily_forecast * 30;
    buyers.free_daily_forecast = (buyers.free_power / 100000) * 0.036;
    buyers.free_monthly_forecast = buyers.free_daily_forecast * 30;
  }

  const stats = {
    total_users: parseInt(users.rows[0].total),
    active_users: parseInt(activeUsers.rows[0].total),
    blocked_users: blockedCount,
    total_power: totalPowerVal,
    total_daily_forecast: totalDailyForecast,
    total_monthly_forecast: totalDailyForecast * 30,
    total_ton_balance: parseFloat(ton.rows[0].total),
    pending_withdrawals: parseInt(pending.rows[0].total),
    total_purchases: parseInt(completed.rows[0].total),
    total_revenue: parseFloat(completed.rows[0].sum),
    new_users_24h: parseInt(revenue.rows[0].total),
    online_5min: online5,
    online_1h: online60,
    total_referrals: totalRefs,
    total_ads_watched: totalAds,
    buyers,
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
      bannedStats,        // power + balance of blocked users
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
      pool.query(`SELECT COALESCE(SUM(power), 0) as p, COALESCE(SUM(ton_balance), 0) as b FROM users WHERE is_blocked = true`),
    ]);

    // Power forecast — how much TON will be mined
    // Formula: 100K power = 2500 hashes/day = 0.036 TON/day
    const TON_PER_DAY_PER_100K = 0.036;
    const activePowerRes = await pool.query(`SELECT COALESCE(SUM(power), 0) as total FROM users WHERE is_blocked = false`);
    const totalPowerRes = await pool.query(`SELECT COALESCE(SUM(power), 0) as total FROM users`);
    const activePower = parseFloat(activePowerRes.rows[0].total);
    const totalPower = parseFloat(totalPowerRes.rows[0].total);
    const tonPerDay = (activePower / 100000) * TON_PER_DAY_PER_100K;

    stats.finance = {
      banned_users: parseInt(blockedCount.rows[0].c),
      banned_purchases_count: parseInt(bannedPurchases.rows[0].count),
      banned_purchases_ton: parseFloat(bannedPurchases.rows[0].sum),
      banned_power: parseFloat(bannedStats.rows[0].p),
      banned_balance: parseFloat(bannedStats.rows[0].b),
      total_liability: parseFloat(totalBalances.rows[0].total),
      active_liability: parseFloat(activeBalances.rows[0].total),
      total_withdrawn: parseFloat(approvedWithdrawals.rows[0].total),
      pending_withdrawals_ton: parseFloat(pendingWithdrawals.rows[0].total),
      net_position: parseFloat(completed.rows[0].sum) - parseFloat(approvedWithdrawals.rows[0].total) - parseFloat(pendingWithdrawals.rows[0].total),
      // Power forecast
      active_power: activePower,
      total_power: totalPower,
      mining_ton_per_day: tonPerDay,
      mining_ton_per_week: tonPerDay * 7,
      mining_ton_per_month: tonPerDay * 30,
      // Future liability = current balances + future mining
      liability_7d: parseFloat(activeBalances.rows[0].total) + (tonPerDay * 7),
      liability_30d: parseFloat(activeBalances.rows[0].total) + (tonPerDay * 30),
      liability_90d: parseFloat(activeBalances.rows[0].total) + (tonPerDay * 90),
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

    // Active users per hour (from created_at as fallback)
    let activeUsers = new Array(24).fill(0);
    try {
      const { rows } = await pool.query(`
        SELECT DATE_TRUNC('hour', created_at) as h, COUNT(DISTINCT id) as c
        FROM users WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY h ORDER BY h
      `);
      rows.forEach(r => {
        const rh = new Date(r.h).getHours();
        const idx = hours.findIndex(h => h.hour === rh);
        if (idx >= 0) activeUsers[idx] = parseInt(r.c);
      });
    } catch (e) {}

    // Online per hour snapshot (from created_at as fallback)
    let onlineUsers = new Array(24).fill(0);
    try {
      const { rows } = await pool.query(`
        SELECT DATE_TRUNC('hour', created_at) as h, COUNT(*) as c
        FROM users WHERE created_at > NOW() - INTERVAL '24 hours'
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

  const sort = req.query.sort || 'newest';
  let orderBy = 'u.id DESC';
  let joins = '';

  if (sort === 'power') orderBy = 'u.power DESC';
  else if (sort === 'balance') orderBy = 'u.ton_balance DESC';
  else if (sort === 'referrals') {
    joins = 'LEFT JOIN referrals r ON r.referrer_id = u.id';
    orderBy = 'COUNT(r.id) DESC';
  } else if (sort === 'purchases') {
    joins = 'LEFT JOIN purchases p ON p.user_id = u.id';
    orderBy = 'COALESCE(SUM(p.ton_paid), 0) DESC';
  }

  let where = '';
  let params = [limit, offset];
  if (search) {
    where = `WHERE u.username ILIKE $3 OR u.first_name ILIKE $3 OR CAST(u.tg_id AS TEXT) LIKE $3`;
    params.push(`%${search}%`);
  }

  const query = `
    SELECT u.id, u.tg_id, u.username, u.first_name, u.power, u.hashes, u.ton_balance, u.is_premium, u.is_blocked, u.created_at
    FROM users u
    ${joins}
    ${where}
    GROUP BY u.id
    ORDER BY ${orderBy}
    LIMIT $1 OFFSET $2
  `;

  const { rows } = await pool.query(query, params);
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
  
  // Log the adjustment
  try {
    await pool.query(
      `INSERT INTO admin_activity_log (admin_tg_id, action, details) VALUES ($1, $2, $3)`,
      [req.admin_id, 'adjust_user', JSON.stringify({ user_id: req.params.id, power, ton_balance })]
    );
  } catch(e) { console.error('[Log] Adjustment log failed:', e.message); }

  res.json({ success: true });
});

// ── User Details ──
router.get('/users/:id/details', async (req, res) => {
  const uid = req.params.id;
  const [user, purchases, referrals, rewards, withdrawals, pendingOrders, adminLogs] = await Promise.all([
    pool.query(`SELECT * FROM users WHERE id = $1`, [uid]),
    pool.query(
      `SELECT p.id, p.ton_paid, p.power_amount, p.created_at, pp.name as package_name
       FROM purchases p LEFT JOIN power_packages pp ON pp.id = p.package_id
       WHERE p.user_id = $1 ORDER BY p.created_at DESC`, [uid]
    ),
    pool.query(
      `SELECT 
        r.id, r.is_confirmed, r.created_at, 
        u.tg_id, u.username, u.first_name, u.is_premium,
        COALESCE(SUM(rr.power_amount), 0) as earned_power,
        COALESCE(SUM(rr.ton_amount), 0) as earned_ton
       FROM referrals r 
       JOIN users u ON u.id = r.referee_id
       LEFT JOIN referral_rewards rr ON rr.referee_id = r.referee_id AND rr.referrer_id = r.referrer_id
       WHERE r.referrer_id = $1 
       GROUP BY r.id, u.id
       ORDER BY r.created_at DESC`, [uid]
    ),
    pool.query(
      `SELECT 
        COALESCE(SUM(power_amount), 0) as total_power,
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
    pool.query(
      `SELECT id, admin_tg_id, action, details, created_at
       FROM admin_activity_log 
       WHERE action = 'adjust_user' AND details::jsonb ->> 'user_id' = $1
       ORDER BY created_at DESC LIMIT 50`, [uid]
    ),
  ]);
  if (!user.rows.length) return res.status(404).json({ error: 'User not found' });

  // Mining forecast for this specific user
  const userPower = parseFloat(user.rows[0].power || 0);
  const dailyForecast = (userPower / 100000) * 0.036;

  // IP History (safely handled)
  let ips = [];
  try {
    const { rows } = await pool.query(
      `SELECT ip, created_at as last_seen_at FROM user_ips WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [uid]
    );
    ips = rows;
  } catch (e) {
    console.warn(`[Admin] IP history table not found or error for user ${uid}`);
    if (user.rows[0].last_ip) {
      ips = [{ ip: user.rows[0].last_ip, last_seen_at: user.rows[0].last_seen_at || new Date() }];
    }
  }

  // Referrer info
  let referrer = null;
  if (user.rows[0].ref_id) {
    const { rows: refRows } = await pool.query(
      `SELECT id, tg_id, username, first_name FROM users WHERE id = $1`, [user.rows[0].ref_id]
    );
    if (refRows.length) referrer = refRows[0];
  }

  res.json({
    user: user.rows[0],
    forecast: {
      daily: dailyForecast,
      monthly: dailyForecast * 30
    },
    ips,
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
    admin_logs: adminLogs?.rows || [],
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

// ── Withdraw Settings ──
const WS_KEYS = [
  'min_withdraw_ton', 'withdraw_fee_mode', 'withdraw_fee_fixed',
  'withdraw_fee_percent', 'withdraw_fee_hybrid_threshold',
  'withdraw_processing_hours', 'withdraw_require_deposit',
  'withdraw_check_bot', 'withdraw_check_multi'
];

router.get('/withdraw-settings', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key = ANY($1)`, [WS_KEYS]
    );
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    res.json({
      min_withdraw_ton: parseFloat(map.min_withdraw_ton || '0.1'),
      withdraw_fee_mode: map.withdraw_fee_mode || 'none',
      withdraw_fee_fixed: parseFloat(map.withdraw_fee_fixed || '0.01'),
      withdraw_fee_percent: parseFloat(map.withdraw_fee_percent || '5'),
      withdraw_fee_hybrid_threshold: parseFloat(map.withdraw_fee_hybrid_threshold || '1'),
      withdraw_processing_hours: map.withdraw_processing_hours || '1-24',
      withdraw_require_deposit: map.withdraw_require_deposit || '0',
      withdraw_check_bot: map.withdraw_check_bot || '0',
      withdraw_check_multi: map.withdraw_check_multi || '0',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/withdraw-settings', async (req, res) => {
  const {
    min_withdraw_ton, withdraw_fee_mode, withdraw_fee_fixed,
    withdraw_fee_percent, withdraw_fee_hybrid_threshold,
    withdraw_processing_hours, withdraw_require_deposit,
    withdraw_check_bot, withdraw_check_multi,
  } = req.body;

  const updates = [];

  // Fee & min settings
  if (min_withdraw_ton !== undefined) {
    if (isNaN(parseFloat(min_withdraw_ton)) || parseFloat(min_withdraw_ton) < 0) return res.status(400).json({ error: 'Invalid min_withdraw_ton' });
    updates.push({ key: 'min_withdraw_ton', value: String(min_withdraw_ton), label: 'Минимальная сумма вывода (TON)' });
  }
  if (withdraw_fee_mode !== undefined) {
    if (!['none', 'fixed', 'percent', 'hybrid'].includes(withdraw_fee_mode)) return res.status(400).json({ error: 'Invalid fee mode' });
    updates.push({ key: 'withdraw_fee_mode', value: withdraw_fee_mode, label: 'Режим комиссии (none/fixed/percent/hybrid)' });
  }
  if (withdraw_fee_fixed !== undefined) {
    if (isNaN(parseFloat(withdraw_fee_fixed)) || parseFloat(withdraw_fee_fixed) < 0) return res.status(400).json({ error: 'Invalid fee fixed' });
    updates.push({ key: 'withdraw_fee_fixed', value: String(withdraw_fee_fixed), label: 'Фиксированная комиссия (TON)' });
  }
  if (withdraw_fee_percent !== undefined) {
    if (isNaN(parseFloat(withdraw_fee_percent)) || parseFloat(withdraw_fee_percent) < 0 || parseFloat(withdraw_fee_percent) > 100) return res.status(400).json({ error: 'Invalid fee percent' });
    updates.push({ key: 'withdraw_fee_percent', value: String(withdraw_fee_percent), label: 'Процентная комиссия (%)' });
  }
  if (withdraw_fee_hybrid_threshold !== undefined) {
    if (isNaN(parseFloat(withdraw_fee_hybrid_threshold)) || parseFloat(withdraw_fee_hybrid_threshold) < 0) return res.status(400).json({ error: 'Invalid hybrid threshold' });
    updates.push({ key: 'withdraw_fee_hybrid_threshold', value: String(withdraw_fee_hybrid_threshold), label: 'Порог гибрида (TON)' });
  }

  // Processing time & protection settings
  if (withdraw_processing_hours !== undefined) {
    updates.push({ key: 'withdraw_processing_hours', value: String(withdraw_processing_hours), label: 'Время обработки вывода (текст)' });
  }
  if (withdraw_require_deposit !== undefined) {
    updates.push({ key: 'withdraw_require_deposit', value: String(withdraw_require_deposit), label: 'Требовать покупку пакета для вывода (0/1)' });
  }
  if (withdraw_check_bot !== undefined) {
    updates.push({ key: 'withdraw_check_bot', value: String(withdraw_check_bot), label: 'Блокировать вывод для ботов (0/1)' });
  }
  if (withdraw_check_multi !== undefined) {
    updates.push({ key: 'withdraw_check_multi', value: String(withdraw_check_multi), label: 'Блокировать вывод для мультиаккаунтов (0/1)' });
  }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  try {
    for (const u of updates) {
      await pool.query(
        `INSERT INTO app_settings (key, value, label) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2`,
        [u.key, u.value, u.label]
      );
    }
    const details = updates.map(u => `${u.key}=${u.value}`).join(', ');
    await logAdminAction(req, 'update_withdraw_settings', details);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// ── Deposits (Recent Purchases) ──
router.get('/deposits', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    // Recent purchases with user + package + promo info
    const { rows: deposits } = await pool.query(`
      SELECT p.id, p.user_id, p.power_amount, p.ton_paid, p.tx_hash, p.created_at,
             u.tg_id, u.username, u.first_name, u.power, u.ton_balance, u.is_blocked, u.is_premium,
             pp.name as package_name, pp.price_ton as original_price,
             pc.code as promo_code, pc.discount_pct as promo_discount
      FROM purchases p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN power_packages pp ON p.package_id = pp.id
      LEFT JOIN promo_code_uses pcu ON pcu.user_id = p.user_id
      LEFT JOIN promo_codes pc ON pc.id = pcu.promo_id
        AND p.ton_paid < pp.price_ton
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    // Total count
    const { rows: countRows } = await pool.query(`SELECT COUNT(*) as c FROM purchases`);

    // Summary stats
    const [today, week, month] = await Promise.all([
      pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(ton_paid), 0) as s FROM purchases WHERE created_at > NOW() - INTERVAL '24 hours'`),
      pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(ton_paid), 0) as s FROM purchases WHERE created_at > NOW() - INTERVAL '7 days'`),
      pool.query(`SELECT COUNT(*) as c, COALESCE(SUM(ton_paid), 0) as s FROM purchases WHERE created_at > NOW() - INTERVAL '30 days'`),
    ]);

    res.json({
      deposits,
      total: parseInt(countRows[0].c),
      page,
      summary: {
        today_count: parseInt(today.rows[0].c),
        today_ton: parseFloat(today.rows[0].s),
        week_count: parseInt(week.rows[0].c),
        week_ton: parseFloat(week.rows[0].s),
        month_count: parseInt(month.rows[0].c),
        month_ton: parseFloat(month.rows[0].s),
      }
    });
  } catch (e) {
    console.error('[Deposits] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Pending Deposits (started but not completed) ──
router.get('/deposits/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pp.id, pp.user_id, pp.memo, pp.ton_amount, pp.status, pp.expires_at, pp.created_at,
             u.tg_id, u.username, u.first_name, u.power, u.ton_balance, u.is_blocked, u.is_premium,
             pk.name as package_name
      FROM pending_purchases pp
      JOIN users u ON pp.user_id = u.id
      LEFT JOIN power_packages pk ON pp.package_id = pk.id
      ORDER BY pp.created_at DESC
      LIMIT 100
    `);

    // Stats
    const [pending, expired, completed] = await Promise.all([
      pool.query(`SELECT COUNT(*) as c FROM pending_purchases WHERE status = 'pending' AND expires_at > NOW()`),
      pool.query(`SELECT COUNT(*) as c FROM pending_purchases WHERE status = 'pending' AND expires_at <= NOW()`),
      pool.query(`SELECT COUNT(*) as c FROM pending_purchases WHERE status = 'completed'`),
    ]);

    res.json({
      items: rows,
      stats: {
        active: parseInt(pending.rows[0].c),
        expired: parseInt(expired.rows[0].c),
        completed: parseInt(completed.rows[0].c),
      }
    });
  } catch (e) {
    console.error('[PendingDeposits] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
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
  const { message, parse_mode, photo_url } = req.body;
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

    // Build message options
    const msgOpts = {};
    if (parse_mode && parse_mode.trim()) {
      msgOpts.parse_mode = parse_mode.trim();
    }

    const hasPhoto = photo_url && photo_url.trim();
    const hasPromoPlaceholder = message.includes('{promo}');

    // Preload available partner promo codes if placeholder is used
    let partnerPromos = [];
    if (hasPromoPlaceholder) {
      const { rows: promos } = await pool.query(
        `SELECT id, code, discount_pct, max_uses, used_count FROM promo_codes 
         WHERE is_partner = TRUE AND is_active = TRUE 
         AND (max_uses = 0 OR used_count < max_uses)
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY id ASC`
      );
      partnerPromos = promos;
      console.log(`[Broadcast] Found ${partnerPromos.length} partner promo codes for {promo} placeholder`);
    }
    let promoIndex = 0;

    // Send in background (fire-and-forget)
    (async () => {
      for (let i = 0; i < users.length; i++) {
        try {
          let userMessage = message.trim();

          // Replace {promo} with an unused partner promo code
          if (hasPromoPlaceholder && partnerPromos.length > 0) {
            // Find a promo code not used by this user
            let assignedPromo = null;
            for (let p = 0; p < partnerPromos.length; p++) {
              const idx = (promoIndex + p) % partnerPromos.length;
              const promo = partnerPromos[idx];
              // Check if user already used this promo
              const { rows: used } = await pool.query(
                `SELECT id FROM promo_code_uses WHERE promo_id = $1 AND user_id = $2`,
                [promo.id, users[i].id]
              );
              if (!used.length && (promo.max_uses === 0 || promo.used_count < promo.max_uses)) {
                assignedPromo = promo;
                promoIndex = (idx + 1) % partnerPromos.length;
                break;
              }
            }

            if (assignedPromo) {
              const promoText = `🎁 Промокод на покупку -${assignedPromo.discount_pct}%: <b>${assignedPromo.code}</b>`;
              userMessage = userMessage.replace('{promo}', promoText);
              // Record distribution (not actual usage — doesn't count toward max_uses)
              try {
                await pool.query(
                  `INSERT INTO promo_code_uses (promo_id, user_id, source) VALUES ($1, $2, 'broadcast') ON CONFLICT DO NOTHING`,
                  [assignedPromo.id, users[i].id]
                );
              } catch (dbErr) {}
            } else {
              // No promo available — remove placeholder
              userMessage = userMessage.replace('{promo}', '');
            }
          }

          if (hasPhoto) {
            await tgApi.sendPhoto(users[i].tgId, photo_url.trim(), {
              caption: userMessage,
              ...msgOpts,
            });
          } else {
            await tgApi.sendMessage(users[i].tgId, userMessage, {
              disable_web_page_preview: true,
              ...msgOpts,
            });
          }
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

    // Get ignored IPs (whitelisted for multi-account withdrawals)
    let ignoredIps = new Set();
    try {
      const { rows: igRows } = await pool.query(`SELECT ip FROM multi_ignore`);
      igRows.forEach(r => ignoredIps.add(r.ip));
    } catch (e) {}

    const active = [];
    const blocked = [];

    filtered.forEach(([ip, ids]) => {
      const groupUsers = [...ids].map(id => usersMap[id]).filter(Boolean);
      const hasAdmin = groupUsers.some(u => u.is_admin);
      const allBlocked = groupUsers.every(u => u.is_blocked);
      const isBlacklisted = blacklistedIps.has(ip);
      const isIgnored = ignoredIps.has(ip);
      const group = { ip, user_count: groupUsers.length, has_admin: hasAdmin, is_blacklisted: isBlacklisted, is_ignored: isIgnored, users: groupUsers };

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

// ── Multi-Account Ignore List ──
router.get('/multi-ignore', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM multi_ignore ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/multi-ignore', async (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP required' });
  try {
    await pool.query(
      `INSERT INTO multi_ignore (ip, reason) VALUES ($1, $2) ON CONFLICT (ip) DO NOTHING`,
      [ip.trim(), reason || 'Admin ignore']
    );
    await logAdminAction(req, 'multi_ignore_add', `IP: ${ip}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/multi-ignore/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM multi_ignore WHERE id = $1 RETURNING ip`, [req.params.id]);
    if (rows.length) await logAdminAction(req, 'multi_ignore_remove', `IP: ${rows[0].ip}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  const { code, discount_pct, max_uses, expires_at, is_partner } = req.body;
  if (!code || !discount_pct) return res.status(400).json({ error: 'code and discount_pct required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO promo_codes (code, discount_pct, max_uses, expires_at, is_partner)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code.trim().toUpperCase(), discount_pct, max_uses || 0, expires_at || null, is_partner || false]
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

// Get promo code uses (who used it)
router.get('/promo-codes/:id/uses', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pcu.id, pcu.source, pcu.used_at, u.tg_id, u.username, u.first_name
       FROM promo_code_uses pcu
       JOIN users u ON u.id = pcu.user_id
       WHERE pcu.promo_id = $1
       ORDER BY pcu.used_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

export { getAllAdminIds };
export default router;

