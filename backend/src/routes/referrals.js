import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const user = req.user;

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
     ORDER BY r.created_at DESC`,
    [user.id]
  );

  res.json({
    stats: stats[0],
    rewards: rewards[0],
    team,
    ref_link: `https://t.me/${process.env.BOT_USERNAME}?start=${user.id}`
  });
});

export default router;
