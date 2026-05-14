import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';
import { TON_PER_HASH, getHashesPerMinute } from '../services/mining.js';

const router = Router();

router.post('/init', authMiddleware, async (req, res) => {
  const user = req.user;
  const power = parseFloat(user.power || 0);
  const hashesPerDay = getHashesPerMinute(power) * 1440;
  const tonPerDay = hashesPerDay * TON_PER_HASH;

  // Load dynamic settings for frontend
  let settings = {
    min_withdraw_ton: 0.1,
    withdraw_fee_mode: 'none',
    withdraw_fee_fixed: 0.01,
    withdraw_fee_percent: 5,
    withdraw_fee_hybrid_threshold: 1,
  };
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key IN ('min_withdraw_ton', 'withdraw_fee_mode', 'withdraw_fee_fixed', 'withdraw_fee_percent', 'withdraw_fee_hybrid_threshold')`
    );
    rows.forEach(r => {
      if (r.key === 'withdraw_fee_mode') settings.withdraw_fee_mode = r.value;
      else settings[r.key] = parseFloat(r.value);
    });
  } catch (e) {}

  res.json({
    user,
    mining: {
      power,
      hashes: parseFloat(user.hashes || 0),
      ton_balance: parseFloat(user.ton_balance || 0),
      hashes_per_day: hashesPerDay,
      ton_per_day: tonPerDay,
      ton_per_month: tonPerDay * 30,
      ton_per_3months: tonPerDay * 90,
      ton_per_hash: TON_PER_HASH
    },
    settings
  });
});

export default router;
