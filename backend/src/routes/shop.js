import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();

router.get('/packages', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM power_packages WHERE is_active = TRUE ORDER BY power_amount ASC`
  );
  res.json(rows);
});

router.post('/buy', authMiddleware, async (req, res) => {
  const { package_id, tx_hash } = req.body;
  const user = req.user;

  if (!package_id || !tx_hash) {
    return res.status(400).json({ error: 'package_id and tx_hash required' });
  }

  // Check tx_hash not already used
  const { rows: existing } = await pool.query(
    `SELECT id FROM purchases WHERE tx_hash = $1`, [tx_hash]
  );
  if (existing.length > 0) return res.status(400).json({ error: 'Transaction already used' });

  // Get package
  const { rows: pkgs } = await pool.query(
    `SELECT * FROM power_packages WHERE id = $1 AND is_active = TRUE`, [package_id]
  );
  if (!pkgs.length) return res.status(404).json({ error: 'Package not found' });

  const pkg = pkgs[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Record purchase
    await client.query(
      `INSERT INTO purchases (user_id, package_id, power_amount, ton_paid, tx_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, pkg.id, pkg.power_amount, pkg.price_ton, tx_hash]
    );

    // Add power to user
    await client.query(
      `UPDATE users SET power = power + $1 WHERE id = $2`,
      [pkg.power_amount, user.id]
    );

    // Referral commission 15%
    const { rows: refRows } = await client.query(
      `SELECT referrer_id FROM referrals WHERE referee_id = $1`, [user.id]
    );
    if (refRows.length > 0) {
      const commission = parseFloat(pkg.price_ton) * 0.15;
      await client.query(
        `UPDATE users SET ton_balance = ton_balance + $1 WHERE id = $2`,
        [commission, refRows[0].referrer_id]
      );
      await client.query(
        `INSERT INTO referral_rewards (referrer_id, referee_id, reward_type, ton_amount)
         VALUES ($1, $2, 'commission', $3)`,
        [refRows[0].referrer_id, user.id, commission]
      );

      // Confirm referral
      await client.query(
        `UPDATE referrals SET is_confirmed = TRUE WHERE referee_id = $1`, [user.id]
      );

      // Give power bonus to referrer if not already given
      const { rows: prevReward } = await client.query(
        `SELECT id FROM referral_rewards 
         WHERE referrer_id = $1 AND referee_id = $2 AND reward_type = 'power'`,
        [refRows[0].referrer_id, user.id]
      );
      if (!prevReward.length) {
        const powerBonus = user.is_premium ? 6000 : 3000;
        await client.query(
          `UPDATE users SET power = power + $1 WHERE id = $2`,
          [powerBonus, refRows[0].referrer_id]
        );
        await client.query(
          `INSERT INTO referral_rewards (referrer_id, referee_id, reward_type, power_amount)
           VALUES ($1, $2, 'power', $3)`,
          [refRows[0].referrer_id, user.id, powerBonus]
        );
      }
    }

    await client.query('COMMIT');

    const { rows: updated } = await pool.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
    res.json({ success: true, user: updated[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Purchase failed' });
  } finally {
    client.release();
  }
});

export default router;
