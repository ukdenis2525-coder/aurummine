import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const adminMiddleware = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (key !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Forbidden' });
  next();
};

router.use(adminMiddleware);

router.get('/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;

  const { rows } = await pool.query(
    `SELECT id, tg_id, username, first_name, power, hashes, ton_balance, is_premium, created_at
     FROM users ORDER BY id DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const { rows: count } = await pool.query(`SELECT COUNT(*) FROM users`);
  res.json({ users: rows, total: parseInt(count[0].count), page });
});

router.get('/withdrawals', async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT w.*, u.tg_id, u.username 
     FROM withdrawals w JOIN users u ON u.id = w.user_id
     WHERE w.status = $1 ORDER BY w.created_at DESC`,
    [status]
  );
  res.json(rows);
});

router.post('/withdrawals/:id/approve', async (req, res) => {
  const { tx_hash } = req.body;
  await pool.query(
    `UPDATE withdrawals SET status = 'completed', tx_hash = $1 WHERE id = $2`,
    [tx_hash, req.params.id]
  );
  res.json({ success: true });
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM withdrawals WHERE id = $1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const w = rows[0];
    await client.query(
      `UPDATE withdrawals SET status = 'rejected' WHERE id = $1`, [w.id]
    );
    await client.query(
      `UPDATE users SET ton_balance = ton_balance + $1 WHERE id = $2`,
      [w.ton_amount, w.user_id]
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed' });
  } finally {
    client.release();
  }
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

export default router;
