import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, username, first_name, power,
      RANK() OVER (ORDER BY power DESC) as rank
     FROM users WHERE (is_blocked IS NOT TRUE) ORDER BY power DESC LIMIT 50`
  );

  const { rows: myRank } = await pool.query(
    `SELECT rank FROM (
       SELECT id, RANK() OVER (ORDER BY power DESC) as rank FROM users
     ) t WHERE id = $1`, [req.user.id]
  );

  res.json({ leaderboard: rows, my_rank: myRank[0]?.rank || null });
});

export default router;
