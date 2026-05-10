import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { TON_PER_HASH, getHashesPerMinute } from '../services/mining.js';

const router = Router();

router.post('/init', authMiddleware, (req, res) => {
  const user = req.user;
  const power = parseFloat(user.power || 0);
  const hashesPerDay = getHashesPerMinute(power) * 1440;
  const tonPerDay = hashesPerDay * TON_PER_HASH;

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
    }
  });
});

export default router;
