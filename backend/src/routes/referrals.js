import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const user = req.user;
  const page = parseInt(req.query.page) || 1;
  const limit = 30;
  const offset = (page - 1) * limit;

  const { rows: stats } = await pool.query(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_confirmed = TRUE) as confirmed,
      COUNT(*) FILTER (WHERE is_confirmed = FALSE) as pending
     FROM referrals WHERE referrer_id = $1`,
    [user.id]
  );

  const { rows: rewards } = await pool.query(
    `SELECT COALESCE(SUM(power_amount), 0) as total_power,
            COALESCE(SUM(ton_amount), 0) as total_ton
     FROM referral_rewards WHERE referrer_id = $1`,
    [user.id]
  );

  const { rows: team } = await pool.query(
    `SELECT u.id, u.username, u.first_name, u.power, u.is_premium, r.is_confirmed, r.created_at
     FROM referrals r
     JOIN users u ON u.id = r.referee_id
     WHERE r.referrer_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [user.id, limit, offset]
  );

  // Load referral settings for display
  const { rows: settingsRows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key LIKE 'ref_%'`
  );
  const settings = {};
  for (const r of settingsRows) settings[r.key] = parseFloat(r.value);

  res.json({
    stats: stats[0],
    rewards: rewards[0],
    team,
    page,
    has_more: team.length === limit,
    ref_link: `https://t.me/${process.env.BOT_USERNAME}/${process.env.WEBAPP_SHORT_NAME || 'app'}?startapp=${user.tg_id}`,
    settings: {
      power_premium: settings.ref_power_premium ?? 6000,
      power_normal: settings.ref_power_normal ?? 3000,
      commission_pct: settings.ref_commission_pct ?? 15,
    }
  });
});

export default router;
