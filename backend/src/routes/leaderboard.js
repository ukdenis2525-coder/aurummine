import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, username, first_name, power,
      RANK() OVER (ORDER BY power DESC) as rank
     FROM users ORDER BY power DESC LIMIT 50`
  );

  const { rows: myRank } = await pool.query(
    `SELECT RANK() OVER (ORDER BY power DESC) as rank
     FROM users WHERE id = $1`, [req.user.id]
  );

  res.json({ leaderboard: rows, my_rank: myRank[0]?.rank || null });
});

export default router;
