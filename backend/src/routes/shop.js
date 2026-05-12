import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';
import crypto from 'crypto';
import { checkPendingPayments } from '../services/payment.js';

const router = Router();

const generateMemo = () => crypto.randomBytes(6).toString('hex').toUpperCase(); // e.g. A1B2C3D4E5F6

// Per-user cooldown map for manual check (30s)
const checkCooldowns = new Map();

router.get('/packages', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM power_packages WHERE is_active = TRUE ORDER BY power_amount ASC`
  );
  res.json(rows);
});

// Validate promo code (user-facing, real-time check)
router.post('/validate-promo', authMiddleware, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  const clean = code.trim().toUpperCase();
  const { rows } = await pool.query(
    `SELECT * FROM promo_codes WHERE UPPER(code) = $1 AND is_active = TRUE`, [clean]
  );
  if (!rows.length) return res.json({ valid: false, error: 'Промокод не найден' });

  const promo = rows[0];
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return res.json({ valid: false, error: 'Промокод истёк' });
  }
  if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) {
    return res.json({ valid: false, error: 'Лимит использований исчерпан' });
  }
  // Check if user already used this promo
  const { rows: uses } = await pool.query(
    `SELECT id FROM promo_code_uses WHERE promo_id = $1 AND user_id = $2`,
    [promo.id, req.user.id]
  );
  if (uses.length) return res.json({ valid: false, error: 'Вы уже использовали этот промокод' });

  res.json({ valid: true, discount_pct: promo.discount_pct, code: promo.code });
});

// Create pending purchase — returns memo + wallet address
router.post('/create-order', authMiddleware, async (req, res) => {
  const { package_id, promo_code } = req.body;
  const user = req.user;

  if (!package_id) return res.status(400).json({ error: 'package_id required' });

  // Get package
  const { rows: pkgs } = await pool.query(
    `SELECT * FROM power_packages WHERE id = $1 AND is_active = TRUE`, [package_id]
  );
  if (!pkgs.length) return res.status(404).json({ error: 'Package not found' });
  const pkg = pkgs[0];

  let finalPrice = parseFloat(pkg.price_ton);
  let promoId = null;
  let discountPct = 0;

  // Apply promo code if provided
  if (promo_code) {
    const clean = promo_code.trim().toUpperCase();
    const { rows: promos } = await pool.query(
      `SELECT * FROM promo_codes WHERE UPPER(code) = $1 AND is_active = TRUE`, [clean]
    );
    if (promos.length) {
      const promo = promos[0];
      const isValid = (!promo.expires_at || new Date(promo.expires_at) > new Date())
        && (promo.max_uses === 0 || promo.used_count < promo.max_uses);
      
      // Check if user already used
      const { rows: uses } = await pool.query(
        `SELECT id FROM promo_code_uses WHERE promo_id = $1 AND user_id = $2`,
        [promo.id, user.id]
      );

      if (isValid && !uses.length) {
        discountPct = promo.discount_pct;
        finalPrice = +(finalPrice * (1 - discountPct / 100)).toFixed(4);
        promoId = promo.id;
      }
    }
  }

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
    [user.id, pkg.id, memo, finalPrice, expiresAt]
  );

  // Record promo usage
  if (promoId) {
    await pool.query(
      `INSERT INTO promo_code_uses (promo_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [promoId, user.id]
    );
    await pool.query(
      `UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1`,
      [promoId]
    );
  }

  res.json({
    order: rows[0],
    package: pkg,
    wallet: process.env.PAYMENT_WALLET,
    expires_at: expiresAt,
    discount_pct: discountPct,
    original_price: pkg.price_ton,
    final_price: finalPrice,
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

// Manual payment check — user-facing, with 30s cooldown
router.post('/check-payment', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  // Cooldown check
  const lastCheck = checkCooldowns.get(userId);
  if (lastCheck && Date.now() - lastCheck < 30000) {
    const wait = Math.ceil((30000 - (Date.now() - lastCheck)) / 1000);
    return res.status(429).json({ error: 'cooldown', wait });
  }
  checkCooldowns.set(userId, Date.now());

  try {
    await checkPendingPayments();

    // Return updated order status for this user
    const { data: hist } = { data: null };
    const { rows } = await pool.query(
      `SELECT pp.status, pp.memo, pp.ton_amount, pkg.power_amount
       FROM pending_purchases pp
       JOIN power_packages pkg ON pkg.id = pp.package_id
       WHERE pp.user_id = $1
       ORDER BY pp.created_at DESC LIMIT 1`,
      [userId]
    );
    const order = rows[0] || null;
    res.json({ checked: true, status: order?.status || null });
  } catch (e) {
    console.error('Manual check error:', e.message);
    res.status(500).json({ error: 'Check failed' });
  }
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
