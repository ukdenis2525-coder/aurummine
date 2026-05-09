import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';
import crypto from 'crypto';

const router = Router();

const generateMemo = () => crypto.randomBytes(6).toString('hex').toUpperCase(); // e.g. A1B2C3D4E5F6

router.get('/packages', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM power_packages WHERE is_active = TRUE ORDER BY power_amount ASC`
  );
  res.json(rows);
});

// Create pending purchase — returns memo + wallet address
router.post('/create-order', authMiddleware, async (req, res) => {
  const { package_id } = req.body;
  const user = req.user;

  if (!package_id) return res.status(400).json({ error: 'package_id required' });

  // Get package
  const { rows: pkgs } = await pool.query(
    `SELECT * FROM power_packages WHERE id = $1 AND is_active = TRUE`, [package_id]
  );
  if (!pkgs.length) return res.status(404).json({ error: 'Package not found' });
  const pkg = pkgs[0];

  // Cancel any existing pending order for this user
  await pool.query(
    `UPDATE pending_purchases SET status = 'cancelled'
     WHERE user_id = $1 AND status = 'pending'`,
    [user.id]
  );

  // Generate unique memo
  let memo, attempts = 0;
  do {
    memo = generateMemo();
    const { rows } = await pool.query(
      `SELECT id FROM pending_purchases WHERE memo = $1`, [memo]
    );
    if (!rows.length) break;
    attempts++;
  } while (attempts < 10);

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const { rows } = await pool.query(
    `INSERT INTO pending_purchases (user_id, package_id, memo, ton_amount, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [user.id, pkg.id, memo, pkg.price_ton, expiresAt]
  );

  res.json({
    order: rows[0],
    package: pkg,
    wallet: process.env.PAYMENT_WALLET,
    expires_at: expiresAt
  });
});

// Get current pending order status
router.get('/order-status', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pp.*, pkg.name as package_name, pkg.power_amount
     FROM pending_purchases pp
     JOIN power_packages pkg ON pkg.id = pp.package_id
     WHERE pp.user_id = $1 AND pp.status = 'pending' AND pp.expires_at > NOW()
     ORDER BY pp.created_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json(rows[0] || null);
});

// Cancel pending order
router.post('/cancel-order', authMiddleware, async (req, res) => {
  await pool.query(
    `UPDATE pending_purchases SET status = 'cancelled'
     WHERE user_id = $1 AND status = 'pending'`,
    [req.user.id]
  );
  res.json({ success: true });
});

// Get last order status (for checking after expiry)
router.get('/order-history', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT status FROM pending_purchases
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({ last_status: rows[0]?.status || null });
});

export default router;
