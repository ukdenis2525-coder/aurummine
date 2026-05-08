import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';
import { MIN_WITHDRAW } from '../services/mining.js';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const { wallet_address, ton_amount } = req.body;
  const user = req.user;

  if (!wallet_address || !ton_amount) {
    return res.status(400).json({ error: 'wallet_address and ton_amount required' });
  }
  if (parseFloat(ton_amount) < MIN_WITHDRAW) {
    return res.status(400).json({ error: `Minimum withdrawal: ${MIN_WITHDRAW} TON` });
  }
  if (parseFloat(user.ton_balance) < parseFloat(ton_amount)) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users SET ton_balance = ton_balance - $1 WHERE id = $2`,
      [ton_amount, user.id]
    );

    const { rows } = await client.query(
      `INSERT INTO withdrawals (user_id, ton_amount, wallet_address)
       VALUES ($1, $2, $3) RETURNING *`,
      [user.id, ton_amount, wallet_address]
    );

    await client.query('COMMIT');
    res.json({ success: true, withdrawal: rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Withdrawal failed' });
  } finally {
    client.release();
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [req.user.id]
  );
  res.json(rows);
});

export default router;
