import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';
import { TON_PER_HASH, getHashesPerMinute } from '../services/mining.js';

const router = Router();

router.get('/status', authMiddleware, async (req, res) => {
  const user = req.user;
  const hashesPerDay = getHashesPerMinute(parseFloat(user.power)) * 1440;
  const tonPerDay = hashesPerDay * TON_PER_HASH;

  res.json({
    power: parseFloat(user.power),
    hashes: parseFloat(user.hashes),
    ton_balance: parseFloat(user.ton_balance),
    hashes_per_day: hashesPerDay,
    ton_per_day: tonPerDay,
    ton_per_month: tonPerDay * 30,
    ton_per_3months: tonPerDay * 90,
    ton_per_hash: TON_PER_HASH
  });
});

router.post('/collect', authMiddleware, async (req, res) => {
  const user = req.user;
  const hashes = parseFloat(user.hashes);
  if (hashes <= 0) return res.status(400).json({ error: 'No hashes to collect' });

  const tonEarned = hashes * TON_PER_HASH;

  await pool.query(
    `UPDATE users SET 
      ton_balance = ton_balance + $1,
      hashes = 0
     WHERE id = $2`,
    [tonEarned, user.id]
  );

  await pool.query(
    `INSERT INTO mining_log (user_id, hashes_earned, ton_converted) VALUES ($1, $2, $3)`,
    [user.id, hashes, tonEarned]
  );

  res.json({ ton_earned: tonEarned, hashes_collected: hashes });
});

export default router;
